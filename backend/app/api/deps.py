"""Dependency dùng chung cho router: container, phiên CSDL, người dùng hiện tại, kiểm tra quyền."""

from collections.abc import AsyncIterator, Callable

import jwt
from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.container import Container
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.domain.permissions import can
from app.repositories import users as users_repo
from app.services.auth_service import user_to_dict

bearer = HTTPBearer(auto_error=False)


def get_container(request: Request) -> Container:
    return request.app.state.container


async def get_session(c: Container = Depends(get_container)) -> AsyncIterator[AsyncSession]:
    async with c.db.session_factory() as session:
        yield session


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if creds is None:
        raise UnauthorizedError("Chưa đăng nhập")
    try:
        claims = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError as exc:
        raise UnauthorizedError("Phiên đăng nhập đã hết hạn") from exc
    except jwt.PyJWTError as exc:
        raise UnauthorizedError("Token không hợp lệ") from exc
    user = await users_repo.get_by_id(session, int(claims["sub"]))
    if user is None or not user.is_active:
        raise UnauthorizedError("Tài khoản không tồn tại hoặc đã bị khóa")
    return user_to_dict(user)


def require(permission: str) -> Callable:
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if not can(user["role"], permission):
            raise ForbiddenError("Bạn không có quyền thực hiện thao tác này")
        return user

    return _check


async def require_ingest_key(x_ingest_key: str = Header(default=""), c: Container = Depends(get_container)) -> None:
    """Hệ thống AI Vision xác thực bằng khóa riêng (machine-to-machine), không dùng tài khoản người."""
    if x_ingest_key != c.settings.ingest_api_key:
        raise UnauthorizedError("Sai khóa ingest")


def require_query_or_bearer(permission: str) -> Callable:
    """Như `require` nhưng chấp nhận thêm token trong query (?token=) – cho thẻ <img>/<video> không gửi được header."""

    async def _check(
        token: str | None = None,
        creds: HTTPAuthorizationCredentials | None = Depends(bearer),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if creds is None and token:
            creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        user = await get_current_user(creds, session)
        if not can(user["role"], permission):
            raise ForbiddenError("Bạn không có quyền thực hiện thao tác này")
        return user

    return _check
