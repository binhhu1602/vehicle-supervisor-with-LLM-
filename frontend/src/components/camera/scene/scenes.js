/**
 * Các loại nút giao được mô phỏng (góc nhìn từ trên cao của camera giám sát):
 *  - crossroad   : ngã tư có đèn tín hiệu, số làn mỗi chiều theo cấu hình camera.
 *  - interchange : nút giao khác mức (Ngã ba Huế) – vòng xuyến + cầu vượt + đường dẫn cong.
 * Giao thông đi bên phải (Việt Nam).
 */
import { add, arc, fromAngle, makePath, mul, quad, rightOf, sub, v } from './geometry.js';
import { SignalController } from './signals.js';

export const W = 480;
export const H = 270;
const LW = 11; // bề rộng 1 làn (px)

const C_ASPHALT = '#3a3f45';
const C_GROUND = '#26302b';
const C_SIDEWALK = '#59615c';
const C_LINE = 'rgba(255,255,255,0.75)';
const C_YELLOW = '#e8b931';

function strokePath(ctx, pts, width, color, { dash = null, cap = 'butt' } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

/* ============================== NGÃ TƯ ============================== */

/**
 * @param {object} o
 * @param {number} o.mainLanes  số làn mỗi chiều của đường chính (trục ngang)
 * @param {number} o.crossLanes số làn mỗi chiều của đường cắt ngang (trục dọc)
 * @param {number} o.signalOffset lệch pha đèn (giây) để các nút không đồng bộ
 */
export function buildCrossroad({ mainLanes = 2, crossLanes = 2, signalOffset = 0 } = {}) {
  const C = v(W / 2, H / 2);
  const half = { h: mainLanes * LW, v: crossLanes * LW }; // nửa bề rộng đường ngang / dọc
  const isH = (d) => d.x !== 0;
  const lanesOf = (d) => (isH(d) ? mainLanes : crossLanes);
  const boxHalfAlong = (d) => (isH(d) ? half.v : half.h); // nửa kích thước lòng nút theo hướng đi
  const extent = (d) => (isH(d) ? W / 2 + 40 : H / 2 + 40);
  const off = (k) => (k + 0.5) * LW; // tâm làn thứ k tính từ tim đường
  const STOP_GAP = 14; // vạch người đi bộ nằm giữa vạch dừng và lòng nút

  const dirs = [v(1, 0), v(-1, 0), v(0, 1), v(0, -1)];
  const paths = [];
  const approaches = [];

  for (const d of dirs) {
    const r = rightOf(d);
    const n = lanesOf(d);
    const L = extent(d);
    const bh = boxHalfAlong(d);
    const stopAt = L - bh - STOP_GAP;
    const signal = isH(d) ? 'H' : 'V';
    const mainBoost = isH(d) ? 1.7 : 1;
    const startOf = (o) => add(sub(C, mul(d, L)), mul(r, o));

    approaches.push({ d, r, n, stopPoint: add(C, mul(d, -(bh + STOP_GAP))), signal });

    // Đi thẳng: mọi làn
    for (let k = 0; k < n; k += 1) {
      paths.push(makePath([startOf(off(k)), add(add(C, mul(d, L)), mul(r, off(k)))], { signal, stopAt, weight: mainBoost, move: 'straight' }));
    }

    // Rẽ phải: từ làn ngoài cùng sang làn ngoài cùng của đường bên phải
    {
      const d2 = r;
      const a = off(n - 1);
      const b = off(lanesOf(d2) - 1);
      const p1 = add(sub(C, mul(d, bh)), mul(r, a));
      const corner = add(sub(C, mul(d, b)), mul(r, a));
      const p2 = sub(add(C, mul(r, boxHalfAlong(d2))), mul(d, b));
      const end = sub(add(C, mul(r, extent(d2))), mul(d, b));
      paths.push(makePath([startOf(a), p1, ...quad(p1, corner, p2, 10), end], { signal, stopAt, weight: 0.35 * mainBoost, move: 'right' }));
    }

    // Rẽ trái: từ làn trong cùng, đi vòng qua tâm nút sang làn trong cùng của đường bên trái
    {
      const d2 = mul(r, -1);
      const a = off(0);
      const b = off(0);
      const p1 = add(sub(C, mul(d, bh)), mul(r, a));
      const corner = add(add(C, mul(d, b)), mul(r, a));
      const p2 = add(sub(C, mul(r, boxHalfAlong(d2))), mul(d, b));
      const end = add(sub(C, mul(r, extent(d2))), mul(d, b));
      paths.push(makePath([startOf(a), p1, ...quad(p1, corner, p2, 14), end], { signal, stopAt, weight: 0.3 * mainBoost, move: 'left' }));
    }
  }

  const signals = new SignalController(undefined, signalOffset);

  function drawGround(ctx) {
    ctx.fillStyle = C_GROUND;
    ctx.fillRect(0, 0, W, H);
    // Khối nhà ở 4 góc + vỉa hè
    const corners = [
      [0, 0, C.x - half.v, C.y - half.h],
      [C.x + half.v, 0, W - (C.x + half.v), C.y - half.h],
      [0, C.y + half.h, C.x - half.v, H - (C.y + half.h)],
      [C.x + half.v, C.y + half.h, W - (C.x + half.v), H - (C.y + half.h)],
    ];
    corners.forEach(([x, y, w, h], i) => {
      ctx.fillStyle = C_SIDEWALK;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = ['#2f3742', '#3a342f', '#33393a', '#2e3a33'][i];
      const m = 9;
      ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let gx = x + m + 8; gx < x + w - m - 10; gx += 26) {
        for (let gy = y + m + 8; gy < y + h - m - 10; gy += 22) ctx.fillRect(gx, gy, 14, 10);
      }
    });
    // Mặt đường
    ctx.fillStyle = C_ASPHALT;
    ctx.fillRect(0, C.y - half.h, W, 2 * half.h);
    ctx.fillRect(C.x - half.v, 0, 2 * half.v, H);

    // Vạch kẻ: tim đường (vàng kép), phân làn (trắng đứt) – dừng trước vạch người đi bộ
    const gapH = half.v + STOP_GAP;
    const gapV = half.h + STOP_GAP;
    const seg = (a, b) => [a, b];
    for (const [a, b] of [seg(v(0, C.y), v(C.x - gapH, C.y)), seg(v(C.x + gapH, C.y), v(W, C.y))]) {
      strokePath(ctx, [add(a, v(0, -1.5)), add(b, v(0, -1.5))], 1.4, C_YELLOW);
      strokePath(ctx, [add(a, v(0, 1.5)), add(b, v(0, 1.5))], 1.4, C_YELLOW);
      for (let k = 1; k < mainLanes; k += 1) {
        for (const sgn of [-1, 1]) strokePath(ctx, [add(a, v(0, sgn * k * LW)), add(b, v(0, sgn * k * LW))], 1.2, C_LINE, { dash: [10, 9] });
      }
    }
    for (const [a, b] of [seg(v(C.x, 0), v(C.x, C.y - gapV)), seg(v(C.x, C.y + gapV), v(C.x, H))]) {
      strokePath(ctx, [add(a, v(-1.5, 0)), add(b, v(-1.5, 0))], 1.4, C_YELLOW);
      strokePath(ctx, [add(a, v(1.5, 0)), add(b, v(1.5, 0))], 1.4, C_YELLOW);
      for (let k = 1; k < crossLanes; k += 1) {
        for (const sgn of [-1, 1]) strokePath(ctx, [add(a, v(sgn * k * LW, 0)), add(b, v(sgn * k * LW, 0))], 1.2, C_LINE, { dash: [10, 9] });
      }
    }

    // Vạch người đi bộ + vạch dừng cho từng hướng
    for (const ap of approaches) {
      const { d, r, n } = ap;
      const bh = boxHalfAlong(d);
      const roadHalf = n * LW;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let o = -roadHalf + 2; o < roadHalf - 2; o += 6) {
        // dải sọc vạch người đi bộ (song song hướng đi)
        const p = add(sub(C, mul(d, bh + 3)), mul(r, o));
        const q = add(sub(C, mul(d, bh + 12)), mul(r, o + 3));
        ctx.fillRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.abs(q.x - p.x) || 3, Math.abs(q.y - p.y) || 3);
      }
      ctx.restore();
      const s1 = sub(C, mul(d, bh + STOP_GAP));
      strokePath(ctx, [add(s1, mul(r, 1.5)), add(s1, mul(r, roadHalf))], 2.2, 'rgba(255,255,255,0.9)');
    }
  }

  function drawSignals(ctx) {
    for (const ap of approaches) {
      const st = signals.state(ap.signal);
      // Cột đèn đặt trên vỉa hè bên phải, ngay trước vạch dừng
      const p = add(add(ap.stopPoint, mul(ap.d, -6)), mul(ap.r, ap.n * LW + 7));
      ctx.fillStyle = '#0b0e0c';
      ctx.fillRect(p.x - 4, p.y - 10, 8, 20);
      ['red', 'yellow', 'green'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y - 6 + i * 6, 2.4, 0, Math.PI * 2);
        const on = c === st;
        ctx.fillStyle = on ? { red: '#ff3b30', yellow: '#ffd60a', green: '#30d158' }[c] : '#2a2f2c';
        if (on) {
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 8;
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }
  }

  function status() {
    const { phase, remaining } = signals.current();
    const name = { H: 'Đường chính', V: 'Đường ngang' };
    if (phase.green) return `Đèn: ${name[phase.green]} XANH ${Math.ceil(remaining)}s`;
    if (phase.yellow) return `Đèn: ${name[phase.yellow]} VÀNG ${Math.ceil(remaining)}s`;
    return 'Đèn: ĐỎ toàn phần';
  }

  return { kind: 'crossroad', label: 'Ngã tư có đèn tín hiệu', paths, signals, drawGround, drawSignals, status, spawnScale: 1 };
}

