"""Nạp dữ liệu ban đầu: tài khoản demo, danh mục camera, ngưỡng mặc định. Chạy lặp lại an toàn (idempotent).

    python -m app.db.seed
"""

import asyncio

from sqlalchemy.dialects.postgresql import insert

from app.core.security import hash_password
from app.db.models import AppSetting, Camera, User
from app.db.session import Database
from app.domain.cameras import DEFAULT_CAMERAS
from app.domain.congestion import DEFAULT_THRESHOLDS

# Mật khẩu demo chỉ dùng cho môi trường phát triển/trình diễn – đổi trước khi triển khai thật
DEMO_USERS = [
    {"username": "admin", "password": "admin123", "full_name": "Nguyễn Quản Trị", "role": "ADMIN"},
    {"username": "operator", "password": "operator123", "full_name": "Trần Điều Hành", "role": "OPERATOR"},
    {"username": "viewer", "password": "viewer123", "full_name": "Lê Quan Sát", "role": "VIEWER"},
]


async def seed(db: Database) -> None:
    async with db.session_factory() as s:
        for u in DEMO_USERS:
            stmt = insert(User).values(
                username=u["username"], password_hash=hash_password(u["password"]), full_name=u["full_name"], role=u["role"]
            ).on_conflict_do_nothing(index_elements=[User.username])
            await s.execute(stmt)
        for c in DEFAULT_CAMERAS:
            values = {"layout": "crossroad", **c}
            stmt = insert(Camera).values(**values)
            stmt = stmt.on_conflict_do_update(
                index_elements=[Camera.id], set_={k: stmt.excluded[k] for k in values if k != "id"}
            )
            await s.execute(stmt)
        await s.execute(
            insert(AppSetting).values(key="thresholds", value=DEFAULT_THRESHOLDS.model_dump(), updated_by="seed").on_conflict_do_nothing()
        )
        await s.commit()


async def main() -> None:
    db = Database()
    try:
        await seed(db)
        print(f"Đã nạp {len(DEMO_USERS)} tài khoản demo, {len(DEFAULT_CAMERAS)} camera, ngưỡng mặc định.")
    finally:
        await db.dispose()


if __name__ == "__main__":
    asyncio.run(main())
