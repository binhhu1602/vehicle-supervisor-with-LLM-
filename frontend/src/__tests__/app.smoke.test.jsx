import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// Leaflet cần SVG/canvas thật mà jsdom không có → thay bản đồ bằng stub (bản đồ kiểm tra thủ công trên trình duyệt)
vi.mock('../components/map/TrafficMap.jsx', () => ({
  TrafficMap: ({ cameras }) => <div data-testid="map-stub">{cameras.length} camera</div>,
}));

/**
 * Kiểm thử tích hợp (system test mức nhỏ): render toàn bộ ứng dụng với nguồn dữ liệu giả lập,
 * đăng nhập rồi điều hướng qua tất cả các trang để phát hiện lỗi runtime.
 */
describe('Smoke test toàn ứng dụng', () => {
  it('đăng nhập và mở được mọi trang', async () => {
    // jsdom AbortSignal không tương thích với Request của Node → dùng Request tối giản cho router
    globalThis.Request = class {
      constructor(url, init = {}) {
        this.url = String(url);
        this.method = init.method ?? 'GET';
        this.signal = init.signal;
        this.headers = new Headers(init.headers);
      }
    };
    window.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    globalThis.IntersectionObserver ??= class {
      observe() {}
      disconnect() {}
    };
    const { default: App } = await import('../App.jsx');
    render(<App />);

    // Đăng nhập
    fireEvent.click(await screen.findByRole('button', { name: /admin · Quản trị viên/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    // Tổng quan: chờ dữ liệu thời gian thực đầu tiên
    expect(await screen.findByRole('heading', { name: 'Tổng quan giao thông', level: 2 }, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByText('Trực tuyến', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText('Điểm nóng ùn tắc')).toBeInTheDocument();

    const nav = within(screen.getByRole('navigation'));
    const visit = async (link, heading) => {
      fireEvent.click(nav.getByRole('link', { name: link }));
      expect(await screen.findByRole('heading', { name: heading, level: 2 }, { timeout: 4000 })).toBeInTheDocument();
    };

    await visit(/Camera/, 'Camera giám sát');
    await visit(/Sự cố & cảnh báo/, 'Sự cố & cảnh báo');
    await visit(/Báo cáo/, 'Báo cáo & thống kê');
    await visit(/Cài đặt/, 'Cài đặt');

    fireEvent.click(nav.getByRole('link', { name: /Trợ lý AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Những điểm nào đang ùn tắc?' }));
    expect(await screen.findByText(/Điểm nóng ùn tắc|không có điểm ùn tắc/i, {}, { timeout: 8000 })).toBeInTheDocument();

    fireEvent.click(nav.getByRole('link', { name: /Bản đồ/ }));
    expect(await screen.findByText('Nút giao giám sát', {}, { timeout: 4000 })).toBeInTheDocument();
  }, 30000);
});
