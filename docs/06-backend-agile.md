# 06 · Phát triển backend theo Agile (Scrum)

> Áp dụng **Chương 3 – Phát triển phần mềm linh hoạt**: làm việc theo sprint ngắn, mỗi sprint giao một phần mềm **chạy được** (increment), ưu tiên phần mềm chạy được hơn tài liệu đồ sộ, đón nhận thay đổi yêu cầu giữa chừng. Kết hợp các thực hành XP: kiểm thử tự động, tích hợp liên tục, refactor, thiết kế đơn giản.

## 1. Tổ chức Scrum

| Vai trò | Trách nhiệm trong dự án |
|---|---|
| Product Owner | Giữ product backlog, sắp ưu tiên theo giá trị cho trung tâm điều hành |
| Scrum Master | Điều phối daily stand-up, sprint review, retrospective; gỡ vướng mắc |
| Development Team | Frontend, backend, AI/Data, kiểm thử – tự tổ chức công việc trong sprint |

- **Sprint:** 2 tuần. **Daily stand-up:** 15 phút (hôm qua làm gì / hôm nay làm gì / vướng gì).
- **Sprint planning:** chọn user story từ backlog theo velocity, tách thành task.
- **Sprint review:** demo increment chạy được cho Product Owner. **Retrospective:** cải tiến quy trình.
- **Ước lượng:** story point theo dãy Fibonacci (1, 2, 3, 5, 8, 13).

## 2. Product backlog – backend

| Mã | User story | SP | Ưu tiên | Sprint | Trạng thái |
|---|---|---|---|---|---|
| BE-01 | Là điều hành viên, tôi muốn **đăng nhập** và chỉ thấy chức năng đúng vai trò | 5 | Must | S2 | ✅ |
| BE-02 | Là đội phát triển, chúng tôi cần **CSDL PostgreSQL có migration** để thay đổi lược đồ an toàn | 5 | Must | S2 | ✅ |
| BE-03 | Là điều hành viên, tôi muốn xem **danh mục camera và số liệu mới nhất** qua API | 3 | Must | S2 | ✅ |
| BE-04 | Là hệ thống AI Vision, tôi muốn **đẩy số liệu & sự cố** vào backend bằng khóa riêng | 5 | Must | S3 | ✅ |
| BE-05 | Là điều hành viên, tôi muốn nhận **dữ liệu thời gian thực qua WebSocket** không cần tải lại | 8 | Must | S3 | ✅ |
| BE-06 | Là điều hành viên, tôi muốn **xử lý sự cố theo quy trình** và mọi người thấy cùng trạng thái | 8 | Must | S3 | ✅ |
| BE-07 | Là đội phát triển, chúng tôi cần **bộ giả lập** đóng vai camera khi chưa có thiết bị | 5 | Should | S3 | ✅ |
| BE-08 | Là điều hành viên, tôi muốn **hỏi trợ lý LLM** và nhận câu trả lời dần dần (streaming) | 8 | Must | S4 | ✅ |
| BE-09 | Là điều hành viên, tôi muốn **LLM phân tích sự cố** (nguyên nhân, tác động, hành động) | 5 | Must | S4 | ✅ |
| BE-10 | Là quản lý, tôi muốn hệ thống **vẫn trả lời khi dịch vụ LLM lỗi/chưa cấu hình** | 3 | Should | S4 | ✅ |
| BE-11 | Là quản trị viên, tôi muốn **theo dõi chi phí token** và giới hạn tần suất gọi LLM | 3 | Should | S4 | ✅ |
| BE-12 | Là lãnh đạo, tôi muốn **báo cáo thống kê** theo nút giao, loại sự cố, theo giờ | 5 | Should | S4 | ✅ |
| BE-13 | Là quản trị viên, tôi muốn **chỉnh ngưỡng phân loại ùn tắc** và áp dụng ngay | 3 | Could | S4 | ✅ |
| BE-14 | Là đội vận hành, chúng tôi muốn **chạy toàn hệ thống bằng Docker Compose** | 3 | Should | S4 | ✅ |
| BE-15 | Là quản trị viên, tôi muốn **quản lý tài khoản** (thêm/khóa, đổi mật khẩu) | 5 | Should | S5 | ⏳ |
| BE-16 | Là điều hành viên, tôi muốn xem **video camera thật** (HLS/WebRTC) thay khung mô phỏng | 13 | Could | S5 | ⏳ |
| BE-17 | Là đội vận hành, chúng tôi muốn **mở rộng nhiều máy chủ** (Redis Pub/Sub cho WebSocket) | 8 | Could | S6 | ⏳ |
| BE-18 | Là quản lý, tôi muốn **lưu trữ số liệu dài hạn** dạng tổng hợp theo giờ/ngày (TimescaleDB) | 8 | Could | S6 | ⏳ |

