import { EventEmitter } from './EventEmitter.js';
import { TrafficSimulator } from '../simulation/TrafficSimulator.js';
import { applyTransition } from '../../domain/incidentStateMachine.js';
import { INCIDENT_STATUS, REALTIME_EVENTS as E } from '../../domain/constants.js';

/**
 * Adapter nguồn dữ liệu GIẢ LẬP. Cùng giao diện với WebSocketRealtimeSource:
 *   connect(), disconnect(), on(event, fn), send(command)
 * → tầng trên không biết (và không cần biết) dữ liệu đến từ đâu (Ch07 – Adapter/Strategy).
 */
export class MockRealtimeSource extends EventEmitter {
  constructor({ cameras, tickMs = 2000, warmupTicks = 45, latencyMs = 250 }) {
    super();
    this.cameras = cameras;
    this.tickMs = tickMs;
    this.warmupTicks = warmupTicks;
    this.latencyMs = latencyMs;
    this.sim = new TrafficSimulator({ cameras, tickMs });
    this.incidents = new Map();
    this.timer = null;
  }

  connect() {
    if (this.timer || this.connectTimer) return; // đã kết nối/đang kết nối
    this.emit(E.CONNECTION, { status: 'connecting' });
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      const history = this.sim.warmup(this.warmupTicks);
      const metricsHistory = history.map((h) => h.metrics);
      history.flatMap((h) => h.incidents).forEach((inc) => this.#storeSeedIncident(inc));

      this.emit(E.CONNECTION, { status: 'connected' });
      this.emit(E.SNAPSHOT, {
        cameras: this.cameras,
        metricsHistory,
        incidents: [...this.incidents.values()],
      });
      this.timer = setInterval(() => this.#tick(), this.tickMs);
    }, this.latencyMs);
  }

  disconnect() {
    clearTimeout(this.connectTimer);
    clearInterval(this.timer);
    this.connectTimer = null;
    this.timer = null;
    this.emit(E.CONNECTION, { status: 'disconnected' });
  }

  /** Nhận lệnh từ client — mô phỏng xử lý phía server rồi phát lại sự kiện. */
  send({ type, payload }) {
    switch (type) {
      case 'incident:transition': {
        const current = this.incidents.get(payload.id);
        if (!current) return;
        const next = applyTransition(current, payload.action, { actor: payload.actor, note: payload.note });
        this.incidents.set(next.id, next);
        setTimeout(() => this.emit(E.INCIDENT_UPDATE, next), 120);
        break;
      }
      case 'config:thresholds':
        this.sim.setThresholds(payload);
        break;
      default:
        console.warn('[MockRealtimeSource] Lệnh không hỗ trợ:', type);
    }
  }

  #tick() {
    const { metrics, incidents } = this.sim.tick();
    this.emit(E.METRICS, metrics);
    incidents.forEach((inc) => {
      this.incidents.set(inc.id, inc);
      this.emit(E.INCIDENT_NEW, inc);
    });
  }

  /** Sự cố cũ khi khởi động: phần lớn đã được xử lý để dữ liệu ban đầu giống thực tế. */
  #storeSeedIncident(inc) {
    let item = inc;
    const r = Math.random();
    const step = (action, actor) => {
      item = applyTransition(item, action, { actor, at: item.updatedAt + 20000 + Math.random() * 40000 });
    };
    if (r < 0.75) {
      step('acknowledge', 'operator');
      if (r < 0.6) {
        step('start', 'operator');
        step('resolve', 'operator');
      } else if (r < 0.68) {
        step('falseAlarm', 'operator');
      }
    }
    if (item.status === INCIDENT_STATUS.NEW && item.type === 'CAMERA_OFFLINE') step('acknowledge', 'system');
    this.incidents.set(item.id, item);
  }
}
