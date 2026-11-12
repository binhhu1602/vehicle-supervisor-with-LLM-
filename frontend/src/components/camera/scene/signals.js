/**
 * Bộ điều khiển đèn tín hiệu theo pha cố định (fixed-time).
 * Nhóm 'H' = các hướng trên trục ngang (đường chính), 'V' = trục dọc (đường cắt ngang).
 * Chu kỳ: H xanh → H vàng → đỏ toàn phần (giải phóng nút) → V xanh → V vàng → đỏ toàn phần.
 */
export const DEFAULT_PHASES = [
  { green: 'H', t: 9 },
  { yellow: 'H', t: 2.5 },
  { t: 1.5 }, // all-red
  { green: 'V', t: 6 },
  { yellow: 'V', t: 2.5 },
  { t: 1.5 },
];

export class SignalController {
  constructor(phases = DEFAULT_PHASES, offset = 0) {
    this.phases = phases;
    this.cycle = phases.reduce((s, p) => s + p.t, 0);
    this.time = offset % this.cycle;
  }

  advance(dt) {
    this.time = (this.time + dt) % this.cycle;
  }

  /** Pha hiện tại và số giây còn lại của pha. */
  current() {
    let t = this.time;
    for (const p of this.phases) {
      if (t < p.t) return { phase: p, remaining: p.t - t };
      t -= p.t;
    }
    return { phase: this.phases[0], remaining: this.phases[0].t };
  }

  state(group) {
    const { phase } = this.current();
    if (phase.green === group) return 'green';
    if (phase.yellow === group) return 'yellow';
    return 'red';
  }
}
