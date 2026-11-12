# 07 · Thiết kế cơ sở dữ liệu (PostgreSQL 17)

> Lược đồ được quản lý phiên bản bằng **Alembic** (`backend/alembic/versions`). Không sửa CSDL bằng tay.

## 1. Sơ đồ thực thể – quan hệ (ERD)

```mermaid
erDiagram
  users ||--o{ incident_events : "thực hiện"
  users ||--o{ llm_requests : "gọi"
  cameras ||--o{ traffic_metrics : "đo"
  cameras ||--o{ incidents : "phát hiện tại"
  incidents ||--o{ incident_events : "có lịch sử"

  users {
    int id PK
    varchar username UK
    text password_hash "bcrypt"
    varchar full_name
    varchar role "ADMIN|OPERATOR|VIEWER"
    bool is_active
    timestamptz last_login_at
  }
  cameras {
    varchar id PK "CAM-01"
    varchar name
    varchar district
    float lat
    float lng
    smallint lanes
    int base_flow
    varchar layout "crossroad|interchange"
  }
  traffic_metrics {
    bigint id PK
    varchar camera_id FK
    timestamptz ts
    bool online
    int flow "xe/phút"
    float avg_speed "km/h"
    float occupancy "0..1"
    smallint level "0..3"
    int motorbike
    int car
    int truck
    int bus
  }
  incidents {
    varchar id PK "INC-1001 (sequence)"
    varchar type
    varchar severity
    varchar status
    varchar camera_id FK
    text description
    float confidence
    jsonb snapshot
    jsonb ai_analysis "cache kết quả LLM"
    timestamptz created_at
    timestamptz updated_at
  }
  incident_events {
    bigint id PK
    varchar incident_id FK
    timestamptz at
    varchar action
    varchar from_status
    varchar to_status
    varchar actor
    int actor_id FK
    text note
  }
  app_settings {
    varchar key PK
    jsonb value
    varchar updated_by
  }
  llm_requests {
    bigint id PK
    int user_id FK
    varchar kind "chat|analyze|summarize"
    varchar provider
    varchar model
    int input_tokens
    int output_tokens
    int latency_ms
    varchar status
  }
```

## 2. Ràng buộc toàn vẹn

| Bảng | Ràng buộc | Mục đích |
|---|---|---|
| users | `UNIQUE(username)`, `CHECK role IN (...)` | Không trùng tài khoản, vai trò hợp lệ |
| cameras | `CHECK layout IN ('crossroad','interchange')` | Loại nút giao hợp lệ |
| traffic_metrics | `CHECK level BETWEEN 0 AND 3`, `occupancy BETWEEN 0 AND 1`, `flow, avg_speed >= 0` | Số liệu hợp lệ dù ghi từ nguồn nào |
| incidents | `CHECK` cho type/severity/status/confidence, FK → cameras | Trạng thái sự cố luôn thuộc máy trạng thái |
| incident_events | FK → incidents `ON DELETE CASCADE`, FK → users `ON DELETE SET NULL` | Giữ lịch sử kể cả khi xóa tài khoản |

## 3. Chỉ mục (index) theo truy vấn thực tế

| Index | Truy vấn phục vụ |
|---|---|
| `ix_metrics_camera_ts (camera_id, ts DESC)` | Số liệu gần nhất của 1 camera, lịch sử theo camera |
| `ix_metrics_ts (ts)` | Gộp theo phút/giờ cho biểu đồ & báo cáo, dọn dữ liệu cũ |
| `ix_incidents_status`, `ix_incidents_created_at DESC` | Danh sách sự cố đang mở, mới nhất trước |
| `ix_incident_events_incident (incident_id, at)` | Dòng thời gian xử lý của sự cố |
| `ix_llm_requests_created_at` | Thống kê chi phí LLM theo thời gian |

## 4. Khối lượng dữ liệu & lưu trữ

- 8 camera × 1 bản ghi / 2 giây ≈ **345.600 dòng/ngày** ở `traffic_metrics`.
- Tác vụ nền xóa số liệu chi tiết cũ hơn `METRICS_RETENTION_DAYS` (mặc định 7 ngày) mỗi giờ.
- Hướng mở rộng (BE-18): chuyển `traffic_metrics` thành hypertable **TimescaleDB** + continuous aggregate theo giờ/ngày để lưu dài hạn.

## 5. Vận hành

```bash
docker compose up -d db                 # PostgreSQL 17
cd backend
alembic upgrade head                    # tạo/cập nhật lược đồ
python -m app.db.seed                   # tài khoản demo, camera, ngưỡng (chạy lặp lại an toàn)
alembic revision --autogenerate -m "…"  # khi đổi model – NHỚ rà lại file sinh ra
docker compose --profile tools up -d    # Adminer xem CSDL tại http://localhost:8080
```
