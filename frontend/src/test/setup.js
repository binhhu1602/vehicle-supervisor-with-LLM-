import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom không hỗ trợ canvas → trả về null để CameraFeed tự bỏ qua vẽ
HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
// Recharts cần ResizeObserver
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
