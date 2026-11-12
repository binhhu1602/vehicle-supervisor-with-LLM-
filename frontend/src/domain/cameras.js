/**
 * Danh mục camera/nút giao (dữ liệu gốc). Tọa độ mang tính minh họa tại TP. Đà Nẵng.
 * baseFlow: lưu lượng nền (xe/phút) — dùng cho bộ giả lập.
 */
export const CAMERAS = Object.freeze([
  { id: 'CAM-01', name: 'Cầu Rồng – Bạch Đằng', district: 'Hải Châu', lat: 16.0613, lng: 108.2275, lanes: 6, baseFlow: 95 },
  { id: 'CAM-02', name: 'Cầu Sông Hàn – Lê Duẩn', district: 'Hải Châu', lat: 16.0721, lng: 108.2266, lanes: 4, baseFlow: 80 },
  // Nút giao khác mức: vòng xuyến + cầu vượt + đường dẫn (các nút còn lại là ngã tư có đèn)
  { id: 'CAM-03', name: 'Ngã ba Huế', district: 'Thanh Khê', lat: 16.0647, lng: 108.1716, lanes: 6, baseFlow: 110, layout: 'interchange' },
  { id: 'CAM-04', name: 'Điện Biên Phủ – Nguyễn Tri Phương', district: 'Thanh Khê', lat: 16.0627, lng: 108.1975, lanes: 4, baseFlow: 75 },
  { id: 'CAM-05', name: 'Nguyễn Văn Linh – Hàm Nghi', district: 'Hải Châu', lat: 16.0606, lng: 108.2133, lanes: 4, baseFlow: 85 },
  { id: 'CAM-06', name: 'Cầu Trần Thị Lý', district: 'Sơn Trà', lat: 16.048, lng: 108.23, lanes: 6, baseFlow: 70 },
  { id: 'CAM-07', name: 'Võ Nguyên Giáp – Phạm Văn Đồng', district: 'Sơn Trà', lat: 16.0718, lng: 108.2464, lanes: 4, baseFlow: 55 },
  { id: 'CAM-08', name: 'Lê Duẩn – Ông Ích Khiêm', district: 'Hải Châu', lat: 16.071, lng: 108.214, lanes: 4, baseFlow: 65 },
]);

export const CITY_CENTER = Object.freeze([16.0625, 108.212]);
