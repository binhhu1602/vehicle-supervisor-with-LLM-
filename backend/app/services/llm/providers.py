"""Các nhà cung cấp LLM có CÙNG giao diện (Strategy pattern):

    chat_stream(messages, context, usage) -> AsyncIterator[str]
    analyze(incident, context, usage)     -> dict
    summarize(context, usage)             -> str

`usage` là dict được provider điền (input_tokens, output_tokens, model, status) để ghi nhật ký chi phí.
"""

import json
from collections.abc import AsyncIterator

import anthropic
from pydantic import BaseModel

from app.services.llm import rule_based
from app.services.llm.traffic import rule_based_traffic_analysis
from app.services.llm.prompts import ANALYZE_INSTRUCTIONS, SYSTEM_PROMPT, context_block

# Khi mô hình chính từ chối (refusal) vì bộ lọc an toàn, API tự chạy lại trên mô hình dự phòng phù hợp
FALLBACK_BETA = "server-side-fallback-2026-07-01"


class LlmRefusalError(RuntimeError):
    """Mô hình từ chối trả lời (stop_reason = refusal)."""


class RuleBasedProvider:
    name = "rule_based"

    async def chat_stream(self, messages: list[dict], context: dict, usage: dict) -> AsyncIterator[str]:
        usage.update(model="rule-based", status="ok")
        answer = rule_based.answer_question(messages[-1]["content"], context)
        for token in answer.split(" "):
            yield token + " "

    async def analyze(self, incident: dict, context: dict, usage: dict) -> dict:
        usage.update(model="rule-based", status="ok")
        return rule_based.analyze_incident(incident, context)

    async def summarize(self, context: dict, usage: dict) -> str:
        usage.update(model="rule-based", status="ok")
        return rule_based.summary_answer(context)

    async def analyze_traffic(self, data: dict, usage: dict) -> dict:
        usage.update(model="rule-based", status="ok")
        return {**rule_based_traffic_analysis(data), "model": "rule-based"}


class _Analysis(BaseModel):
    """Lược đồ đầu ra có cấu trúc cho phân tích sự cố (structured outputs)."""

    summary: str
    probable_cause: str
    impact: str
    recommended_actions: list[str]


class _TrafficAnalysis(BaseModel):
    """Lược đồ đầu ra cho phân tích lưu lượng theo thời gian."""

    summary: str
    trend: str
    peaks: list[str]
    anomalies: list[str]
    forecast: str
    recommendations: list[str]


TRAFFIC_INSTRUCTIONS = """Phân tích chuỗi số liệu lưu lượng theo phút trong khối <so_lieu_luu_luong> (trích xuất tự động từ video camera bằng mô hình nhận diện YOLO + bám vết ByteTrack).
Khối <thong_ke> chứa các con số ĐÃ ĐƯỢC TÍNH CHÍNH XÁC: dùng đúng các số này, không tự tính lại hay làm tròn khác đi.
Trả về: summary (2–3 câu), trend (mô tả xu hướng và mức độ ùn tắc), peaks (các thời điểm đỉnh/đáy đáng chú ý), anomalies (các bất thường và khả năng nguyên nhân; để trống nếu không có), forecast (nhận định 15–30 phút tới, nêu rõ là ước tính), recommendations (2–4 hành động điều hành cụ thể cho loại nút giao này).
Viết bằng tiếng Việt."""


def _system() -> list[dict]:
    return [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]


def _record_usage(usage: dict, message) -> None:
    usage.update(
        model=message.model,
        input_tokens=message.usage.input_tokens or 0,
        output_tokens=message.usage.output_tokens or 0,
        status="refusal" if message.stop_reason == "refusal" else "ok",
    )


def _sanitize_history(messages: list[dict]) -> list[dict]:
    """Lịch sử hợp lệ cho Messages API: bắt đầu bằng lượt 'user'."""
    out = [{"role": m["role"], "content": m["content"]} for m in messages]
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


