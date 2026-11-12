# 01 · Đặc tả yêu cầu phần mềm (SRS)

> Áp dụng **Chương 4 – Kỹ nghệ yêu cầu**: tách yêu cầu người dùng / yêu cầu hệ thống, yêu cầu chức năng / phi chức năng, mỗi yêu cầu có mã định danh để truy vết tới thiết kế và kiểm thử.

## 1. Mục tiêu hệ thống

**TrafficEye** là hệ thống giám sát giao thông thời gian thực cho trung tâm điều hành đô thị:

- Thu thập số liệu từ camera tại các nút giao (lưu lượng, tốc độ, mức chiếm dụng làn, cơ cấu phương tiện).
- Tự động phát hiện sự cố (tai nạn, ùn tắc kéo dài, đi ngược chiều, vượt đèn đỏ, xe chết máy, camera mất tín hiệu).
- Dùng **mô hình ngôn ngữ lớn (LLM)** để tóm tắt tình hình, phân tích sự cố, đề xuất phương án điều hành và trả lời câu hỏi bằng tiếng Việt.

## 2. Các bên liên quan (stakeholders)

| Vai trò | Mô tả | Quyền trong hệ thống |
|---|---|---|
| Quản trị viên (ADMIN) | Quản lý cấu hình, ngưỡng phân tích | Toàn quyền |
| Điều hành viên (OPERATOR) | Trực trung tâm, tiếp nhận và xử lý sự cố | Xem + xử lý sự cố + xuất báo cáo |
| Người xem (VIEWER) | Lãnh đạo, đơn vị phối hợp | Chỉ xem |
| Hệ thống AI Vision | Phân tích video, sinh số liệu và sự cố | Tác nhân ngoài |
| Dịch vụ LLM | Sinh văn bản phân tích | Tác nhân ngoài (qua backend) |

## 3. Yêu cầu chức năng (Functional Requirements)

| Mã | Yêu cầu | Ưu tiên | Màn hình | Trạng thái FE |
|---|---|---|---|---|
| FR-01 | Người dùng đăng nhập bằng tài khoản; hệ thống phân quyền theo vai trò | Must | Đăng nhập | ✅ |
| FR-02 | Hiển thị KPI toàn mạng: tổng lưu lượng, tốc độ TB, chỉ số ùn tắc, số sự cố mở, camera online | Must | Tổng quan | ✅ |
| FR-03 | Cập nhật số liệu **tự động theo thời gian thực** (≤ 2 giây/chu kỳ), không cần tải lại trang | Must | Tất cả | ✅ |
| FR-04 | Biểu đồ xu hướng lưu lượng, tốc độ, chỉ số ùn tắc | Must | Tổng quan, Báo cáo | ✅ |
| FR-05 | Xếp hạng điểm nóng ùn tắc | Must | Tổng quan | ✅ |
| FR-06 | Bản đồ các nút giao, tô màu theo mức ùn tắc, hiển thị vị trí sự cố | Must | Bản đồ | ✅ |
| FR-07 | Xem hình ảnh camera kèm khung nhận diện phương tiện; lọc theo trạng thái/quận/tên | Must | Camera | ✅ (mô phỏng) |
| FR-08 | Danh sách sự cố có lọc theo phạm vi, mức độ, loại, từ khóa | Must | Sự cố | ✅ |
| FR-09 | Xử lý sự cố theo quy trình: Tiếp nhận → Đang xử lý → Hoàn tất / Báo động giả / Mở lại; ghi lịch sử | Must | Sự cố | ✅ |
| FR-10 | Thông báo tức thời khi có sự cố mới, lọc theo mức độ tối thiểu, có âm thanh tùy chọn | Should | Toàn cục | ✅ |
| FR-11 | **LLM** tóm tắt tình hình giao thông hiện tại | Must | Tổng quan | ✅ |
| FR-12 | **LLM** phân tích từng sự cố: nguyên nhân, tác động, hành động đề xuất | Must | Chi tiết sự cố | ✅ |
| FR-13 | **Trợ lý AI** hội thoại, trả lời dạng streaming, có thể dừng | Must | Trợ lý AI | ✅ |
| FR-14 | Báo cáo thống kê theo nút giao, theo loại sự cố; **LLM** tạo báo cáo văn bản | Should | Báo cáo | ✅ |
| FR-15 | Xuất dữ liệu CSV (sự cố, thống kê nút giao) | Should | Sự cố, Báo cáo | ✅ |
| FR-16 | Cấu hình ngưỡng phân loại ùn tắc (chỉ ADMIN), giao diện sáng/tối | Could | Cài đặt | ✅ |

