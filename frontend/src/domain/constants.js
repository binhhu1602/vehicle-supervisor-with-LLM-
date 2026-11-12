/**
 * Tầng Domain: các khái niệm nghiệp vụ của hệ thống giám sát giao thông.
 * Không phụ thuộc React hay bất kỳ thư viện UI nào.
 */

export const CONGESTION_LEVELS = Object.freeze({
  0: { key: 0, label: 'Thông thoáng', color: 'var(--tl-green)', short: 'Thoáng' },
  1: { key: 1, label: 'Đông xe', color: 'var(--tl-yellow)', short: 'Đông' },
  2: { key: 2, label: 'Ùn ứ', color: 'var(--tl-amber)', short: 'Ùn ứ' },
  3: { key: 3, label: 'Ùn tắc nghiêm trọng', color: 'var(--tl-red)', short: 'Tắc' },
});

export const VEHICLE_TYPES = Object.freeze({
  motorbike: { label: 'Xe máy', color: 'var(--series-1)' },
  car: { label: 'Ô tô', color: 'var(--series-2)' },
  truck: { label: 'Xe tải', color: 'var(--series-3)' },
  bus: { label: 'Xe buýt', color: 'var(--series-4)' },
});

export const INCIDENT_TYPES = Object.freeze({
  // icon: tên icon SVG trong components/common/Icon.jsx; code: ký hiệu ngắn cho ghim bản đồ
  ACCIDENT: { label: 'Tai nạn giao thông', icon: 'alert', code: 'TN' },
  CONGESTION: { label: 'Ùn tắc kéo dài', icon: 'car', code: 'UT' },
  WRONG_WAY: { label: 'Đi ngược chiều', icon: 'noEntry', code: 'NC' },
  RED_LIGHT: { label: 'Vượt đèn đỏ', icon: 'traffic', code: 'ĐĐ' },
  STALLED_VEHICLE: { label: 'Phương tiện chết máy', icon: 'tool', code: 'CM' },
  CAMERA_OFFLINE: { label: 'Mất tín hiệu camera', icon: 'cameraOff', code: 'CAM' },
});

export const SEVERITY = Object.freeze({
  LOW: { label: 'Thấp', rank: 1 },
  MEDIUM: { label: 'Trung bình', rank: 2 },
  HIGH: { label: 'Cao', rank: 3 },
  CRITICAL: { label: 'Khẩn cấp', rank: 4 },
});

export const INCIDENT_STATUS = Object.freeze({
  NEW: 'NEW',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  FALSE_ALARM: 'FALSE_ALARM',
});

export const INCIDENT_STATUS_LABEL = Object.freeze({
  NEW: 'Mới',
  ACKNOWLEDGED: 'Đã tiếp nhận',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã xử lý',
  FALSE_ALARM: 'Báo động giả',
});

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  OPERATOR: 'OPERATOR',
  VIEWER: 'VIEWER',
});

export const ROLE_LABEL = Object.freeze({
  ADMIN: 'Quản trị viên',
  OPERATOR: 'Điều hành viên',
  VIEWER: 'Người xem',
});

/** Sự kiện thời gian thực trao đổi giữa nguồn dữ liệu và ứng dụng (hợp đồng với backend). */
export const REALTIME_EVENTS = Object.freeze({
  CONNECTION: 'connection:status',
  SNAPSHOT: 'traffic:snapshot',
  METRICS: 'metrics:update',
  INCIDENT_NEW: 'incident:new',
  INCIDENT_UPDATE: 'incident:update',
  CAMERA_FRAME: 'camera:frame', // có khung hình thật mới từ AI Vision (chỉ mốc thời gian)
  CAMERA_STATUS: 'camera:status',
});
