/** Dữ liệu mẫu dùng chung cho các bài kiểm thử. */
export const camera = (over = {}) => ({
  id: 'CAM-01',
  name: 'Cầu Rồng – Bạch Đằng',
  district: 'Hải Châu',
  lat: 16.06,
  lng: 108.22,
  lanes: 4,
  baseFlow: 80,
  ...over,
});

export const metric = (over = {}) => ({
  cameraId: 'CAM-01',
  ts: 1_700_000_000_000,
  online: true,
  flow: 60,
  avgSpeed: 30,
  occupancy: 0.4,
  level: 1,
  vehicles: { motorbike: 40, car: 12, truck: 4, bus: 4 },
  ...over,
});

export const incident = (over = {}) => ({
  id: 'INC-1',
  type: 'ACCIDENT',
  severity: 'HIGH',
  status: 'NEW',
  cameraId: 'CAM-01',
  cameraName: 'Cầu Rồng – Bạch Đằng',
  district: 'Hải Châu',
  location: { lat: 16.06, lng: 108.22 },
  description: 'Va chạm',
  confidence: 0.9,
  snapshot: { flow: 60, avgSpeed: 20, level: 2 },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  timeline: [],
  ...over,
});

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32) → kiểm thử tất định. */
export function seededRng(seed = 42) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
