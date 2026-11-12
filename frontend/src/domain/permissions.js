import { ROLES } from './constants.js';

/**
 * Phân quyền theo vai trò (yêu cầu phi chức năng về bảo mật – Ch04).
 * Frontend chỉ ẩn/khóa giao diện; backend vẫn phải kiểm tra lại quyền.
 */
const MATRIX = Object.freeze({
  'dashboard:view': [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  'camera:view': [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  'incident:view': [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  'incident:update': [ROLES.ADMIN, ROLES.OPERATOR],
  'assistant:use': [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  'report:view': [ROLES.ADMIN, ROLES.OPERATOR, ROLES.VIEWER],
  'report:export': [ROLES.ADMIN, ROLES.OPERATOR],
  'settings:edit': [ROLES.ADMIN],
});

export function can(user, permission) {
  if (!user) return false;
  return (MATRIX[permission] ?? []).includes(user.role);
}

export const PERMISSIONS = Object.keys(MATRIX);
