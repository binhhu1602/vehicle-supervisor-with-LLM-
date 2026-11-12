import { describe, expect, it } from 'vitest';
import { analyzeIncident, answerQuestion, detectIntent, findCameraMention, INTENTS } from '../llm/mockResponder.js';
import { normalizeVi } from '../llm/textUtils.js';
import { MockLlmProvider } from '../llm/MockLlmProvider.js';
import { CAMERAS } from '../../domain/cameras.js';
import { incident } from '../../test/fixtures.js';

const ctx = {
  generatedAt: '2026-11-11T08:00:00Z',
  kpis: { congestionIndex: 48, totalFlow: 600, avgSpeed: 24, openIncidents: 1, criticalIncidents: 1, camerasOnline: 7, camerasTotal: 8 },
  cameras: CAMERAS.map((c, i) => ({
    ...c,
    online: i !== 7,
    flow: 70,
    avgSpeed: i === 2 ? 8 : 35,
    occupancy: i === 2 ? 0.9 : 0.3,
    level: i === 2 ? 3 : 0,
    levelLabel: i === 2 ? 'Ùn tắc nghiêm trọng' : 'Thông thoáng',
  })),
  openIncidents: [
    { id: 'INC-9', type: 'ACCIDENT', typeLabel: 'Tai nạn giao thông', severity: 'CRITICAL', severityLabel: 'Khẩn cấp', status: 'NEW', cameraId: 'CAM-03', cameraName: 'Ngã ba Huế', createdAt: Date.now() },
  ],
};

describe('Xử lý tiếng Việt', () => {
  it('bỏ dấu và chữ đ', () => {
    expect(normalizeVi('  Đường   Ùn TẮC ')).toBe('duong un tac');
  });
});

describe('Nhận diện ý định câu hỏi', () => {
  it.each([
    ['Có sự cố nào không?', INTENTS.INCIDENTS],
    ['Chỗ nào đang ùn tắc', INTENTS.CONGESTION],
    ['Đề xuất phương án điều hành', INTENTS.RECOMMEND],
    ['Tóm tắt tình hình', INTENTS.SUMMARY],
    ['Camera nào mất tín hiệu', INTENTS.CAMERA_STATUS],
    ['Tình hình ở Cầu Rồng?', INTENTS.CAMERA_DETAIL],
    ['asdfgh', INTENTS.UNKNOWN],
  ])('"%s" → %s', (q, intent) => {
    expect(detectIntent(q, CAMERAS)).toBe(intent);
  });

  it('nhận diện camera theo mã', () => {
    expect(findCameraMention('cam 5 thế nào', CAMERAS)).toBeNull();
    expect(findCameraMention('CAM-05 thế nào', CAMERAS)?.id).toBe('CAM-05');
  });
});

describe('Câu trả lời dựa trên dữ liệu (grounded)', () => {
  it('liệt kê điểm ùn tắc từ dữ liệu thực tế', () => {
    const a = answerQuestion('Điểm nào đang ùn tắc?', ctx);
    expect(a).toContain('Ngã ba Huế');
    expect(a).toContain('8 km/h');
  });

  it('ưu tiên sự cố mức khẩn cấp', () => {
    expect(answerQuestion('Có sự cố gì không', ctx)).toContain('Khẩn cấp');
  });

  it('báo camera mất tín hiệu', () => {
    expect(answerQuestion('Tình hình Lê Duẩn – Ông Ích Khiêm', ctx)).toContain('mất tín hiệu');
  });

  it('phân tích sự cố có đầy đủ cấu trúc', () => {
    const r = analyzeIncident(incident({ cameraId: 'CAM-03' }), ctx);
    expect(r.recommendedActions.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/rủi ro/);
  });
});

describe('MockLlmProvider', () => {
  it('stream câu trả lời thành nhiều đoạn và ghép lại đầy đủ', async () => {
    const llm = new MockLlmProvider();
    const chunks = [];
    for await (const c of llm.chat({ messages: [{ role: 'user', content: 'Tóm tắt tình hình' }], context: ctx })) chunks.push(c);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join('')).toBe(answerQuestion('Tóm tắt tình hình', ctx));
  }, 10000);

  it('có thể hủy giữa chừng', async () => {
    const llm = new MockLlmProvider();
    const ctrl = new AbortController();
    const it = llm.chat({ messages: [{ role: 'user', content: 'hi' }], context: ctx, signal: ctrl.signal });
    ctrl.abort();
    await expect(it.next()).rejects.toThrow();
  });
});

describe('Phân tích lưu lượng (giả lập)', () => {
  const mk = (flows, speeds) => flows.map((f, i) => ({ ts: 1_700_000_000_000 + i * 2000, flow: f, avgSpeed: speeds?.[i] ?? 40 }));

  it('nhận diện xu hướng tăng và đưa ra dự báo cao hơn hiện tại', async () => {
    const { analyzeTraffic } = await import('../llm/mockResponder.js');
    const r = analyzeTraffic({ name: 'Ngã ba Huế', layout: 'interchange', metric: { level: 2 } }, mk([20, 25, 30, 38, 45, 52, 60, 70, 80]));
    expect(r.stats.trend).toBe('tăng');
    expect(r.stats.forecast15min).toBeGreaterThan(80);
    expect(r.recommendations.join(' ')).toContain('vòng xuyến');
  });

  it('báo chưa đủ dữ liệu khi quá ít điểm', async () => {
    const { analyzeTraffic } = await import('../llm/mockResponder.js');
    expect(() => analyzeTraffic({ name: 'X', metric: { level: 0 } }, mk([10]))).toThrow();
  });
});