## 4. Yêu cầu phi chức năng (Non-functional Requirements)

| Mã | Loại | Yêu cầu | Cách đáp ứng ở frontend |
|---|---|---|---|
| NFR-01 | Hiệu năng | Dữ liệu mới hiển thị trong ≤ 1 giây sau khi nhận | Reducer thuần + memo selectors; canvas dừng vẽ khi khuất màn hình |
| NFR-02 | Hiệu năng | Trang đầu tải nhanh | Code splitting theo trang, tách vendor chunk |
| NFR-03 | Tin cậy | Tự kết nối lại khi mất WebSocket | Exponential backoff (0.5s → 15s), hàng đợi lệnh |
| NFR-04 | Tin cậy | Lỗi một trang không làm sập ứng dụng | `errorElement` cho từng route |
| NFR-05 | Bảo mật | Không lưu API key LLM ở frontend | Frontend chỉ gọi backend `/api/llm/*` |
| NFR-06 | Bảo mật | Phân quyền theo vai trò | Ma trận quyền `domain/permissions.js` + `RequireAuth` (backend phải kiểm tra lại) |
| NFR-07 | Bảo mật | Chống XSS từ nội dung LLM sinh ra | Markdown renderer tạo phần tử React, không dùng `innerHTML` |
| NFR-08 | An toàn AI | Kết quả AI chỉ mang tính tham khảo; AI chỉ dùng dữ liệu được cung cấp (grounding) | Nhãn cảnh báo trên UI, ngữ cảnh gửi kèm mỗi câu hỏi |
| NFR-09 | Khả dụng | Giao diện tiếng Việt, responsive, hỗ trợ bàn phím, giao diện sáng/tối | CSS variables, media queries, `aria-*` |
| NFR-10 | Bảo trì | Thay nguồn dữ liệu/LLM không phải sửa UI | Adapter + Factory, cấu hình qua `.env` |
| NFR-11 | Chi phí | Giới hạn token gửi LLM | Tối đa 12 lượt hội thoại, ngữ cảnh rút gọn ≤ 20 sự cố |

## 5. User stories & tiêu chí chấp nhận

**US-01 – Theo dõi tình hình** · *Là điều hành viên, tôi muốn thấy tổng quan giao thông cập nhật liên tục để phát hiện sớm điểm ùn tắc.*
- Cho trước đã đăng nhập, khi mở Tổng quan, thì thấy 4 KPI và biểu đồ tự cập nhật mỗi 2 giây.
- Khi một nút chuyển sang mức “Ùn ứ” trở lên, nó xuất hiện đầu danh sách Điểm nóng.

**US-02 – Xử lý sự cố** · *Là điều hành viên, tôi muốn tiếp nhận và cập nhật trạng thái sự cố để mọi người biết sự cố đang được xử lý.*
- Sự cố ở trạng thái Mới chỉ cho phép “Tiếp nhận” hoặc “Báo động giả”.
- Mỗi lần chuyển trạng thái được ghi vào lịch sử kèm người thực hiện, thời điểm, ghi chú.
- Người xem không thấy nút xử lý.

**US-03 – Hỏi trợ lý AI** · *Là điều hành viên, tôi muốn hỏi bằng tiếng Việt “Chỗ nào đang tắc?” để nhận câu trả lời nhanh mà không cần đọc từng bảng số liệu.*
- Câu trả lời dựa trên dữ liệu thời gian thực tại thời điểm hỏi, hiển thị dần (streaming), có thể dừng.

**US-04 – Phân tích sự cố bằng AI** · *Là điều hành viên, khi mở một sự cố, tôi muốn AI gợi ý nguyên nhân và hành động.*
- Bảng phân tích có: tóm tắt, nguyên nhân, tác động, danh sách hành động, mức tin cậy, cảnh báo “chỉ tham khảo”.

**US-05 – Báo cáo** · *Là lãnh đạo, tôi muốn xuất báo cáo để lưu trữ và chia sẻ.*
- Xuất CSV mở đúng tiếng Việt trong Excel (UTF-8 BOM).
