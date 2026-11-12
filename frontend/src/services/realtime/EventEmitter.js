/**
 * Mẫu thiết kế Observer (Ch07 – Design patterns).
 * Subject giữ danh sách observer theo tên sự kiện; khi dữ liệu thay đổi sẽ thông báo cho tất cả.
 * Nhiều "màn hình" (dashboard, bản đồ, bảng sự cố…) cùng quan sát một nguồn dữ liệu.
 */
export class EventEmitter {
  #listeners = new Map();

  /** Đăng ký observer. Trả về hàm hủy đăng ký. */
  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    this.#listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const handlers = this.#listeners.get(event);
    if (!handlers) return;
    // Sao chép để observer có thể tự hủy đăng ký trong lúc đang được gọi
    [...handlers].forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error(`[EventEmitter] Lỗi khi xử lý "${event}":`, err);
      }
    });
  }

  listenerCount(event) {
    return this.#listeners.get(event)?.size ?? 0;
  }

  removeAllListeners() {
    this.#listeners.clear();
  }
}