## 3. Kế hoạch & kết quả từng sprint

### Sprint 2 – Nền tảng backend (13 SP)
**Mục tiêu:** API có xác thực, kết nối PostgreSQL, trả danh mục camera.
- Task: khung FastAPI phân tầng; model SQLAlchemy + migration Alembic; seed; bcrypt + JWT; ma trận quyền; xử lý lỗi thống nhất `{error:{code,message}}`.
- Kiểm chứng: `TestAuth`, `TestPermissions`, `TestSecurity`, `test_cameras_include_layout`.

### Sprint 3 – Thời gian thực & sự cố (26 SP)
**Mục tiêu:** dữ liệu chảy từ nguồn → CSDL → WebSocket; quy trình xử lý sự cố đầy đủ.
- Task: `IngestService` (một đường ống cho cả dữ liệu thật và giả lập); EventBus (Observer); WebSocket gateway có xác thực JWT; máy trạng thái sự cố + khóa dòng `SELECT … FOR UPDATE`; bộ giả lập Python.
- Kiểm chứng: `TestIncidentWorkflow`, `TestWebSocket`, `test_ingest_metrics_requires_key_and_computes_level`, `TestSimulator`.

### Sprint 4 – Trợ lý LLM, báo cáo, đóng gói (35 SP)
**Mục tiêu:** tích hợp LLM an toàn, có dự phòng; báo cáo; chạy bằng Docker.
- Task: provider Claude (streaming SSE, structured outputs, refusal fallback); provider dự phòng theo luật; giới hạn tần suất; nhật ký `llm_requests`; cache phân tích; báo cáo SQL tổng hợp; Dockerfile + Compose.
- Kiểm chứng: `TestLlm`, `TestLlmService`, `TestRuleBased`, `test_history_and_report`, `TestSettings`.

### Velocity

| Sprint | SP cam kết | SP hoàn thành |
|---|---|---|
| S2 | 13 | 13 |
| S3 | 26 | 26 |
| S4 | 35 | 35 |

## 4. Definition of Done (DoD)

Một user story chỉ được coi là **Done** khi:
1. Code chạy được, đã review (Pull Request).
2. Có test tự động cho tiêu chí chấp nhận; `pytest` toàn bộ xanh.
3. Thay đổi CSDL đi kèm migration Alembic (không sửa CSDL bằng tay).
4. Hợp đồng API thay đổi → cập nhật `docs/03-kien-truc.md` và frontend tương ứng.
5. Không lộ bí mật (khóa API, mật khẩu) trong mã nguồn; cấu hình qua biến môi trường.
6. Product Owner chấp nhận ở sprint review.

## 5. Sprint review – increment hiện tại

- Backend chạy với PostgreSQL 17 (Docker), 8 bảng, migration `c4b6e259ac41`.
- **64 test tự động** (43 unit + 21 integration trên PostgreSQL thật) – tất cả đạt.
- Frontend chạy ở chế độ `websocket` + `http` kết nối thẳng backend qua Vite proxy: đăng nhập, WebSocket snapshot + cập nhật mỗi 2 giây, xử lý sự cố, trợ lý LLM.
- Thay đổi yêu cầu đón nhận giữa sprint (Agile): mô phỏng camera theo đúng loại nút giao (ngã tư có đèn, Ngã ba Huế là nút giao khác mức) → thêm thuộc tính `layout` cho camera ở CSDL và API.

## 6. Retrospective

| Tốt | Cần cải thiện | Hành động |
|---|---|---|
| Hợp đồng API viết trước giúp FE/BE làm song song | Môi trường Windows gây lỗi mã hóa ký tự (cp1252) với tiếng Việt | Bật `PYTHONUTF8=1` trong Docker; file cấu hình dùng ASCII |
| Bộ giả lập đi qua đúng đường ống ingest nên test được luồng thật | Alembic autogenerate không sinh `SEQUENCE` | Luôn rà lại migration tự sinh trước khi commit |
| Integration test chạy trên PostgreSQL thật bắt được lỗi SQL sớm | Chưa có CI | Sprint 5: thêm GitHub Actions chạy `pytest` + `vitest` với dịch vụ Postgres |

## 7. Thực hành XP đã áp dụng

- **Test tự động trước khi tích hợp**: mỗi tiêu chí chấp nhận ↔ một test (`tests/integration/test_api.py`).
- **Thiết kế đơn giản**: một tiến trình, EventBus trong bộ nhớ; ghi rõ điểm mở rộng (Redis) khi cần.
- **Refactor liên tục**: tách repository/service/router; domain thuần không phụ thuộc framework.
- **Bàn giao nhỏ, thường xuyên**: mỗi sprint có bản chạy được để demo.
