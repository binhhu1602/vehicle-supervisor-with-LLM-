import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../realtime/EventEmitter.js';
import { TrafficSimulator, timeOfDayFactor } from '../simulation/TrafficSimulator.js';
import { MockRealtimeSource } from '../realtime/MockRealtimeSource.js';
import { WebSocketRealtimeSource } from '../realtime/WebSocketRealtimeSource.js';
import { CAMERAS } from '../../domain/cameras.js';
import { REALTIME_EVENTS as E } from '../../domain/constants.js';
import { seededRng } from '../../test/fixtures.js';

describe('EventEmitter (Observer)', () => {
  it('thông báo cho mọi observer và cho phép hủy đăng ký', () => {
    const em = new EventEmitter();
    const a = vi.fn();
    const b = vi.fn();
    const offA = em.on('x', a);
    em.on('x', b);
    em.emit('x', 1);
    offA();
    em.emit('x', 2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('lỗi ở một observer không ảnh hưởng observer khác', () => {
    const em = new EventEmitter();
    const ok = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    em.on('x', () => {
      throw new Error('boom');
    });
    em.on('x', ok);
    em.emit('x');
    expect(ok).toHaveBeenCalled();
  });
});

describe('TrafficSimulator', () => {
  const make = () => new TrafficSimulator({ cameras: CAMERAS, rng: seededRng(7), now: () => new Date('2026-11-11T08:00:00').getTime() });

  it('sinh số liệu hợp lệ cho mọi camera', () => {
    const { metrics } = make().tick();
    expect(metrics).toHaveLength(CAMERAS.length);
    for (const m of metrics) {
      expect(m.level).toBeGreaterThanOrEqual(0);
      expect(m.level).toBeLessThanOrEqual(3);
      if (m.online) {
        expect(m.avgSpeed).toBeGreaterThanOrEqual(3);
        expect(m.occupancy).toBeLessThanOrEqual(0.98);
      }
    }
  });

  it('tất định với cùng hạt giống ngẫu nhiên', () => {
    expect(make().warmup(10)).toEqual(make().warmup(10));
  });

  it('giờ cao điểm có lưu lượng cao hơn đêm khuya', () => {
    expect(timeOfDayFactor(new Date('2026-11-11T07:30:00'))).toBeGreaterThan(timeOfDayFactor(new Date('2026-11-11T02:00:00')) * 2);
  });

  it('sự cố sinh ra có đủ trường bắt buộc', () => {
    const incidents = make().warmup(200).flatMap((t) => t.incidents);
    expect(incidents.length).toBeGreaterThan(0);
    for (const i of incidents) {
      expect(i).toMatchObject({ status: 'NEW', cameraId: expect.any(String), severity: expect.any(String) });
      expect(i.timeline[0].action).toBe('detected');
    }
  });
});

describe('MockRealtimeSource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('phát snapshot rồi cập nhật định kỳ', () => {
    const src = new MockRealtimeSource({ cameras: CAMERAS, tickMs: 1000, warmupTicks: 5, latencyMs: 10 });
    const snapshot = vi.fn();
    const metrics = vi.fn();
    src.on(E.SNAPSHOT, snapshot);
    src.on(E.METRICS, metrics);
    src.connect();
    vi.advanceTimersByTime(10);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(snapshot.mock.calls[0][0].metricsHistory).toHaveLength(5);
    vi.advanceTimersByTime(3000);
    expect(metrics).toHaveBeenCalledTimes(3);
    src.disconnect();
  });

  it('connect/disconnect liên tiếp (StrictMode) không tạo 2 vòng cập nhật', () => {
    const src = new MockRealtimeSource({ cameras: CAMERAS, tickMs: 1000, warmupTicks: 1, latencyMs: 10 });
    const metrics = vi.fn();
    src.on(E.METRICS, metrics);
    src.connect();
    src.disconnect();
    src.connect();
    vi.advanceTimersByTime(2010);
    expect(metrics).toHaveBeenCalledTimes(2);
    src.disconnect();
  });
});

describe('WebSocketRealtimeSource', () => {
  class FakeWs {
    static instances = [];
    readyState = 0;
    sent = [];
    constructor(url) {
      this.url = url;
      FakeWs.instances.push(this);
    }
    send(m) {
      this.sent.push(m);
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
    open() {
      this.readyState = 1;
      this.onopen?.();
    }
  }

  beforeEach(() => {
    FakeWs.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('chuyển tiếp thông điệp thành sự kiện và gửi lệnh đã xếp hàng khi mở kết nối', () => {
    const src = new WebSocketRealtimeSource({ url: 'ws://x', WebSocketImpl: FakeWs });
    const handler = vi.fn();
    src.on(E.METRICS, handler);
    src.connect();
    src.send({ type: 'ping' });
    const ws = FakeWs.instances[0];
    ws.open();
    expect(ws.sent).toEqual([JSON.stringify({ type: 'ping' })]);
    ws.onmessage({ data: JSON.stringify({ type: E.METRICS, payload: [1] }) });
    expect(handler).toHaveBeenCalledWith([1]);
  });

  it('tự kết nối lại khi mất kết nối ngoài ý muốn', () => {
    const src = new WebSocketRealtimeSource({ url: 'ws://x', WebSocketImpl: FakeWs });
    src.connect();
    FakeWs.instances[0].close();
    vi.advanceTimersByTime(1000);
    expect(FakeWs.instances).toHaveLength(2);
    src.disconnect();
    vi.advanceTimersByTime(20000);
    expect(FakeWs.instances).toHaveLength(2);
  });
});
