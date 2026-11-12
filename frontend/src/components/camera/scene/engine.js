/**
 * Động cơ mô phỏng vi mô (microscopic) cho khung hình camera:
 *  - Xe chạy dọc path, tốc độ tự do tỉ lệ với tốc độ trung bình đo được tại nút.
 *  - Bám xe (car-following): tìm xe phía trước trong "nón nhìn" theo hướng chạy (áp dụng cả
 *    khi nhập làn, đi trong vòng xuyến, cắt ngang khi rẽ trái).
 *  - Đèn tín hiệu: đèn đỏ/vàng (khi còn đủ xa) → coi vạch dừng là vật cản → hình thành hàng chờ.
 *  - Vòng xuyến: xe chuẩn bị nhập vòng nhường xe đang lưu thông trong vòng.
 *  - Gỡ kẹt: xe đứng yên quá lâu không do đèn sẽ được "đi xuyên" một nhịp ngắn.
 * Không phụ thuộc canvas → kiểm thử được bằng Vitest.
 */
import { dot, len, pointAt, sub } from './geometry.js';

export const CLASSES = {
  motorbike: { label: 'Xe máy', l: 8, w: 4, p: 0.66, box: '#3987e5' },
  car: { label: 'Ô tô', l: 15, w: 7.5, p: 0.22, box: '#d95926' },
  truck: { label: 'Xe tải', l: 22, w: 8.5, p: 0.06, box: '#199e70' },
  bus: { label: 'Xe buýt', l: 26, w: 8.5, p: 0.06, box: '#c98500' },
};
const PAINT = ['#e5e7eb', '#cbd5e1', '#94a3b8', '#ef4444', '#3b82f6', '#111827', '#f8fafc', '#a3a3a3', '#fbbf24'];

function pickWeighted(items, weightOf, rng) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = rng() * total;
  for (const it of items) if ((r -= weightOf(it)) <= 0) return it;
  return items[items.length - 1];
}

export class TrafficEngine {
  constructor(scene, { rng = Math.random, maxVehicles = 90 } = {}) {
    this.scene = scene;
    this.rng = rng;
    this.maxVehicles = maxVehicles;
    this.vehicles = [];
    this.spawnAcc = 0;
    this.seq = 0;
    this.time = 0;
  }

  freeSpeed(metric) {
    return 12 + (metric?.avgSpeed ?? 30) * 1.6; // px/giây
  }

  spawn(metric) {
    if (this.vehicles.length >= this.maxVehicles) return;
    const path = pickWeighted(this.scene.paths, (p) => p.weight, this.rng);
    const start = path.pts[0];
    const blocked = this.vehicles.some((x) => x.path.layer === path.layer && x.pos && len(sub(x.pos, start)) < 20);
    if (blocked) return;
    const cls = pickWeighted(Object.keys(CLASSES), (k) => CLASSES[k].p, this.rng);
    this.seq += 1;
    this.vehicles.push({
      id: this.seq,
      path,
      cls,
      s: 0,
      seg: 0,
      v: this.freeSpeed(metric) * 0.7,
      jitter: 0.85 + this.rng() * 0.3,
      conf: 0.8 + this.rng() * 0.19,
      paint: PAINT[Math.floor(this.rng() * PAINT.length)],
      stuck: 0,
      ghost: 0,
      heldBySignal: false,
      ...pointAt(path, 0),
    });
  }

  /** Khoảng trống tới vạch dừng nếu đèn yêu cầu dừng, ngược lại Infinity. */
  signalGap(veh) {
    const { path } = veh;
    const sig = this.scene.signals;
    if (!sig || !path.signal || veh.s >= path.stopAt) return Infinity;
    const state = sig.state(path.signal);
    const toLine = path.stopAt - veh.s;
    const mustStop = state === 'red' || (state === 'yellow' && toLine > 14);
    return mustStop ? toLine - CLASSES[veh.cls].l / 2 : Infinity;
  }

