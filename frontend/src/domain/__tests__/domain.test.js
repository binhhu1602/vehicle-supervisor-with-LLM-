import { describe, expect, it } from 'vitest';
import { applyTransition, availableActions, canTransition, isOpen } from '../incidentStateMachine.js';
import { can } from '../permissions.js';
import { congestionLevel, networkCongestionIndex } from '../congestion.js';
import { incident } from '../../test/fixtures.js';

describe('Máy trạng thái sự cố', () => {
  it('đi đúng luồng chính NEW → ACKNOWLEDGED → IN_PROGRESS → RESOLVED', () => {
    let inc = incident();
    inc = applyTransition(inc, 'acknowledge', { actor: 'op', at: 1 });
    inc = applyTransition(inc, 'start', { actor: 'op', at: 2 });
    inc = applyTransition(inc, 'resolve', { actor: 'op', at: 3 });
    expect(inc.status).toBe('RESOLVED');
    expect(inc.timeline.map((t) => t.to)).toEqual(['ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED']);
    expect(isOpen(inc)).toBe(false);
  });

  it('không cho phép bỏ qua bước (NEW → RESOLVED)', () => {
    expect(canTransition('NEW', 'resolve')).toBe(false);
    expect(() => applyTransition(incident(), 'resolve')).toThrow();
  });

  it('không làm thay đổi đối tượng gốc (bất biến)', () => {
    const original = incident();
    applyTransition(original, 'acknowledge');
    expect(original.status).toBe('NEW');
    expect(original.timeline).toHaveLength(0);
  });

  it('liệt kê đúng hành động khả dụng theo trạng thái', () => {
    expect(availableActions('NEW')).toEqual(['acknowledge', 'falseAlarm']);
    expect(availableActions('IN_PROGRESS')).toEqual(['resolve', 'falseAlarm']);
    expect(availableActions('RESOLVED')).toEqual(['reopen']);
  });
});

describe('Phân quyền', () => {
  const admin = { role: 'ADMIN' };
  const operator = { role: 'OPERATOR' };
  const viewer = { role: 'VIEWER' };

  it('Người xem không được cập nhật sự cố', () => {
    expect(can(viewer, 'incident:update')).toBe(false);
    expect(can(operator, 'incident:update')).toBe(true);
  });

  it('chỉ Quản trị viên được sửa cài đặt', () => {
    expect(can(admin, 'settings:edit')).toBe(true);
    expect(can(operator, 'settings:edit')).toBe(false);
  });

  it('người chưa đăng nhập và quyền không tồn tại đều bị từ chối', () => {
    expect(can(null, 'dashboard:view')).toBe(false);
    expect(can(admin, 'khong:ton:tai')).toBe(false);
  });
});

describe('Phân loại ùn tắc', () => {
  it.each([
    [{ avgSpeed: 45, occupancy: 0.2 }, 0],
    [{ avgSpeed: 25, occupancy: 0.3 }, 1],
    [{ avgSpeed: 15, occupancy: 0.5 }, 2],
    [{ avgSpeed: 40, occupancy: 0.8 }, 2],
    [{ avgSpeed: 6, occupancy: 0.9 }, 3],
  ])('%o → mức %i', (input, expected) => {
    expect(congestionLevel(input)).toBe(expected);
  });

  it('chỉ số toàn mạng có trọng số theo lưu lượng', () => {
    expect(networkCongestionIndex([])).toBe(0);
    expect(networkCongestionIndex([{ level: 3, flow: 100 }, { level: 0, flow: 100 }])).toBe(50);
    expect(networkCongestionIndex([{ level: 3, flow: 300 }, { level: 0, flow: 100 }])).toBe(75);
  });
});