/* ======================= NÚT GIAO KHÁC MỨC (NGÃ BA HUẾ) ======================= */

export function buildInterchange() {
  const C = v(W / 2, H / 2 + 5);
  const R = 52; // bán kính làn xe chạy trong vòng xuyến
  const RING_W = 24;
  const ARM_W = 24;
  const o = 6; // lệch tâm làn so với tim nhánh
  const FAR = 340;
  const deg = (a) => (a * Math.PI) / 180;
  // 4 nhánh mặt đất (đường chéo) đổ vào vòng xuyến
  const arms = [deg(-52), deg(-128), deg(128), deg(52)].map((a) => {
    const u = fromAngle(a);
    return { a, u, inR: rightOf(mul(u, -1)), outR: rightOf(u) };
  });
  const angleOf = (p) => Math.atan2(p.y, p.x);

  const paths = [];
  arms.forEach((A, i) => {
    const inStart = add(add(C, mul(A.u, FAR)), mul(A.inR, o));
    const inEnd = add(add(C, mul(A.u, R + 16)), mul(A.inR, o));
    const thIn = angleOf(add(mul(A.u, R), mul(A.inR, o)));
    arms.forEach((B, j) => {
      if (i === j) return;
      const thOut = angleOf(add(mul(B.u, R), mul(B.outR, o)));
      // Vòng xuyến chạy ngược chiều kim đồng hồ (nhìn từ trên) ⇒ góc canvas giảm dần
      let delta = thIn - thOut;
      while (delta <= 0.25) delta += Math.PI * 2;
      const ringIn = add(C, mul(fromAngle(thIn), R));
      const ringOut = add(C, mul(fromAngle(thIn - delta), R));
      const outStart = add(add(C, mul(B.u, R + 16)), mul(B.outR, o));
      const outEnd = add(add(C, mul(B.u, FAR)), mul(B.outR, o));
      paths.push(
        makePath(
          [
            inStart,
            inEnd,
            ...quad(inEnd, add(add(C, mul(A.u, R + 4)), mul(A.inR, o)), ringIn, 6),
            ...arc(C, R, thIn, thIn - delta),
            ...quad(ringOut, add(add(C, mul(B.u, R + 4)), mul(B.outR, o)), outStart, 6),
            outEnd,
          ],
          { layer: 0, weight: delta < Math.PI ? 1.2 : 0.7, move: 'ring', yieldUntil: FAR - R - 16 },
        ),
      );
    });
  });

  // Cầu vượt trục ngang (tầng trên): 2 làn mỗi chiều
  const DY = C.y;
  const deckHalf = 2 * LW + 2;
  for (const k of [0, 1]) {
    paths.push(makePath([v(-40, DY + (k + 0.5) * LW), v(W + 40, DY + (k + 0.5) * LW)], { layer: 1, weight: 1.6, move: 'overpass' }));
    paths.push(makePath([v(W + 40, DY - (k + 0.5) * LW), v(-40, DY - (k + 0.5) * LW)], { layer: 1, weight: 1.6, move: 'overpass' }));
  }
  // Đường dẫn xuống cầu (từ làn ngoài chiều Đông, cong xuống góc phải dưới)
  const offRamp = [v(-40, DY + 1.5 * LW), v(120, DY + 1.5 * LW), ...quad(v(120, DY + 1.5 * LW), v(300, DY + 1.5 * LW), v(370, H + 40), 18)];
  // Đường dẫn lên cầu (từ góc phải trên, nhập vào làn ngoài chiều Tây)
  const onRamp = [v(400, -40), ...quad(v(400, -40), v(330, DY - 1.5 * LW), v(220, DY - 1.5 * LW), 18), v(-40, DY - 1.5 * LW)];
  paths.push(makePath(offRamp, { layer: 1, weight: 0.9, move: 'ramp' }));
  paths.push(makePath(onRamp, { layer: 1, weight: 0.9, move: 'ramp' }));

  function drawGround(ctx) {
    ctx.fillStyle = '#28332b';
    ctx.fillRect(0, 0, W, H);
    // mảng cây xanh / công trình xung quanh
    ctx.fillStyle = 'rgba(80,120,80,0.18)';
    for (const [x, y, r] of [[60, 50, 34], [420, 230, 40], [70, 230, 30], [430, 40, 28]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Nhánh đường + vòng xuyến
    for (const A of arms) {
      const p0 = add(C, mul(A.u, R));
      const p1 = add(C, mul(A.u, FAR));
      strokePath(ctx, [p0, p1], ARM_W, C_ASPHALT);
    }
    ctx.strokeStyle = C_ASPHALT;
    ctx.lineWidth = RING_W;
    ctx.beginPath();
    ctx.arc(C.x, C.y, R, 0, Math.PI * 2);
    ctx.stroke();
    // Đảo trung tâm
    ctx.fillStyle = '#35503a';
    ctx.beginPath();
    ctx.arc(C.x, C.y, R - RING_W / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Vạch: mép ngoài vòng xuyến đứt (nhường đường khi nhập vòng), tim nhánh vàng
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(C.x, C.y, R + RING_W / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    for (const A of arms) {
      strokePath(ctx, [add(C, mul(A.u, R + RING_W / 2 + 6)), add(C, mul(A.u, FAR))], 1.4, C_YELLOW);
      // vạch nhường đường (tam giác) trước khi vào vòng
      const yp = add(add(C, mul(A.u, R + RING_W / 2 + 3)), mul(A.inR, o));
      strokePath(ctx, [add(yp, mul(A.inR, -5)), add(yp, mul(A.inR, 6))], 1.6, 'rgba(255,255,255,0.8)', { dash: [3, 2] });
    }
  }

  /** Cầu vượt và đường dẫn (tầng trên) – vẽ SAU xe mặt đất để che phần bên dưới. */
  function drawElevated(ctx) {
    ctx.save();
    // bóng đổ
    ctx.translate(5, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, DY - deckHalf, W, 2 * deckHalf);
    strokePath(ctx, offRamp, 15, 'rgba(0,0,0,0.35)');
    strokePath(ctx, onRamp, 15, 'rgba(0,0,0,0.35)');
    ctx.restore();
    // trụ cầu
    ctx.fillStyle = '#20262b';
    for (const x of [140, 240, 340]) ctx.fillRect(x - 4, DY - deckHalf - 2, 8, 2 * deckHalf + 4);
    // mặt cầu + đường dẫn
    strokePath(ctx, offRamp, 15, '#4b5259');
    strokePath(ctx, onRamp, 15, '#4b5259');
    ctx.fillStyle = '#4b5259';
    ctx.fillRect(0, DY - deckHalf, W, 2 * deckHalf);
    ctx.fillStyle = '#7d858c';
    ctx.fillRect(0, DY - deckHalf, W, 2);
    ctx.fillRect(0, DY + deckHalf - 2, W, 2);
    strokePath(ctx, [v(0, DY - 1.5), v(W, DY - 1.5)], 1.3, C_YELLOW);
    strokePath(ctx, [v(0, DY + 1.5), v(W, DY + 1.5)], 1.3, C_YELLOW);
    strokePath(ctx, [v(0, DY - LW), v(W, DY - LW)], 1.1, C_LINE, { dash: [10, 9] });
    strokePath(ctx, [v(0, DY + LW), v(W, DY + LW)], 1.1, C_LINE, { dash: [10, 9] });
  }

  return {
    kind: 'interchange',
    label: 'Nút giao khác mức – vòng xuyến + cầu vượt',
    paths,
    signals: null,
    drawGround,
    drawElevated,
    status: () => 'Vòng xuyến: nhường xe đang lưu thông trong vòng',
    spawnScale: 1.15,
  };
}

/** Chọn cảnh theo cấu hình camera. */
export function buildScene(camera, rng = Math.random) {
  if (camera.layout === 'interchange') return buildInterchange();
  const mainLanes = Math.max(1, Math.min(3, Math.round((camera.lanes ?? 4) / 2)));
  return buildCrossroad({ mainLanes, crossLanes: 2, signalOffset: rng() * 30 });
}
