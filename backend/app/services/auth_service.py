from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnauthorizedError
from app.core.security import create_access_token, verify_password
from app.repositories import users as users_repo


def user_to_dict(u) -> dict:
    return {"id": u.id, "username": u.username, "name": u.full_name, "role": u.role}


async def login(session: AsyncSession, username: str, password: str) -> dict:
    user = await users_repo.get_by_username(session, username.strip())
    # Cùng một thông báo cho "sai tên" và "sai mật khẩu" → không lộ tài khoản nào tồn tại
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Tên đăng nhập hoặc mật khẩu không đúng")
    await users_repo.touch_last_login(session, user.id)
    await session.commit()
    return {"user": user_to_dict(user), "token": create_access_token(user.id, user.role)}
