import { describe, expect, it } from 'vitest';
import { buildCrossroad, buildInterchange, buildScene, H, W } from '../scenes.js';
import { TrafficEngine } from '../engine.js';
import { SignalController } from '../signals.js';
import { pointAt } from '../geometry.js';
import { seededRng } from '../../../../test/fixtures.js';

const busy = { online: true, flow: 90, avgSpeed: 30 };
const outside = (p) => p.x < 0 || p.x > W || p.y < 0 || p.y > H;

describe('Đèn tín hiệu theo pha', () => {
  it('chuyển xanh → vàng → đỏ toàn phần → hướng kia xanh', () => {
    const s = new SignalController();
    expect(s.state('H')).toBe('green');
    expect(s.state('V')).toBe('red');
    s.advance(9.5);
    expect(s.state('H')).toBe('yellow');
    s.advance(2.5);
    expect([s.state('H'), s.state('V')]).toEqual(['red', 'red']);
    s.advance(1.5);
    expect(s.state('V')).toBe('green');
  });
});

describe('Hình học nút giao', () => {
  it('ngã tư: mỗi hướng có đi thẳng theo số làn + rẽ phải + rẽ trái, xe vào/ra ngoài khung hình', () => {
    const scene = buildCrossroad({ mainLanes: 3, crossLanes: 2 });
    // ngang: 2 hướng × (3 thẳng + 2 rẽ); dọc: 2 hướng × (2 thẳng + 2 rẽ)
    expect(scene.paths).toHaveLength(2 * 5 + 2 * 4);
    for (const p of scene.paths) {
      expect(outside(p.pts[0])).toBe(true);
      expect(outside(p.pts.at(-1))).toBe(true);
      expect(p.stopAt).toBeGreaterThan(0);
      expect(p.stopAt).toBeLessThan(p.length);
    }
  });

  it('Ngã ba Huế dùng nút giao khác mức, các nút khác là ngã tư', () => {
    expect(buildScene({ layout: 'interchange' }).kind).toBe('interchange');
    expect(buildScene({ lanes: 4 }).kind).toBe('crossroad');
  });

  it('vòng xuyến chạy ngược chiều kim đồng hồ (giao thông bên phải)', () => {
    const scene = buildInterchange();
    const ring = scene.paths.find((p) => p.move === 'ring');
    const C = { x: W / 2, y: H / 2 + 5 };
    // Trong đoạn vòng xuyến, tích có hướng (vị trí × hướng đi) âm ⇒ ngược chiều kim đồng hồ trên màn hình
    const mid = pointAt(ring, ring.yieldUntil + 40);
    const r = { x: mid.pos.x - C.x, y: mid.pos.y - C.y };
    expect(r.x * mid.dir.y - r.y * mid.dir.x).toBeLessThan(0);
  });
});

describe('Động cơ mô phỏng', () => {
  it('đèn đỏ: không xe nào vượt vạch dừng, hình thành hàng chờ', () => {
    const scene = buildCrossroad({ mainLanes: 2, crossLanes: 2 });
    scene.signals = new SignalController([{ green: 'V', t: 1e6 }]); // trục ngang đỏ suốt
    const engine = new TrafficEngine(scene, { rng: seededRng(3) });
    const passed = new Set();
    for (let t = 0; t < 60; t += 0.1) {
      engine.step(0.1, busy);
      for (const veh of engine.vehicles) {
        if (veh.path.signal === 'H' && veh.s > veh.path.stopAt) passed.add(veh.id);
      }
    }
    expect(passed.size).toBe(0);
    const queued = engine.vehicles.filter((x) => x.path.signal === 'H' && x.v < 1);
    expect(queued.length).toBeGreaterThan(4);
  });

  it('đèn xanh: xe đi qua nút liên tục', () => {
    const scene = buildCrossroad({ mainLanes: 2, crossLanes: 2 });
    const engine = new TrafficEngine(scene, { rng: seededRng(5) });
    for (let t = 0; t < 90; t += 0.1) engine.step(0.1, busy);
    expect(engine.completed).toBeGreaterThan(40);
  });

  it('vòng xuyến + cầu vượt không bị kẹt cứng khi đông xe', () => {
    const engine = new TrafficEngine(buildInterchange(), { rng: seededRng(9) });
    for (let t = 0; t < 60; t += 0.1) engine.step(0.1, busy);
    const before = engine.completed;
    for (let t = 0; t < 60; t += 0.1) engine.step(0.1, busy);
    expect(engine.completed - before).toBeGreaterThan(30);
    const ringDone = engine.vehicles.filter((x) => x.path.move === 'ring').length;
    expect(ringDone).toBeGreaterThan(0);
  });

  it('camera mất tín hiệu/không có số liệu vẫn chạy được (giá trị mặc định)', () => {
    const engine = new TrafficEngine(buildCrossroad(), { rng: seededRng(1) });
    expect(() => engine.warmup(5, undefined)).not.toThrow();
  });
});
