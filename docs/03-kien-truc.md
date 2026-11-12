# 03 · Thiết kế kiến trúc

> Áp dụng **Chương 6 – Thiết kế kiến trúc** (Layered, MVC, Client–Server) và **Chương 7 – Cài đặt** (design patterns, tái sử dụng, quản lý cấu hình).

## 1. Kiến trúc tổng thể: Client–Server

```
┌──────────── Trình duyệt ────────────┐        ┌────────── Server ──────────┐
│ Frontend React + Vite               │  WS    │ Backend FastAPI (Python)   │
│                                     │◀──────▶│  • Realtime gateway (WS)   │
│                                     │  REST  │  • REST API (auth, sự cố)  │
│                                     │◀──────▶│  • LLM gateway (giữ API key)│
└─────────────────────────────────────┘        │  • CSDL lịch sử            │
                                               └────────────────────────────┘
```

## 2. Kiến trúc phân tầng của frontend (Layered)

| Tầng | Thư mục | Trách nhiệm | Phụ thuộc vào |
|---|---|---|---|
| **Presentation (View)** | `pages/`, `components/`, `styles/` | Hiển thị, nhận thao tác người dùng | State, Domain |
| **State (Model + Controller)** | `store/`, `hooks/` | Trạng thái ứng dụng, nối nguồn dữ liệu với UI | Services, Domain |
| **Services** | `services/realtime`, `services/llm`, `services/api` | Giao tiếp bên ngoài (WS, HTTP, LLM), bộ giả lập | Domain |
| **Domain** | `domain/` | Quy tắc nghiệp vụ thuần: máy trạng thái, phân quyền, phân loại ùn tắc | — |
| **Config** | `config/env.js` | Điểm đọc cấu hình duy nhất | — |

Quy tắc: tầng trên chỉ gọi tầng dưới; **Domain không import React** → kiểm thử đơn vị dễ, tái sử dụng được cho backend.

## 3. Ánh xạ MVC

- **Model**: `trafficReducer` + `selectors` (dữ liệu và cách suy ra dữ liệu).
- **View**: các component React — chỉ đọc state và gọi action.
- **Controller**: `TrafficProvider` (nhận sự kiện từ nguồn → `dispatch`; nhận lệnh từ UI → `source.send`).

## 4. Design patterns đã dùng

| Pattern | Vị trí | Lý do |
|---|---|---|
| **Observer** | `EventEmitter`, `source.on(...)`, `useIncidentNotifications` | Nhiều màn hình cùng quan sát một luồng dữ liệu thời gian thực |
| **Adapter** | `MockRealtimeSource`, `WebSocketRealtimeSource` | Hai nguồn khác nhau, cùng một giao diện `connect/disconnect/on/send` |
| **Strategy** | `MockLlmProvider`, `HttpLlmProvider` | Đổi cách gọi LLM mà không sửa UI |
| **Factory** | `createRealtimeSource`, `createLlmService`, `createAuthService` | Chọn cài đặt theo cấu hình `.env` |
| **State machine** | `incidentStateMachine.js` | Quy trình xử lý sự cố rõ ràng, chặn chuyển trạng thái sai |
| **Dependency injection** | `TrafficProvider source=`, `AuthProvider authService=`, `LlmContext` | Tiêm bản giả khi kiểm thử |

## 5. Hợp đồng giao tiếp với backend (để đội backend cài đặt)

### 5.1 WebSocket `/ws?token=<JWT>` — thông điệp `{ "type": string, "payload": any }`

Kết nối không có JWT hợp lệ bị từ chối ngay ở bước bắt tay. Lệnh từ client được kiểm tra quyền; người thực hiện lấy từ token (không tin trường `actor` do client gửi). Lỗi lệnh trả về `{type:"error", payload:{command, message}}`.

| Hướng | type | payload |
|---|---|---|
| S → C | `traffic:snapshot` | `{ cameras: Camera[], metricsHistory: Metric[][], incidents: Incident[] }` (gửi ngay sau khi kết nối) |
| S → C | `metrics:update` | `Metric[]` — một phần tử cho mỗi camera |
| S → C | `incident:new` | `Incident` |
| S → C | `incident:update` | `Incident` (đầy đủ, có `timeline`) |
| C → S | `incident:transition` | `{ id, action, actor, note }` — server kiểm tra quyền + máy trạng thái |
| C → S | `config:thresholds` | `{ jamSpeed, slowSpeed, busySpeed, highOccupancy }` (chỉ ADMIN) |

```ts
Metric   = { cameraId, ts, online, flow, avgSpeed, occupancy, level: 0..3,
             vehicles: { motorbike, car, truck, bus } }
Incident = { id, type, severity, status, cameraId, cameraName, district,
             location: {lat,lng}, description, confidence, snapshot,
             createdAt, updatedAt, timeline: [{at, action, from, to, actor, note}] }
```

### 5.2 REST `VITE_API_BASE_URL`

