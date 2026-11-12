"""API trợ lý LLM. Ngữ cảnh luôn dựng từ dữ liệu SERVER (không tin `context` do client gửi).

POST /api/llm/chat              → text/event-stream: `data: {"delta": "..."}` … `data: [DONE]`
POST /api/llm/analyze-incident  → JSON phân tích có cấu trúc (cache trong CSDL)
POST /api/llm/summarize         → {"text": "..."}
POST /api/llm/analyze-traffic   → phân tích lưu lượng theo thời gian (số liệu do AI Vision trích xuất)
"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_container, get_session, require
from app.core.container import Container
from app.core.errors import AppError
from app.schemas import AnalyzeRequest, ChatRequest, IncidentAnalysis, SummarizeResponse, TrafficAnalysis, TrafficAnalysisRequest
from app.services import incident_service
from app.services.llm.context import build_context
from app.services.llm.traffic import build_traffic_data

router = APIRouter(prefix="/api/llm", tags=["Trợ lý LLM"])


async def _context(c: Container, session: AsyncSession) -> dict:
    return build_context(c.live, await incident_service.list_open(session, limit=50))


def _sse(data: dict | str) -> str:
    body = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return f"data: {body}\n\n"


@router.post("/chat")
async def chat(
    body: ChatRequest,
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require("assistant:use")),
):
    if body.messages[-1].role != "user":
        raise AppError("Tin nhắn cuối phải là câu hỏi của người dùng")
    context = await _context(c, session)
    messages = [m.model_dump() for m in body.messages]
    stream = c.llm.chat(user, messages, context)
    # Lấy đoạn đầu tiên trước khi mở luồng SSE → lỗi giới hạn tần suất trả về đúng mã HTTP 429
    first = await anext(stream, "")

    async def events():
        yield _sse({"delta": first})
        try:
            async for chunk in stream:
                yield _sse({"delta": chunk})
        except Exception:
            yield _sse({"error": "Luồng trả lời bị gián đoạn"})
        yield _sse("[DONE]")

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/analyze-incident", response_model=IncidentAnalysis)
async def analyze_incident(
    body: AnalyzeRequest,
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require("incident:view")),
):
    return await c.llm.analyze(session, user, body.incident.id, await _context(c, session), body.refresh)


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require("dashboard:view")),
):
    return {"text": await c.llm.summarize(user, await _context(c, session))}


@router.post("/analyze-traffic", response_model=TrafficAnalysis)
async def analyze_traffic(
    body: TrafficAnalysisRequest,
    c: Container = Depends(get_container),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require("report:view")),
):
    data = await build_traffic_data(session, c.live, body.camera_id, body.minutes)
    return await c.llm.analyze_traffic(user, data)
