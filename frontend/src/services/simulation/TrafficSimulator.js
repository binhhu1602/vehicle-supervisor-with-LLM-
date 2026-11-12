import { congestionLevel, DEFAULT_THRESHOLDS } from '../../domain/congestion.js';
import { INCIDENT_STATUS, INCIDENT_TYPES } from '../../domain/constants.js';

/**
 * Bộ giả lập dữ liệu giao thông — thay thế tạm cho pipeline Camera → AI Vision → Backend
 * trong giai đoạn phát triển frontend (prototype – Ch02).
 *
 * rng và now được "tiêm" vào để kiểm thử có tính tất định (deterministic).
 */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Hệ số lưu lượng theo giờ trong ngày (giờ cao điểm sáng/chiều). */
export function timeOfDayFactor(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  const peak = (center, width) => Math.exp(-((h - center) ** 2) / (2 * width ** 2));
  return 0.35 + 0.9 * peak(7.5, 1.1) + 0.95 * peak(17.5, 1.3) + 0.35 * peak(12, 1.5);
}

const INCIDENT_WEIGHTS = [
  ['RED_LIGHT', 34],
  ['WRONG_WAY', 18],
  ['STALLED_VEHICLE', 18],
  ['ACCIDENT', 14],
  ['CAMERA_OFFLINE', 6],
];

const DESCRIPTIONS = {
  ACCIDENT: (c) => `Phát hiện va chạm giữa các phương tiện tại ${c.name}. Một làn đường bị chiếm dụng.`,
  CONGESTION: (c) => `Tốc độ trung bình tại ${c.name} giảm sâu và duy trì trong nhiều chu kỳ liên tiếp.`,
  WRONG_WAY: (c) => `Phương tiện di chuyển ngược chiều tại ${c.name}.`,
  RED_LIGHT: (c) => `Phương tiện vượt đèn đỏ tại ${c.name}. Đã lưu ảnh biển số.`,
  STALLED_VEHICLE: (c) => `Phương tiện dừng bất thường quá 3 phút tại ${c.name}.`,
  CAMERA_OFFLINE: (c) => `Mất tín hiệu video từ camera ${c.id} (${c.name}).`,
};

const SEVERITY_BY_TYPE = {
  ACCIDENT: ['HIGH', 'CRITICAL'],
  CONGESTION: ['MEDIUM', 'HIGH'],
  WRONG_WAY: ['MEDIUM', 'HIGH'],
  RED_LIGHT: ['LOW', 'MEDIUM'],
  STALLED_VEHICLE: ['MEDIUM', 'MEDIUM'],
  CAMERA_OFFLINE: ['MEDIUM', 'HIGH'],
};

export class TrafficSimulator {
  constructor({ cameras, rng = Math.random, now = () => Date.now(), tickMs = 2000, thresholds = DEFAULT_THRESHOLDS }) {
    this.cameras = cameras;
    this.rng = rng;
    this.now = now;
    this.tickMs = tickMs;
    this.thresholds = { ...thresholds };
    this.incidentSeq = 1000;
    this.state = new Map(
      cameras.map((c) => [
        c.id,
        { flow: c.baseFlow * 0.8, jamTicks: 0, offlineTicks: 0, congestedStreak: 0, congestionReported: false },
      ]),
    );
  }

  setThresholds(t) {
    this.thresholds = { ...this.thresholds, ...t };
  }