| Method | Endpoint | Request | Response |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | `{ user: {username,name,role}, token }` |
| POST | `/llm/chat` | `{ messages: [{role,content}] }` (server tự dựng ngữ cảnh) | `text/event-stream`: `data: {"delta":"…"}` … `data: [DONE]` |
| POST | `/llm/analyze-incident` | `{ incident: { id }, refresh? }` | `{ summary, probableCause, impact, recommendedActions[], confidence, model }` |
| POST | `/llm/summarize` | – | `{ text }` |
| GET | `/auth/me` | – | `{ id, username, name, role }` |
| GET | `/cameras` | – | `Camera[]` (có `layout`: `crossroad` \| `interchange`) |
| GET | `/metrics/latest` | – | `Metric[]` mới nhất |
| GET | `/metrics/history?minutes=&cameraId=` | – | gộp theo phút `{ ts, flow, avgSpeed, level }[]` |
| GET | `/incidents?scope=&severity=&type=&q=&limit=&offset=` | – | `{ items, total, limit, offset }` |
| GET | `/incidents/{id}` | – | `Incident` |
| POST | `/incidents/{id}/transition` | `{ action, note }` | `Incident` (409 nếu sai quy trình, 403 nếu không đủ quyền) |
| GET/PUT | `/settings/thresholds` | `{ jamSpeed, slowSpeed, busySpeed, highOccupancy }` | ngưỡng hiện hành (PUT chỉ ADMIN) |
| GET | `/reports/summary?hours=` | – | thống kê theo camera, loại/mức/trạng thái sự cố, chỉ số ùn tắc theo giờ |
| POST | `/ingest/metrics` (header `X-Ingest-Key`) | `MetricIn[]` (`level` có thể bỏ trống – server tự tính) | `202 { accepted }` |
| POST | `/ingest/incidents` (header `X-Ingest-Key`) | `{ type, severity, cameraId, description, confidence, snapshot }` | `201 Incident` |
| GET | `/health` | – | trạng thái CSDL, LLM provider, số client WS |

Lỗi luôn có dạng `{ "error": { "code", "message", "details?" } }` với mã HTTP tương ứng (400/401/403/404/409/422/429/500). Tài liệu OpenAPI tự sinh: `http://localhost:8000/docs`.

System prompt thật nằm ở `backend/app/services/llm/prompts.py`.

## 6. Quyết định kiến trúc quan trọng

1. **API key LLM chỉ ở backend** — frontend không bao giờ gọi trực tiếp nhà cung cấp LLM (NFR-05).
2. **Grounding** — mọi lời gọi LLM gửi kèm ngữ cảnh dữ liệu thời gian thực rút gọn, prompt yêu cầu không bịa số liệu (NFR-08).
3. **Backend là nguồn sự thật** cho trạng thái sự cố; frontend không cập nhật lạc quan (tránh lệch giữa nhiều điều hành viên).
4. **Prototype bằng giả lập** (Ch02 – prototyping): frontend chạy độc lập, trình diễn được ngay; đổi sang backend thật chỉ bằng `.env`.

## 7. Quản lý cấu hình (Ch07)

- Mọi tham số môi trường trong `.env.local` (mẫu: `.env.example`), đọc tập trung tại `config/env.js`.
- `package-lock.json` khóa phiên bản thư viện → build tái lập được.
- Quy ước Git: nhánh `feature/<tên>` → Pull Request → review → `main`; commit theo Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`).

## 8. Kiến trúc backend (FastAPI)

```
backend/app
├── api/            # Tầng trình bày: router REST (routes_core, routes_llm), dependency xác thực/phân quyền
├── realtime/       # WebSocket gateway + ConnectionManager (observer của EventBus)
├── services/       # Nghiệp vụ: auth, incident, ingest, settings, report, live_state (EventBus), llm/
├── repositories/   # Truy cập dữ liệu (SQL) – tách khỏi nghiệp vụ
├── db/             # Model ORM, session, seed;  ../alembic = migration
├── domain/         # Quy tắc thuần: máy trạng thái, phân quyền, phân loại ùn tắc (không phụ thuộc framework)
├── simulation/     # Bộ giả lập "Camera + AI Vision" + tác vụ nền
└── core/           # Cấu hình, bảo mật (bcrypt/JWT), lỗi, container DI
```

**Luồng dữ liệu:** Nguồn (AI Vision qua `/api/ingest/*` hoặc bộ giả lập) → `IngestService` (kiểm tra, tự tính mức ùn tắc) → PostgreSQL → `LiveState` (bộ nhớ) → `EventBus` → WebSocket → mọi trình duyệt.

**Tầng LLM:**

| Thành phần | Vai trò |
|---|---|
| `context.build_context` | Dựng ngữ cảnh từ dữ liệu **server** (không tin context client gửi) – grounding |
| `ClaudeProvider` | Mô hình `claude-opus-5-5` qua Anthropic SDK: chat streaming (effort `low`), phân tích sự cố bằng structured outputs (effort `medium`), bật refusal fallback phía server |
| `RuleBasedProvider` | Bộ trả lời theo luật – dùng khi chưa có khóa API hoặc khi gọi mô hình lỗi |
| `LlmService` | Chọn provider, giới hạn 20 yêu cầu/phút/người, tự chuyển dự phòng, ghi `llm_requests`, cache phân tích trong `incidents.ai_analysis` |

**Đồng thời:** chuyển trạng thái sự cố dùng `SELECT … FOR UPDATE` → hai điều hành viên thao tác cùng lúc vẫn tuần tự, không mất cập nhật.

**Giới hạn hiện tại & hướng mở rộng:** EventBus/LiveState nằm trong một tiến trình → khi chạy nhiều instance cần Redis Pub/Sub (BE-17).