class ClaudeProvider:
    name = "claude"

    def __init__(self, model: str, client: anthropic.AsyncAnthropic | None = None):
        self.model = model
        # Tự đọc thông tin xác thực từ môi trường (ANTHROPIC_API_KEY, …) – không hard-code khóa
        self.client = client or anthropic.AsyncAnthropic()

    async def chat_stream(self, messages: list[dict], context: dict, usage: dict) -> AsyncIterator[str]:
        history = _sanitize_history(messages)
        question = history[-1]["content"]
        # Dữ liệu thời gian thực đặt ở lượt cuối → phần đầu (system + lịch sử) giữ ổn định để cache
        history[-1] = {"role": "user", "content": f"{context_block(context)}\n\nCâu hỏi của điều hành viên: {question}"}
        async with self.client.beta.messages.stream(
            model=self.model,
            max_tokens=16000,
            system=_system(),
            messages=history,
            output_config={"effort": "low"},  # hỏi đáp tức thời: ưu tiên độ trễ thấp
            betas=[FALLBACK_BETA],
            fallbacks="default",
        ) as stream:
            async for text in stream.text_stream:
                yield text
            final = await stream.get_final_message()
        _record_usage(usage, final)
        if final.stop_reason == "refusal":
            yield "\n\nYêu cầu này không thể được trả lời. Vui lòng diễn đạt lại câu hỏi về tình hình giao thông."
        elif final.stop_reason == "max_tokens":
            yield "\n\n(Câu trả lời bị cắt do quá dài.)"

    async def analyze(self, incident: dict, context: dict, usage: dict) -> dict:
        payload = {k: incident[k] for k in ("id", "type", "severity", "status", "cameraId", "cameraName", "description", "confidence", "snapshot")}
        response = await self.client.beta.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=_system(),
            messages=[
                {
                    "role": "user",
                    "content": f"{context_block(context)}\n\n<su_co>\n{json.dumps(payload, ensure_ascii=False)}\n</su_co>\n\n{ANALYZE_INSTRUCTIONS}",
                }
            ],
            output_format=_Analysis,
            output_config={"effort": "medium"},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
        _record_usage(usage, response)
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise LlmRefusalError("Mô hình không trả về phân tích hợp lệ")
        a = response.parsed_output
        return {
            "summary": a.summary,
            "probableCause": a.probable_cause,
            "impact": a.impact,
            "recommendedActions": a.recommended_actions,
            "confidence": incident["confidence"],
            "model": response.model,
        }

    async def analyze_traffic(self, data: dict, usage: dict) -> dict:
        stats = data["stats"]
        meta = {k: data[k] for k in ("scope", "cameraId", "layout", "minutes", "dataSource", "vehicleMixPct")}
        response = await self.client.beta.messages.parse(
            model=self.model,
            max_tokens=16000,
            system=_system(),
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"<thong_tin_nut>\n{json.dumps(meta, ensure_ascii=False)}\n</thong_tin_nut>\n"
                        f"<so_lieu_luu_luong>\n{json.dumps(data['series'], ensure_ascii=False)}\n</so_lieu_luu_luong>\n"
                        f"<thong_ke>\n{json.dumps(stats, ensure_ascii=False)}\n</thong_ke>\n\n{TRAFFIC_INSTRUCTIONS}"
                    ),
                }
            ],
            output_format=_TrafficAnalysis,
            output_config={"effort": "medium"},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
        _record_usage(usage, response)
        if response.stop_reason == "refusal" or response.parsed_output is None:
            raise LlmRefusalError("Mô hình không trả về phân tích lưu lượng hợp lệ")
        return {**response.parsed_output.model_dump(), "model": response.model}

    async def summarize(self, context: dict, usage: dict) -> str:
        response = await self.client.beta.messages.create(
            model=self.model,
            max_tokens=16000,
            system=_system(),
            messages=[
                {
                    "role": "user",
                    "content": f"{context_block(context)}\n\nTóm tắt tình hình giao thông hiện tại trong tối đa 6 gạch đầu dòng, bắt đầu bằng tiêu đề '### Tóm tắt tình hình'.",
                }
            ],
            output_config={"effort": "low"},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
        _record_usage(usage, response)
        if response.stop_reason == "refusal":
            raise LlmRefusalError("Mô hình từ chối tóm tắt")
        return "".join(b.text for b in response.content if b.type == "text")