  /** Nhường xe trong vòng xuyến khi sắp nhập vòng. */
  yieldGap(veh) {
    const { path } = veh;
    if (path.yieldUntil === undefined || veh.s > path.yieldUntil || path.yieldUntil - veh.s > 30) return Infinity;
    const entry = pointAt(path, path.yieldUntil + 12).pos;
    const conflict = this.vehicles.some(
      (o) => o !== veh && o.path.layer === 0 && o.path.yieldUntil !== undefined && o.s > o.path.yieldUntil + 14 && o.s < o.path.length - 40 && len(sub(o.pos, entry)) < 24,
    );
    return conflict ? path.yieldUntil - veh.s - CLASSES[veh.cls].l / 2 : Infinity;
  }

  step(dt, metric) {
    this.time += dt;
    this.scene.signals?.advance(dt);

    // Sinh xe theo lưu lượng đo được (xe/phút → xe/giây)
    this.spawnAcc += ((metric?.flow ?? 40) / 60) * dt * (this.scene.spawnScale ?? 1);
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.spawn(metric);
    }

    const vs = this.vehicles;
    // 1) Tìm xe chắn phía trước cho từng xe
    const blockers = vs.map((a) => {
      const res = [];
      if (a.ghost > 0) return res;
      const ca = CLASSES[a.cls];
      const look = ca.l / 2 + 26 + a.v * 0.7;
      for (const b of vs) {
        if (b === a || b.path.layer !== a.path.layer) continue;
        const rel = sub(b.pos, a.pos);
        const ahead = dot(rel, a.dir);
        if (ahead <= 0 || ahead > look) continue;
        const lateral = Math.abs(rel.x * a.dir.y - rel.y * a.dir.x);
        const cb = CLASSES[b.cls];
        if (lateral > (ca.w + cb.w) / 2 + 1.2) continue;
        res.push({ b, gap: ahead - (ca.l + cb.l) / 2 });
      }
      return res;
    });
    const index = new Map(vs.map((x, i) => [x, i]));

    // 2) Cập nhật tốc độ & vị trí
    vs.forEach((a, i) => {
      const free = this.freeSpeed(metric) * a.jitter;
      let vehGap = Infinity;
      let leader = null;
      for (const { b, gap: g } of blockers[i]) {
        // Hai xe chắn nhau (cắt ngang): xe đã đi xa hơn trên hành trình được ưu tiên
        const mutual = blockers[index.get(b)].some((x) => x.b === a);
        if (mutual && a.s / a.path.length > b.s / b.path.length) continue;
        if (g < vehGap) {
          vehGap = g;
          leader = b;
        }
      }
      // Đèn tín hiệu & nhường đường là ràng buộc cứng – không bao giờ bị bỏ qua
      const ctrlGap = Math.min(this.signalGap(a), this.yieldGap(a));
      const gap = Math.min(vehGap, ctrlGap);
      a.heldBySignal = ctrlGap !== Infinity && ctrlGap <= vehGap;
      // Đang chờ hợp lệ: bị đèn giữ, hoặc đứng sau một xe đang chờ (lan truyền dọc hàng xe)
      a.waiting = a.heldBySignal || Boolean(leader?.waiting);

      const target = gap === Infinity ? free : Math.min(free, Math.max(0, (gap - 3) * 2.4));
      a.v += (target - a.v) * Math.min(1, dt * 4);
      if (gap < 1) a.v = 0;
      a.v = Math.max(0, a.v);

      // Gỡ kẹt (chỉ khi kẹt thật, không phải xếp hàng chờ đèn)
      if (a.v < 2 && vehGap !== Infinity && !a.waiting) a.stuck += dt;
      else a.stuck = 0;
      if (a.stuck > 6) {
        a.ghost = 1.2;
        a.stuck = 0;
      }
      if (a.ghost > 0) {
        a.ghost -= dt;
        if (ctrlGap === Infinity) a.v = Math.max(a.v, free * 0.5);
      }
      // Không vượt quá khoảng trống phía trước trong một bước tính
      const limit = a.ghost > 0 ? ctrlGap : gap;
      a.advance = limit === Infinity ? a.v * dt : Math.min(a.v * dt, Math.max(0, limit - 0.5));
    });

