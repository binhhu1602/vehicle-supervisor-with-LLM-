from contextlib import asynccontextmanager

import anthropic
import httpx2
import pytest

from app.core.config import Settings
from app.core.errors import RateLimitedError
from app.services.llm import rule_based
from app.services.llm.prompts import SYSTEM_PROMPT, context_block
from app.services.llm.providers import RuleBasedProvider
from app.services.llm.service import LlmService, RateLimiter, choose_provider

CTX = {
    "generatedAt": "2026-11-12T08:00:00+00:00",
    "kpis": {"congestionIndex": 48, "totalFlow": 600, "avgSpeed": 24, "openIncidents": 1, "criticalIncidents": 1, "camerasOnline": 2, "camerasTotal": 3},
    "cameras": [
        {"id": "CAM-01", "name": "Cầu Rồng – Bạch Đằng", "district": "Hải Châu", "layout": "crossroad", "online": True, "flow": 70, "avgSpeed": 35, "occupancy": 0.3, "level": 0, "levelLabel": "Thông thoáng"},
        {"id": "CAM-03", "name": "Ngã ba Huế", "district": "Thanh Khê", "layout": "interchange", "online": True, "flow": 110, "avgSpeed": 8, "occupancy": 0.9, "level": 3, "levelLabel": "Ùn tắc nghiêm trọng"},
        {"id": "CAM-08", "name": "Lê Duẩn – Ông Ích Khiêm", "district": "Hải Châu", "layout": "crossroad", "online": False, "flow": 0, "avgSpeed": 0, "occupancy": 0, "level": 0, "levelLabel": "Thông thoáng"},
    ],
    "openIncidents": [
        {"id": "INC-1001", "type": "ACCIDENT", "typeLabel": "Tai nạn giao thông", "severity": "CRITICAL", "severityLabel": "Khẩn cấp", "status": "NEW", "cameraId": "CAM-03", "cameraName": "Ngã ba Huế", "createdAt": 1794449280000, "description": "Va chạm"}
    ],
}
USER = {"id": 1, "name": "Tester", "role": "OPERATOR"}


class TestRuleBased:
    @pytest.mark.parametrize(
        ("question", "intent"),
        [
            ("Có sự cố nào không?", "INCIDENTS"),
            ("Chỗ nào đang ùn tắc", "CONGESTION"),
            ("Đề xuất phương án điều hành", "RECOMMEND"),
            ("Tóm tắt tình hình", "SUMMARY"),
            ("Camera nào mất tín hiệu", "CAMERA_STATUS"),
            ("Tình hình ở Ngã ba Huế?", "CAMERA_DETAIL"),
            ("CAM-01 thế nào", "CAMERA_DETAIL"),
            ("asdfgh", "UNKNOWN"),
        ],
    )
    def test_intent(self, question, intent):
        assert rule_based.detect_intent(question, CTX["cameras"]) == intent

    def test_answers_are_grounded_in_data(self):
        assert "Ngã ba Huế" in rule_based.answer_question("Điểm nào đang ùn tắc?", CTX)
        assert "Khẩn cấp" in rule_based.answer_question("Có sự cố gì không", CTX)
        assert "mất tín hiệu" in rule_based.answer_question("Tình hình Lê Duẩn – Ông Ích Khiêm", CTX)
        assert "khác mức" in rule_based.answer_question("Ngã ba Huế thế nào", CTX)

    def test_analysis_structure(self):
        inc = {"type": "ACCIDENT", "severity": "CRITICAL", "cameraId": "CAM-03", "description": "Va chạm.", "confidence": 0.9}
        r = rule_based.analyze_incident(inc, CTX)
        assert r["recommendedActions"]
        assert "rủi ro đánh giá: cao" in r["summary"]


class TestPrompt:
    def test_system_prompt_is_static(self):
        # System prompt không được chứa dữ liệu động (để prompt caching hoạt động)
        assert "{" not in SYSTEM_PROMPT

    def test_context_block_keeps_vietnamese(self):
        assert "Ngã ba Huế" in context_block(CTX)


class _FailingProvider:
    name = "claude"

    async def chat_stream(self, messages, context, usage):
        raise anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com"))
        yield  # pragma: no cover

    async def summarize(self, context, usage):
        raise anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com"))


class _NullSession:
    def add(self, *_):
        pass

    async def commit(self):
        pass


@asynccontextmanager
async def _null_factory():
    yield _NullSession()


def _service(provider, per_minute=20):
    s = Settings(llm_rate_limit_per_minute=per_minute, llm_provider="rule_based")
    return LlmService(s, _null_factory, provider=provider)


class TestLlmService:
    async def test_falls_back_when_provider_fails(self):
        svc = _service(_FailingProvider())
        text = "".join([c async for c in svc.chat(USER, [{"role": "user", "content": "Tóm tắt tình hình"}], CTX)])
        assert "Tóm tắt tình hình" in text
        assert "Tóm tắt" in await svc.summarize(USER, CTX)

    async def test_rate_limit(self):
        svc = _service(RuleBasedProvider(), per_minute=2)
        await svc.summarize(USER, CTX)
        await svc.summarize(USER, CTX)
        with pytest.raises(RateLimitedError):
            await svc.summarize(USER, CTX)

    def test_rate_limiter_is_per_user(self):
        rl = RateLimiter(1)
        rl.check(1)
        rl.check(2)
        with pytest.raises(RateLimitedError):
            rl.check(1)

    def test_auto_provider_without_credentials(self, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
        assert choose_provider(Settings(llm_provider="auto")).name == "rule_based"
