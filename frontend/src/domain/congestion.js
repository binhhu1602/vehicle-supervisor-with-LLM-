/**
 * Quy tắc phân loại mức độ ùn tắc từ tốc độ trung bình (km/h) và tỉ lệ chiếm dụng làn (0..1).
 * Ngưỡng có thể cấu hình ở trang Cài đặt.
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  jamSpeed: 10, // dưới mức này + chiếm dụng cao → tắc nghiêm trọng
  slowSpeed: 20,
  busySpeed: 30,
  highOccupancy: 0.75,
});

export function congestionLevel({ avgSpeed, occupancy }, t = DEFAULT_THRESHOLDS) {
  if (avgSpeed < t.jamSpeed && occupancy >= t.highOccupancy) return 3;
  if (avgSpeed < t.slowSpeed || occupancy >= t.highOccupancy) return 2;
  if (avgSpeed < t.busySpeed || occupancy >= 0.5) return 1;
  return 0;
}

/** Chỉ số ùn tắc toàn mạng lưới 0..100 — trung bình có trọng số theo lưu lượng. */
export function networkCongestionIndex(metricsList) {
  const list = metricsList.filter(Boolean);
  if (list.length === 0) return 0;
  const totalFlow = list.reduce((s, m) => s + m.flow, 0) || 1;
  const weighted = list.reduce((s, m) => s + (m.level / 3) * m.flow, 0);
  return Math.round((weighted / totalFlow) * 100);
}