    for (const a of vs) {
      a.s += a.advance;
      Object.assign(a, pointAt(a.path, a.s, a.seg));
    }
    const remaining = vs.filter((a) => a.s < a.path.length);
    this.completed = (this.completed ?? 0) + (vs.length - remaining.length);
    this.vehicles = remaining;
  }

  /** Chạy trước vài giây để khung hình đầu tiên đã có xe. */
  warmup(seconds, metric, dt = 0.1) {
    for (let t = 0; t < seconds; t += dt) this.step(dt, metric);
  }

  /** Vẽ xe ở một tầng (0 = mặt đất, 1 = cầu vượt) kèm khung nhận diện AI. */
  draw(ctx, layer, showBoxes) {
    ctx.font = '8.5px system-ui, sans-serif';
    for (const a of this.vehicles) {
      if (a.path.layer !== layer) continue;
      const c = CLASSES[a.cls];
      const angle = Math.atan2(a.dir.y, a.dir.x);
      ctx.save();
      ctx.translate(a.pos.x, a.pos.y);
      ctx.rotate(angle);
      if (a.cls === 'motorbike') {
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-c.l / 2, -1, c.l, 2);
        ctx.fillStyle = a.paint;
        ctx.beginPath();
        ctx.arc(0, 0, 2.2, 0, Math.PI * 2); // người lái (mũ bảo hiểm)
        ctx.fill();
      } else {
        ctx.fillStyle = a.cls === 'bus' ? '#f2c94c' : a.cls === 'truck' ? '#cbd5e1' : a.paint;
        ctx.fillRect(-c.l / 2, -c.w / 2, c.l, c.w);
        ctx.fillStyle = 'rgba(15,23,42,0.75)';
        ctx.fillRect(c.l / 2 - c.l * 0.32, -c.w / 2 + 1, c.l * 0.16, c.w - 2); // kính lái
        if (a.cls === 'truck') {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(-c.l / 2, -c.w / 2, c.l * 0.62, c.w);
        }
      }
      if (a.v < 3 && a.heldBySignal) {
        ctx.fillStyle = '#ff3b30'; // đèn phanh
        ctx.fillRect(-c.l / 2 - 1, -c.w / 2, 1.5, c.w);
      }
      ctx.restore();

      if (!showBoxes) continue;
      // Khung nhận diện: hình chữ nhật bao (axis-aligned) của thân xe đã xoay
      const hx = (Math.abs(Math.cos(angle)) * c.l + Math.abs(Math.sin(angle)) * c.w) / 2 + 1.5;
      const hy = (Math.abs(Math.sin(angle)) * c.l + Math.abs(Math.cos(angle)) * c.w) / 2 + 1.5;
      ctx.strokeStyle = c.box;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(a.pos.x - hx, a.pos.y - hy, 2 * hx, 2 * hy);
      if (a.cls !== 'motorbike') {
        const label = `${c.label} ${a.conf.toFixed(2)}`;
        const tw = ctx.measureText(label).width + 4;
        ctx.fillStyle = c.box;
        ctx.fillRect(a.pos.x - hx, a.pos.y - hy - 10, tw, 10);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, a.pos.x - hx + 2, a.pos.y - hy - 2.5);
      }
    }
  }

  counts() {
    const out = { motorbike: 0, car: 0, truck: 0, bus: 0, queued: 0 };
    for (const a of this.vehicles) {
      out[a.cls] += 1;
      if (a.v < 3) out.queued += 1;
    }
    return out;
  }
}
