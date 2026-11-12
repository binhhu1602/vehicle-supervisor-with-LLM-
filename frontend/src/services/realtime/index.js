import { MockRealtimeSource } from './MockRealtimeSource.js';
import { WebSocketRealtimeSource } from './WebSocketRealtimeSource.js';
import { CAMERAS } from '../../domain/cameras.js';
import { httpClient } from '../api/httpClient.js';

function readToken() {
  try {
    return sessionStorage.getItem(httpClient.TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Factory chọn adapter theo cấu hình — đổi nguồn dữ liệu không cần sửa UI. */
export function createRealtimeSource(config) {
  if (config.dataSource === 'websocket') {
    // Backend xác thực kết nối WebSocket bằng JWT trong query string
    const url = `${config.wsUrl}${config.wsUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(readToken())}`;
    return new WebSocketRealtimeSource({ url });
  }
  return new MockRealtimeSource({ cameras: CAMERAS, tickMs: config.mockTickMs });
}