  #pick(items) {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.rng() * total;
    for (const [v, w] of items) {
      if ((r -= w) <= 0) return v;
    }
    return items[items.length - 1][0];
  }

  #noise(scale) {
    return (this.rng() - 0.5) * 2 * scale;
  }

  #createIncident(type, camera, metric, at) {
    const [lo, hi] = SEVERITY_BY_TYPE[type];
    const severity = this.rng() < 0.5 ? lo : hi;
    this.incidentSeq += 1;
    return {
      id: `INC-${this.incidentSeq}`,
      type,
      severity,
      status: INCIDENT_STATUS.NEW,
      cameraId: camera.id,
      cameraName: camera.name,
      district: camera.district,
      location: { lat: camera.lat, lng: camera.lng },
      description: DESCRIPTIONS[type](camera),
      confidence: Number((0.72 + this.rng() * 0.27).toFixed(2)),
      snapshot: { flow: metric.flow, avgSpeed: metric.avgSpeed, level: metric.level },
      createdAt: at,
      updatedAt: at,
      timeline: [{ at, action: 'detected', from: null, to: INCIDENT_STATUS.NEW, actor: 'AI Vision', note: '' }],
    };
  }

  /** Sinh một chu kỳ dữ liệu. Trả về { metrics, incidents }. */
  tick(at = this.now()) {
    const tod = timeOfDayFactor(new Date(at));
    const metrics = [];
    const incidents = [];

    for (const cam of this.cameras) {
      const s = this.state.get(cam.id);
      const online = s.offlineTicks <= 0;
      if (s.offlineTicks > 0) s.offlineTicks -= 1;

      const target = cam.baseFlow * tod * (1 + this.#noise(0.15));
      s.flow = clamp(s.flow + (target - s.flow) * 0.25 + this.#noise(4), 5, cam.baseFlow * 2);

      const capacity = cam.lanes * 22;
      let occupancy = clamp(s.flow / capacity + this.#noise(0.04), 0.03, 0.98);
      if (s.jamTicks > 0) {
        occupancy = clamp(occupancy + 0.35, 0, 0.98);
        s.jamTicks -= 1;
      }
      const avgSpeed = Math.round(clamp(52 * (1 - occupancy ** 1.6) + this.#noise(3), 3, 60));
      const level = congestionLevel({ avgSpeed, occupancy }, this.thresholds);

      const flow = Math.round(s.flow);
      const mb = 0.68 + this.#noise(0.05);
      const car = 0.2 + this.#noise(0.03);
      const truck = 0.06 + this.#noise(0.02);
      const vehicles = {
        motorbike: Math.round(flow * mb),
        car: Math.round(flow * car),
        truck: Math.max(0, Math.round(flow * truck)),
        bus: Math.max(0, Math.round(flow * (1 - mb - car - truck))),
      };

      const metric = {
        cameraId: cam.id,
        ts: at,
        online,
        flow: online ? flow : 0,
        avgSpeed: online ? avgSpeed : 0,
        occupancy: online ? Number(occupancy.toFixed(2)) : 0,
        level: online ? level : 0,
        vehicles: online ? vehicles : { motorbike: 0, car: 0, truck: 0, bus: 0 },
      };
      metrics.push(metric);

      // Phát hiện ùn tắc kéo dài (3 chu kỳ liên tiếp ở mức ≥ 2)
      if (online && level >= 2) {
        s.congestedStreak += 1;
        if (s.congestedStreak >= 3 && !s.congestionReported) {
          s.congestionReported = true;
          incidents.push(this.#createIncident('CONGESTION', cam, metric, at));
        }
      } else {
        s.congestedStreak = 0;
        s.congestionReported = false;
      }
    }

    // Sự cố ngẫu nhiên: xác suất ~8%/chu kỳ trên toàn mạng
    if (this.rng() < 0.08) {
      const type = this.#pick(INCIDENT_WEIGHTS);
      const cam = this.cameras[Math.floor(this.rng() * this.cameras.length)];
      const s = this.state.get(cam.id);
      if (type === 'ACCIDENT' || type === 'STALLED_VEHICLE') s.jamTicks = type === 'ACCIDENT' ? 12 : 6;
      if (type === 'CAMERA_OFFLINE') s.offlineTicks = 8;
      const metric = metrics.find((m) => m.cameraId === cam.id);
      incidents.push(this.#createIncident(type, cam, metric, at));
    }

    return { metrics, incidents };
  }

  /** Chạy "ngược thời gian" để có sẵn lịch sử khi mở ứng dụng. */
  warmup(ticks) {
    const end = this.now();
    const out = [];
    for (let i = ticks; i > 0; i -= 1) {
      out.push(this.tick(end - i * this.tickMs));
    }
    return out;
  }
}

export const INCIDENT_TYPE_KEYS = Object.keys(INCIDENT_TYPES);
