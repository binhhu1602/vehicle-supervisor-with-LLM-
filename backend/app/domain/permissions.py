"""Ma trận phân quyền theo vai trò – backend là nơi KIỂM TRA THẬT SỰ (frontend chỉ ẩn giao diện)."""

from app.domain.constants import Role

_ALL = frozenset(Role)
_STAFF = frozenset({Role.ADMIN, Role.OPERATOR})

PERMISSIONS: dict[str, frozenset[Role]] = {
    "dashboard:view": _ALL,
    "camera:view": _ALL,
    "incident:view": _ALL,
    "incident:update": _STAFF,
    "assistant:use": _ALL,
    "report:view": _ALL,
    "report:export": _STAFF,
    "settings:edit": frozenset({Role.ADMIN}),
}


def can(role: str | None, permission: str) -> bool:
    if role is None:
        return False
    return role in PERMISSIONS.get(permission, frozenset())
