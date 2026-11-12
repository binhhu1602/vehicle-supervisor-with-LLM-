"""Container phụ thuộc của ứng dụng (dependency injection thủ công).

Tạo một lần lúc khởi động và gắn vào app.state → router/WS/job dùng chung, test có thể thay thế từng phần.
"""

from dataclasses import dataclass, field

from app.core.config import Settings
from app.db.session import Database
from app.realtime.manager import ConnectionManager
from app.services.live_state import LiveState
from app.services.llm.service import LlmService


@dataclass
class Container:
    settings: Settings
    db: Database
    live: LiveState
    llm: LlmService
    ws: ConnectionManager
    background: list = field(default_factory=list)
