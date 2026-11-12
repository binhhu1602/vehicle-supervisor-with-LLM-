# 05 · Kế hoạch dự án

> Áp dụng **Chương 2 – Quy trình phần mềm**, **Chương 3 – Phát triển linh hoạt (Scrum)** và **Chương 22 – Quản lý dự án** (lập kế hoạch, quản lý rủi ro).

## 1. Mô hình quy trình

Phát triển **tăng dần (incremental) theo Scrum**, sprint 2 tuần. Giai đoạn đầu dùng **prototype** (bộ giả lập dữ liệu + LLM giả lập) để frontend và backend phát triển song song dựa trên hợp đồng giao tiếp tại `03-kien-truc.md`.

## 2. Product backlog & lộ trình sprint

| Sprint | Mục tiêu | Hạng mục | Trạng thái |
|---|---|---|---|
| S1 | Nền tảng frontend | Khung dự án, kiến trúc phân tầng, đăng nhập/phân quyền, bộ giả lập realtime, Tổng quan | ✅ Hoàn thành |
| S1 | Tính năng giám sát | Bản đồ, Camera, Sự cố + máy trạng thái, thông báo | ✅ Hoàn thành |
| S1 | Tích hợp LLM (FE) | Trợ lý AI streaming, phân tích sự cố, tóm tắt, báo cáo AI | ✅ Hoàn thành (provider giả lập) |
| S2–S3 | Backend | FastAPI, REST auth/JWT, WebSocket gateway theo hợp đồng, PostgreSQL + Alembic | ✅ Hoàn thành |
| S4 | LLM gateway | `/api/llm/*` gọi Claude, SSE streaming, giới hạn tần suất, bộ dự phòng | ✅ Hoàn thành |
| S4 | Dữ liệu | CSDL PostgreSQL, báo cáo tổng hợp; TimescaleDB lưu dài hạn để sau | ✅ / ⏳ |
| S3 | AI Vision | Tích hợp mô hình nhận diện (vd. YOLO) từ luồng camera thật | ⏳ |
| S4–S5 | Hoàn thiện | Docker Compose ✅; CI (GitHub Actions), E2E (Playwright) ⏳ |

**Definition of Done**: chạy được, có test cho logic mới, `npm test` và `npm run build` thành công, đã review, cập nhật tài liệu nếu đổi hợp đồng.

## 3. Quản lý rủi ro

| Rủi ro | Loại | Khả năng | Tác động | Biện pháp |
|---|---|---|---|---|
| Backend chậm tiến độ, FE bị chặn | Dự án | Cao | Cao | Bộ giả lập cùng giao diện; hợp đồng WS/REST viết trước |
| LLM “bịa” số liệu (hallucination) | Sản phẩm | Trung bình | Cao | Grounding bằng ngữ cảnh, system prompt ràng buộc, nhãn “chỉ tham khảo”, con người ra quyết định |
| Chi phí/độ trễ gọi LLM cao | Sản phẩm | Trung bình | Trung bình | Giới hạn lịch sử hội thoại, ngữ cảnh rút gọn, streaming, cache tóm tắt ở backend |
| Lộ API key LLM | Bảo mật | Thấp | Rất cao | Key chỉ ở backend, biến môi trường server |
| Mất kết nối mạng tại trung tâm | Kỹ thuật | Trung bình | Cao | Tự kết nối lại, cảnh báo “Dữ liệu chậm” trên UI |
| Hiệu năng khi số camera tăng (>100) | Kỹ thuật | Trung bình | Trung bình | Chỉ vẽ camera đang hiển thị; phân trang; gom nhóm marker bản đồ |
| Quyền riêng tư hình ảnh | Pháp lý | Trung bình | Cao | LLM chỉ nhận số liệu tổng hợp, không nhận hình ảnh/biển số |

## 4. Phân công đề xuất

| Thành viên | Vai trò |
|---|---|
| Frontend dev | Giao diện React, tích hợp WS/LLM, kiểm thử UI |
| Backend dev | API, WebSocket gateway, CSDL, LLM gateway |
| AI/Data | AI Vision, chất lượng prompt, đánh giá câu trả lời LLM |
| Scrum Master / Tester | Điều phối sprint, kiểm thử hệ thống & phát hành |

Chi tiết product backlog, sprint và retrospective của backend: [06-backend-agile.md](06-backend-agile.md).
