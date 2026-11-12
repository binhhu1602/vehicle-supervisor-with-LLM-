/**
 * Điểm truy cập DUY NHẤT tới biến môi trường.
 * Các module khác không đọc import.meta.env trực tiếp → dễ thay đổi cấu hình, dễ test.
 */
const env = import.meta.env ?? {};

export const config = Object.freeze({
  dataSource: env.VITE_DATA_SOURCE || 'mock',
  llmProvider: env.VITE_LLM_PROVIDER || 'mock',
  apiBaseUrl: env.VITE_API_BASE_URL || '/api',
  // Mặc định đi qua cùng origin (Vite proxy /ws → backend) để không lệ thuộc cổng backend
  wsUrl:
    env.VITE_WS_URL ||
    (typeof location !== 'undefined' ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws` : 'ws://localhost:8000/ws'),
  mockTickMs: Number(env.VITE_MOCK_TICK_MS) || 2000,
  historyLimit: 90,
  incidentLimit: 300,
  appName: 'TrafficEye',
  version: '0.1.0',
});
