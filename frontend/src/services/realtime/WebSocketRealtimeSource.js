import { EventEmitter } from './EventEmitter.js';
import { REALTIME_EVENTS as E } from '../../domain/constants.js';

/**
 * Adapter kết nối backend thật qua WebSocket (kiến trúc Client–Server – Ch06).
 *
 * Hợp đồng thông điệp (JSON): { "type": "<REALTIME_EVENTS>", "payload": {...} }
 * Tự động kết nối lại với thời gian chờ tăng dần (exponential backoff) — yêu cầu độ tin cậy.
 */
export class WebSocketRealtimeSource extends EventEmitter {
  constructor({ url, maxBackoffMs = 15000, WebSocketImpl = globalThis.WebSocket }) {
    super();
    this.url = url;
    this.maxBackoffMs = maxBackoffMs;
    this.WebSocketImpl = WebSocketImpl;
    this.ws = null;
    this.attempt = 0;
    this.manualClose = false;
    this.queue = [];
  }

  connect() {
    this.manualClose = false;
    this.emit(E.CONNECTION, { status: this.attempt ? 'reconnecting' : 'connecting', attempt: this.attempt });
    const ws = new this.WebSocketImpl(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.emit(E.CONNECTION, { status: 'connected' });
      this.queue.splice(0).forEach((m) => ws.send(m));
    };
    ws.onmessage = (ev) => {
      try {
        const { type, payload } = JSON.parse(ev.data);
        this.emit(type, payload);
      } catch {
        console.warn('[WebSocket] Bỏ qua thông điệp không hợp lệ');
      }
    };
    ws.onclose = () => {
      // bỏ qua sự kiện đóng của kết nối cũ (đã bị thay thế) hoặc do người dùng chủ động ngắt
      if (this.manualClose || this.ws !== ws) return;
      this.attempt += 1;
      const delay = Math.min(this.maxBackoffMs, 500 * 2 ** this.attempt);
      this.emit(E.CONNECTION, { status: 'reconnecting', attempt: this.attempt, retryInMs: delay });
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  disconnect() {
    this.manualClose = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.emit(E.CONNECTION, { status: 'disconnected' });
  }

  send(command) {
    const msg = JSON.stringify(command);
    if (this.ws?.readyState === 1) this.ws.send(msg);
    else this.queue.push(msg);
  }
}
