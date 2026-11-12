# 04 · Kế hoạch & kết quả kiểm thử

> Áp dụng **Chương 8 – Kiểm thử phần mềm**: kiểm thử đơn vị → thành phần → hệ thống; kiểm thử phân hoạch (partition) và theo hướng dẫn (guideline-based); kiểm thử phát hành (release testing).

## 1. Chiến lược

| Mức | Công cụ | Đối tượng | File |
|---|---|---|---|
| Unit | Vitest | Domain: máy trạng thái, phân quyền, phân loại ùn tắc | `src/domain/__tests__/domain.test.js` |
| Unit | Vitest | Services: EventEmitter, Simulator, Mock/WS source, LLM mock | `src/services/__tests__/*.test.js` |
| Unit | Vitest | Store: reducer, selectors, bộ lọc, kiểm tra nhập liệu, CSV | `src/store/__tests__/store.test.js` |
| Component | Testing Library | StatCard, Markdown (chống XSS), Badges, HotspotList, Login | `src/components/__tests__/components.test.jsx` |
| System (smoke) | Testing Library | Toàn ứng dụng: đăng nhập → duyệt mọi trang → hỏi AI | `src/__tests__/app.smoke.test.jsx` |
| Thủ công | Trình duyệt | Bản đồ Leaflet, canvas camera, giao diện sáng/tối, responsive | Checklist mục 4 |

Kỹ thuật đáng chú ý:
- **Bộ sinh ngẫu nhiên có hạt giống** (`seededRng`) → bộ giả lập cho kết quả tất định, kiểm thử lặp lại được.
- **Fake timers** để kiểm thử luồng thời gian thực và tự kết nối lại mà không phải chờ thật.
- **Fake WebSocket** được tiêm qua constructor.

## 2. Ma trận truy vết yêu cầu → kiểm thử

| Yêu cầu | Ca kiểm thử |
|---|---|
| FR-01, NFR-06 | Phân quyền (3 ca), Trang đăng nhập (3 ca) |
| FR-02, FR-05 | selectors – tính KPI; HotspotList sắp xếp & ẩn offline |
| FR-03, NFR-03 | MockRealtimeSource phát định kỳ; StrictMode không nhân đôi; WS tự kết nối lại |
| FR-08 | Lọc sự cố theo phạm vi/mức độ/từ khóa |
| FR-09 | Máy trạng thái: luồng chính, chặn bỏ bước, bất biến, hành động khả dụng |
| FR-11…13, NFR-08 | Nhận diện ý định (7 ca), câu trả lời dựa trên dữ liệu, streaming, hủy giữa chừng |
| FR-15 | CSV có BOM, thoát dấu phẩy/ngoặc kép |
| FR-16 | Kiểm tra ngưỡng hợp lệ/không hợp lệ |
| NFR-07 | Markdown không chèn thẻ `<script>` |

## 3. Kết quả (lần chạy gần nhất)

| Phần | Lệnh | Kết quả |
|---|---|---|
| Frontend (Vitest) | `cd frontend && npm test` | 7 file, **64 test đạt** (gồm mô phỏng nút giao: không xe vượt đèn đỏ, vòng xuyến không kẹt cứng) |
| Backend unit (pytest) | `cd backend && pytest tests/unit` | **43 test đạt** |
| Backend integration (pytest + PostgreSQL thật) | `cd backend && pytest tests/integration` | **21 test đạt** – tự tạo DB `trafficeye_test`, chạy migration Alembic, seed |

Integration test backend bao phủ: đăng nhập/401, phân quyền 403, ingest bằng khóa riêng, server tự tính mức ùn tắc, vòng đời sự cố + dòng thời gian, 409 khi sai quy trình, lọc/tìm kiếm, cài đặt ngưỡng (chỉ ADMIN, 422 khi sai thứ tự), chat SSE bám dữ liệu thật, cache phân tích LLM, WebSocket (từ chối token sai, snapshot, phát sự cố mới, lệnh xử lý qua WS với người thực hiện lấy từ token).

## 4. Checklist kiểm thử thủ công (release testing)

- [ ] Đăng nhập bằng 3 tài khoản demo; Người xem không thấy nút xử lý sự cố, không sửa được ngưỡng.
- [ ] Tổng quan: KPI và biểu đồ thay đổi mỗi ~2 giây; nhãn “Trực tuyến” nhấp nháy.
- [ ] Bản đồ: marker đổi màu theo mức ùn tắc; bấm danh sách → bản đồ bay tới nút; ghim sự cố mở được trang Sự cố.
- [ ] Camera: xe chạy chậm/đông hơn ở nút ùn tắc; camera offline hiển thị “MẤT TÍN HIỆU”; tắt/bật khung nhận diện.
- [ ] Sự cố: đi hết luồng Tiếp nhận → Bắt đầu xử lý → Hoàn tất; lịch sử ghi đúng người/ghi chú.
- [ ] Trợ lý AI: câu trả lời hiện dần; nút Dừng hoạt động; “Hỏi AI về nút này” từ camera điền sẵn câu hỏi.
- [ ] Toast xuất hiện khi có sự cố mới mức ≥ cài đặt; bấm toast mở đúng sự cố.
- [ ] Chuyển giao diện sáng/tối; thu nhỏ cửa sổ < 960px → menu thu gọn.
- [ ] Xuất CSV mở đúng tiếng Việt trong Excel.
