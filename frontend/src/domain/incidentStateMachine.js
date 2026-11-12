import { INCIDENT_STATUS as S } from './constants.js';

/**
 * Máy trạng thái của Sự cố (mô hình hóa hành vi – Ch05, State diagram).
 *
 *   NEW ──acknowledge──▶ ACKNOWLEDGED ──start──▶ IN_PROGRESS ──resolve──▶ RESOLVED
 *    │                        │                       │
 *    └──────falseAlarm────────┴──────falseAlarm───────┘──▶ FALSE_ALARM
 *
 * RESOLVED / FALSE_ALARM là trạng thái kết thúc, có thể "reopen" về NEW.
 */
export const TRANSITIONS = Object.freeze({
  acknowledge: { from: [S.NEW], to: S.ACKNOWLEDGED, label: 'Tiếp nhận' },
  start: { from: [S.ACKNOWLEDGED], to: S.IN_PROGRESS, label: 'Bắt đầu xử lý' },
  resolve: { from: [S.IN_PROGRESS], to: S.RESOLVED, label: 'Hoàn tất' },
  falseAlarm: {
    from: [S.NEW, S.ACKNOWLEDGED, S.IN_PROGRESS],
    to: S.FALSE_ALARM,
    label: 'Báo động giả',
  },
  reopen: { from: [S.RESOLVED, S.FALSE_ALARM], to: S.NEW, label: 'Mở lại' },
});

export const OPEN_STATUSES = Object.freeze([S.NEW, S.ACKNOWLEDGED, S.IN_PROGRESS]);

export function isOpen(incident) {
  return OPEN_STATUSES.includes(incident.status);
}

export function canTransition(status, action) {
  const t = TRANSITIONS[action];
  return Boolean(t && t.from.includes(status));
}

export function availableActions(status) {
  return Object.keys(TRANSITIONS).filter((a) => canTransition(status, a));
}

/**
 * Trả về sự cố MỚI (bất biến) sau khi áp dụng hành động, kèm một mục trong dòng thời gian.
 * Ném lỗi nếu chuyển trạng thái không hợp lệ.
 */
export function applyTransition(incident, action, { actor = 'system', note = '', at = Date.now() } = {}) {
  if (!canTransition(incident.status, action)) {
    throw new Error(`Không thể "${action}" khi sự cố đang ở trạng thái ${incident.status}`);
  }
  const to = TRANSITIONS[action].to;
  return {
    ...incident,
    status: to,
    updatedAt: at,
    timeline: [
      ...(incident.timeline ?? []),
      { at, action, from: incident.status, to, actor, note },
    ],
  };
}
