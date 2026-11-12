/**
 * Hình học 2D cho mô phỏng nút giao (hệ tọa độ canvas: x sang phải, y xuống dưới).
 * Đường đi (path) = polyline đã lấy mẫu + độ dài tích lũy → tra vị trí theo quãng đường s.
 */

export const v = (x, y) => ({ x, y });
export const add = (a, b) => v(a.x + b.x, a.y + b.y);
export const sub = (a, b) => v(a.x - b.x, a.y - b.y);
export const mul = (a, k) => v(a.x * k, a.y * k);
export const len = (a) => Math.hypot(a.x, a.y);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
/** Hướng bên phải của hướng di chuyển d (giao thông đi bên phải). */
export const rightOf = (d) => v(-d.y, d.x);
export const fromAngle = (a) => v(Math.cos(a), Math.sin(a));

/** Lấy mẫu đường cong Bézier bậc 2. */
export function quad(p0, c, p1, steps = 14) {
  const pts = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const d = t * t;
    pts.push(v(a * p0.x + b * c.x + d * p1.x, a * p0.y + b * c.y + d * p1.y));
  }
  return pts;
}

/** Lấy mẫu cung tròn tâm c, bán kính r, từ góc a0 tới a1 (radian, có thể giảm dần). */
export function arc(c, r, a0, a1, step = 0.12) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step));
  const pts = [];
  for (let i = 1; i <= n; i += 1) pts.push(add(c, mul(fromAngle(a0 + ((a1 - a0) * i) / n), r)));
  return pts;
}

/**
 * Tạo path từ danh sách điểm.
 * opts: { id, layer (0 = mặt đất, 1 = cầu vượt), signal (nhóm đèn), stopAt (quãng đường tới vạch dừng), weight }
 */
export function makePath(points, opts = {}) {
  const pts = points.filter((p, i) => i === 0 || len(sub(p, points[i - 1])) > 0.01);
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  return { layer: 0, weight: 1, ...opts, pts, cum, length: cum[cum.length - 1] };
}

/** Vị trí & hướng trên path tại quãng đường s. `hint` = chỉ số đoạn đã biết để tra nhanh. */
export function pointAt(path, s, hint = 0) {
  const { pts, cum } = path;
  let i = Math.min(Math.max(hint, 0), pts.length - 2);
  while (i < pts.length - 2 && cum[i + 1] < s) i += 1;
  while (i > 0 && cum[i] > s) i -= 1;
  const segLen = cum[i + 1] - cum[i] || 1;
  const t = Math.min(1, Math.max(0, (s - cum[i]) / segLen));
  const a = pts[i];
  const b = pts[i + 1];
  const dir = mul(sub(b, a), 1 / segLen);
  return { pos: v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), dir, seg: i };
}

/** Quãng đường dọc path tới điểm gần p nhất (dùng để đặt vạch dừng). */
export function distanceAlong(path, p) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < path.pts.length - 1; i += 1) {
    const a = path.pts[i];
    const ab = sub(path.pts[i + 1], a);
    const L = len(ab) || 1;
    const t = Math.min(1, Math.max(0, dot(sub(p, a), ab) / (L * L)));
    const q = add(a, mul(ab, t));
    const d = len(sub(p, q));
    if (d < bestD) {
      bestD = d;
      best = path.cum[i] + t * L;
    }
  }
  return best;
}
