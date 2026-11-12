"""Máy trạng thái Sự cố (Ch05 – State diagram). Cùng quy tắc với frontend.

  NEW ──acknowledge──▶ ACKNOWLEDGED ──start──▶ IN_PROGRESS ──resolve──▶ RESOLVED
   └──────────────falseAlarm (từ 3 trạng thái mở)──────────────────────▶ FALSE_ALARM
  RESOLVED / FALSE_ALARM ──reopen──▶ NEW
"""

from dataclasses import dataclass

from app.domain.constants import IncidentStatus as S


@dataclass(frozen=True)
class Transition:
    sources: tuple[S, ...]
    target: S
    label: str


TRANSITIONS: dict[str, Transition] = {
    "acknowledge": Transition((S.NEW,), S.ACKNOWLEDGED, "Tiếp nhận"),
    "start": Transition((S.ACKNOWLEDGED,), S.IN_PROGRESS, "Bắt đầu xử lý"),
    "resolve": Transition((S.IN_PROGRESS,), S.RESOLVED, "Hoàn tất"),
    "falseAlarm": Transition((S.NEW, S.ACKNOWLEDGED, S.IN_PROGRESS), S.FALSE_ALARM, "Báo động giả"),
    "reopen": Transition((S.RESOLVED, S.FALSE_ALARM), S.NEW, "Mở lại"),
}

OPEN_STATUSES: frozenset[S] = frozenset({S.NEW, S.ACKNOWLEDGED, S.IN_PROGRESS})


class InvalidTransitionError(ValueError):
    """Chuyển trạng thái không hợp lệ (vd. NEW → RESOLVED)."""


def is_open(status: str) -> bool:
    return status in OPEN_STATUSES


def can_transition(status: str, action: str) -> bool:
    t = TRANSITIONS.get(action)
    return t is not None and status in t.sources


def available_actions(status: str) -> list[str]:
    return [a for a in TRANSITIONS if can_transition(status, a)]


def next_status(status: str, action: str) -> S:
    """Trả về trạng thái kế tiếp hoặc ném InvalidTransitionError."""
    if not can_transition(status, action):
        raise InvalidTransitionError(f'Không thể "{action}" khi sự cố đang ở trạng thái {status}')
    return TRANSITIONS[action].target
