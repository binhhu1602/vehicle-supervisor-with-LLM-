import { ROLES } from '../../domain/constants.js';
import { httpClient } from './httpClient.js';

/**
 * Dịch vụ xác thực. Chế độ mock dùng tài khoản demo; chế độ thật gọi POST /api/auth/login.
 * Lưu ý: mật khẩu demo chỉ phục vụ trình diễn, backend thật phải băm mật khẩu và cấp JWT.
 */
export const DEMO_USERS = Object.freeze([
  { username: 'admin', password: 'admin123', name: 'Nguyễn Quản Trị', role: ROLES.ADMIN },
  { username: 'operator', password: 'operator123', name: 'Trần Điều Hành', role: ROLES.OPERATOR },
  { username: 'viewer', password: 'viewer123', name: 'Lê Quan Sát', role: ROLES.VIEWER },
]);

export function createAuthService(config) {
  if (config.dataSource === 'websocket') {
    return {
      login: (username, password) => httpClient.post(`${config.apiBaseUrl}/auth/login`, { username, password }),
    };
  }
  return {
    async login(username, password) {
      await new Promise((r) => setTimeout(r, 300));
      const u = DEMO_USERS.find((x) => x.username === username.trim() && x.password === password);
      if (!u) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng');
      const { password: _omit, ...user } = u;
      return { user, token: `mock-token-${u.username}` };
    },
  };
}
