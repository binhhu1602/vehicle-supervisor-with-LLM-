"""Dịch vụ LLM: chọn provider, giới hạn tần suất, tự chuyển sang bộ dự phòng khi lỗi,
ghi nhật ký chi phí (bảng llm_requests) và cache kết quả phân tích sự cố trong CSDL."""

import logging
import os
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from datetime import UTC, datetime

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.core.errors import NotFoundError, RateLimitedError
from app.repositories import incidents as incidents_repo
from app.repositories import settings as settings_repo
from app.services.mappers import incident_to_dict
from app.services.llm.providers import ClaudeProvider, LlmRefusalError, RuleBasedProvider

log = logging.getLogger("trafficeye.llm")

RECOVERABLE = (anthropic.APIError, LlmRefusalError)


def choose_provider(settings: Settings):
    if settings.llm_provider == "rule_based":
        return RuleBasedProvider()
    if settings.llm_provider == "claude":
        return ClaudeProvider(settings.llm_model)
    # auto: dùng Claude khi môi trường có thông tin xác thực
    if os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"):
        return ClaudeProvider(settings.llm_model)
    return RuleBasedProvider()


class RateLimiter:
    """Cửa sổ trượt 60 giây theo người dùng – kiểm soát chi phí gọi LLM."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self.calls: dict[int, deque[float]] = defaultdict(deque)

    def check(self, user_id: int) -> None:
        now = time.monotonic()
        q = self.calls[user_id]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= self.per_minute:
            raise RateLimitedError(f"Vượt giới hạn {self.per_minute} yêu cầu LLM/phút, vui lòng thử lại sau")
        q.append(now)


class LlmService:
    def __init__(self, settings: Settings, session_factory: async_sessionmaker, provider=None):
        self.settings = settings
        self.session_factory = session_factory
        self.provider = provider or choose_provider(settings)
        self.fallback = RuleBasedProvider()
        self.limiter = RateLimiter(settings.llm_rate_limit_per_minute)

    @property
    def name(self) -> str:
        return "Claude" if self.provider.name == "claude" else "Bộ trả lời theo luật (dự phòng)"

    async def _log(self, user_id: int | None, kind: str, provider: str, usage: dict, started: float, error: str | None = None):
        try:
            async with self.session_factory() as s:
                await settings_repo.log_llm_request(
                    s,
                    user_id=user_id,
                    kind=kind,
                    provider=provider,
                    model=usage.get("model", "unknown"),
                    input_tokens=usage.get("input_tokens", 0),
                    output_tokens=usage.get("output_tokens", 0),
                    latency_ms=int((time.monotonic() - started) * 1000),
                    status="error" if error else usage.get("status", "ok"),
                    error=error,
                )
                await s.commit()
        except Exception as exc:  # nhật ký không được làm hỏng luồng chính
            log.warning("Không ghi được nhật ký LLM: %s", exc)

    async def chat(self, user: dict, messages: list[dict], context: dict) -> AsyncIterator[str]:
        self.limiter.check(user["id"])
        messages = messages[-self.settings.llm_max_history_messages :]
        started = time.monotonic()
        usage: dict = {}
        provider = self.provider
        sent_any = False
        try:
            async for chunk in provider.chat_stream(messages, context, usage):
                sent_any = True
                yield chunk
        except RECOVERABLE as exc:
            log.warning("LLM lỗi (%s), chuyển sang bộ dự phòng", exc)
            await self._log(user["id"], "chat", provider.name, usage, started, error=str(exc)[:500])
            if sent_any:
                yield "\n\n(Kết nối tới mô hình bị gián đoạn.)"
                return
            provider, usage, started = self.fallback, {}, time.monotonic()
            async for chunk in provider.chat_stream(messages, context, usage):
                yield chunk
        await self._log(user["id"], "chat", provider.name, usage, started)

    async def summarize(self, user: dict, context: dict) -> str:
        self.limiter.check(user["id"])
        return await self._call(user, "summarize", lambda p, u: p.summarize(context, u))

    async def analyze_traffic(self, user: dict, data: dict) -> dict:
        """Phân tích lưu lượng: số liệu đã tính sẵn (data['stats']) được trả kèm để giao diện hiển thị."""
        self.limiter.check(user["id"])
        result = await self._call(user, "traffic", lambda p, u: p.analyze_traffic(data, u))
        return {**result, "stats": data["stats"], "series": data["series"], "scope": data["scope"], "dataSource": data["dataSource"]}

    async def analyze(self, session: AsyncSession, user: dict, incident_id: str, context: dict, refresh: bool) -> dict:
        incident = await incidents_repo.get(session, incident_id)
        if incident is None:
            raise NotFoundError(f"Không tìm thấy sự cố {incident_id}")
        if incident.ai_analysis and not refresh:
            return incident.ai_analysis  # đã phân tích trước đó → không tốn thêm token
        self.limiter.check(user["id"])
        data = incident_to_dict(incident)
        result = await self._call(user, "analyze", lambda p, u: p.analyze(data, context, u))
        incident.ai_analysis = result
        incident.ai_analyzed_at = datetime.now(UTC)
        await session.commit()
        return result

    async def _call(self, user: dict, kind: str, fn):
        started, usage = time.monotonic(), {}
        try:
            result = await fn(self.provider, usage)
            await self._log(user["id"], kind, self.provider.name, usage, started)
            return result
        except RECOVERABLE as exc:
            log.warning("LLM lỗi khi %s (%s), dùng bộ dự phòng", kind, exc)
            await self._log(user["id"], kind, self.provider.name, usage, started, error=str(exc)[:500])
            usage = {}
            result = await fn(self.fallback, usage)
            await self._log(user["id"], kind, self.fallback.name, usage, time.monotonic())
            return result
