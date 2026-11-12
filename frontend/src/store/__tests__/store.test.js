import { describe, expect, it } from 'vitest';
import { aggregate, initialTrafficState, trafficReducer } from '../trafficReducer.js';
import { selectKpis, selectOpenIncidents } from '../selectors.js';
import { camera, incident, metric } from '../../test/fixtures.js';
import { filterIncidents } from '../../pages/IncidentsPage.jsx';
import { validateThresholds } from '../../pages/SettingsPage.jsx';
import { DEFAULT_THRESHOLDS } from '../../domain/congestion.js';
import { toCsv, timeAgo } from '../../utils/format.js';

const cams = [camera(), camera({ id: 'CAM-02', name: 'B' })];

describe('trafficReducer', () => {
  it('SNAPSHOT dựng lại toàn bộ trạng thái từ lịch sử', () => {
    const s = trafficReducer(initialTrafficState, {
      type: 'SNAPSHOT',
      payload: {
        cameras: cams,
        metricsHistory: [[metric({ ts: 1 })], [metric({ ts: 2, flow: 90 })]],
        incidents: [incident({ id: 'A', createdAt: 1 }), incident({ id: 'B', createdAt: 5 })],
      },
    });
    expect(s.history).toHaveLength(2);
    expect(s.metrics['CAM-01'].flow).toBe(90);
    expect(s.cameraHistory['CAM-01']).toHaveLength(2);
    expect(s.incidents.map((i) => i.id)).toEqual(['B', 'A']);
  });

  it('INCIDENT_UPDATE thay thế, INCIDENT_NEW thêm vào đầu', () => {
    let s = { ...initialTrafficState, incidents: [incident()] };
    s = trafficReducer(s, { type: 'INCIDENT_UPDATE', payload: incident({ status: 'ACKNOWLEDGED' }) });
    expect(s.incidents).toHaveLength(1);
    expect(s.incidents[0].status).toBe('ACKNOWLEDGED');
    s = trafficReducer(s, { type: 'INCIDENT_NEW', payload: incident({ id: 'INC-2' }) });
    expect(s.incidents[0].id).toBe('INC-2');
  });

  it('không thay đổi state với action không xác định', () => {
    expect(trafficReducer(initialTrafficState, { type: '???' })).toBe(initialTrafficState);
  });

  it('aggregate bỏ qua camera offline và tính tốc độ có trọng số', () => {
    const a = aggregate(
      [
        metric({ flow: 100, avgSpeed: 40, level: 0 }),
        metric({ cameraId: 'CAM-02', flow: 300, avgSpeed: 20, level: 3 }),
        metric({ cameraId: 'CAM-03', online: false, flow: 0, avgSpeed: 0 }),
      ],
      1,
    );
    expect(a.totalFlow).toBe(400);
    expect(a.avgSpeed).toBe(25);
    expect(a.congestedNodes).toBe(1);
  });
});

describe('selectors', () => {
  it('sắp xếp sự cố mở theo mức độ nghiêm trọng', () => {
    const state = {
      ...initialTrafficState,
      incidents: [incident({ id: 'L', severity: 'LOW' }), incident({ id: 'C', severity: 'CRITICAL' }), incident({ id: 'R', status: 'RESOLVED' })],
    };
    expect(selectOpenIncidents(state).map((i) => i.id)).toEqual(['C', 'L']);
  });

  it('tính KPI từ trạng thái', () => {
    const state = trafficReducer(initialTrafficState, {
      type: 'SNAPSHOT',
      payload: { cameras: cams, metricsHistory: [[metric()]], incidents: [incident()] },
    });
    const k = selectKpis(state);
    expect(k).toMatchObject({ totalFlow: 60, openIncidents: 1, criticalIncidents: 1, camerasTotal: 2, camerasOnline: 1 });
  });
});

describe('Bộ lọc và kiểm tra dữ liệu nhập', () => {
  const list = [incident({ id: 'INC-1' }), incident({ id: 'INC-2', status: 'RESOLVED', type: 'RED_LIGHT', severity: 'LOW' })];
  it('lọc sự cố theo phạm vi, loại, từ khóa', () => {
    expect(filterIncidents(list, { scope: 'open', severity: '', type: '', query: '' })).toHaveLength(1);
    expect(filterIncidents(list, { scope: 'all', severity: 'LOW', type: '', query: '' })[0].id).toBe('INC-2');
    expect(filterIncidents(list, { scope: 'all', severity: '', type: '', query: 'inc-2' })).toHaveLength(1);
  });

  it('kiểm tra ngưỡng tốc độ hợp lệ', () => {
    expect(validateThresholds(DEFAULT_THRESHOLDS)).toEqual([]);
    expect(validateThresholds({ ...DEFAULT_THRESHOLDS, jamSpeed: 25 })).toHaveLength(1);
    expect(validateThresholds({ ...DEFAULT_THRESHOLDS, highOccupancy: 1.5 })).toHaveLength(1);
  });

  it('xuất CSV có BOM và thoát ký tự đặc biệt', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"' }], [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"x,y","say ""hi"""');
  });

  it('hiển thị thời gian tương đối', () => {
    expect(timeAgo(0, 10_000)).toBe('vừa xong');
    expect(timeAgo(0, 5 * 60_000)).toBe('5 phút trước');
  });
});
