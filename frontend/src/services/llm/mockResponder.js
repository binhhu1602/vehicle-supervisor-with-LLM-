import { CONGESTION_LEVELS, SEVERITY } from '../../domain/constants.js';
import { includesAny, normalizeVi } from './textUtils.js';

/**
 * Bộ trả lời giả lập cho trợ lý LLM (chạy hoàn toàn trên trình duyệt).
 * Hàm THUẦN: cùng input → cùng output, nên kiểm thử đơn vị được.
 * Khi có backend, MockLlmProvider được thay bằng HttpLlmProvider mà UI không đổi.
 */

export const INTENTS = Object.freeze({
  INCIDENTS: 'INCIDENTS',
  CONGESTION: 'CONGESTION',
  CAMERA_DETAIL: 'CAMERA_DETAIL',
  CAMERA_STATUS: 'CAMERA_STATUS',
  RECOMMEND: 'RECOMMEND',
  SUMMARY: 'SUMMARY',
  GREETING: 'GREETING',
  UNKNOWN: 'UNKNOWN',
});

const bySeverity = (a, b) => (SEVERITY[b.severity]?.rank ?? 0) - (SEVERITY[a.severity]?.rank ?? 0);
const byCongestion = (a, b) => b.level - a.level || a.avgSpeed - b.avgSpeed;

export function findCameraMention(question, cameras) {
  const q = normalizeVi(question);
  const idMatch = q.match(/cam-?0?(\d{1,2})/);
  if (idMatch) {
    const id = `CAM-${idMatch[1].padStart(2, '0')}`;
    const found = cameras.find((c) => c.id === id);
    if (found) return found;
  }
  // So khớp theo cụm từ trong tên: "cầu rồng", "ngã ba huế", "trần thị lý"…
  let best = null;
  let bestScore = 0;
  for (const cam of cameras) {
    const parts = normalizeVi(cam.name).split(/[–-]/).map((p) => p.trim()).filter(Boolean);
    const score = parts.reduce((s, p) => (q.includes(p) ? s + p.length : s), 0);
    if (score > bestScore) {
      best = cam;
      bestScore = score;
    }
  }
  return bestScore >= 6 ? best : null;
}

export function detectIntent(question, cameras = []) {
  const q = normalizeVi(question);
  if (findCameraMention(question, cameras)) return INTENTS.CAMERA_DETAIL;
  if (includesAny(q, ['su co', 'tai nan', 'va cham', 'canh bao', 'nguoc chieu', 'den do'])) return INTENTS.INCIDENTS;
  if (includesAny(q, ['de xuat', 'giai phap', 'khuyen nghi', 'nen lam', 'phan luong', 'xu ly the nao'])) return INTENTS.RECOMMEND;
  if (includesAny(q, ['un tac', 'tac duong', 'ket xe', 'un u', 'diem nong', 'dong xe', 'cham'])) return INTENTS.CONGESTION;
  if (includesAny(q, ['camera', 'mat tin hieu', 'offline', 'thiet bi'])) return INTENTS.CAMERA_STATUS;
  if (includesAny(q, ['tom tat', 'tong hop', 'bao cao', 'tinh hinh', 'tong quan', 'hien tai'])) return INTENTS.SUMMARY;
  if (includesAny(q, ['xin chao', 'chao', 'hello', 'hi '])) return INTENTS.GREETING;
  return INTENTS.UNKNOWN;
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

function incidentsAnswer(ctx) {
  const list = [...ctx.openIncidents].sort(bySeverity);
  if (list.length === 0) return 'Hiện **không có sự cố nào đang mở** trên toàn mạng lưới.';
  const lines = list.slice(0, 6).map(
    (i) => `- **[${i.severityLabel}] ${i.typeLabel}** tại ${i.cameraName} (${fmtTime(i.createdAt)}) — ${i.id}, trạng thái: ${i.status}`,
  );
  const critical = list.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity));
  return [
    `### Sự cố đang mở: ${list.length}`,
    ...lines,
    list.length > 6 ? `- … và ${list.length - 6} sự cố khác.` : '',
    '',
    critical.length
      ? `Có **${critical.length}** sự cố mức Cao/Khẩn cấp. Đề nghị ưu tiên điều lực lượng tới **${critical[0].cameraName}** trước.`
      : 'Các sự cố hiện tại ở mức thấp – trung bình, có thể xử lý theo thứ tự tiếp nhận.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function congestionAnswer(ctx) {
  const online = ctx.cameras.filter((c) => c.online);
  const hot = online.filter((c) => c.level >= 2).sort(byCongestion);
  if (hot.length === 0) {
    const busiest = [...online].sort((a, b) => b.flow - a.flow)[0];
    return [
      'Hiện **không có điểm ùn tắc** đáng kể.',
      busiest ? `- Nút có lưu lượng cao nhất: **${busiest.name}** (${busiest.flow} xe/phút, ${busiest.avgSpeed} km/h).` : '',
    ].join('\n');
  }
  return [
    `### Điểm nóng ùn tắc (${hot.length} nút)`,
    ...hot.map(
      (c) => `- **${c.name}** (${c.district}): ${c.levelLabel}, tốc độ TB **${c.avgSpeed} km/h**, ${c.flow} xe/phút, chiếm dụng ${Math.round(c.occupancy * 100)}%`,
    ),
    '',
    `Chỉ số ùn tắc toàn mạng: **${ctx.kpis.congestionIndex}/100**.`,
  ].join('\n');
}

function cameraDetailAnswer(ctx, cam) {
  const c = ctx.cameras.find((x) => x.id === cam.id) ?? cam;
  const incs = ctx.openIncidents.filter((i) => i.cameraId === c.id);
  if (!c.online) {
    return `Camera **${c.id} – ${c.name}** đang **mất tín hiệu**. Không có dữ liệu thời gian thực; đề nghị kiểm tra đường truyền hoặc cử kỹ thuật viên.`;
  }
  return [
    `### ${c.name} (${c.id})`,
    `- Tình trạng: **${c.levelLabel}**`,
    `- Lưu lượng: **${c.flow} xe/phút** · Tốc độ TB: **${c.avgSpeed} km/h** · Chiếm dụng làn: ${Math.round(c.occupancy * 100)}%`,
    incs.length
      ? `- Sự cố đang mở: ${incs.map((i) => `${i.typeLabel} (${i.severityLabel})`).join(', ')}`
      : '- Không có sự cố đang mở tại nút này.',
    '',
    c.level >= 2
      ? 'Đề xuất: kéo dài pha xanh hướng ùn, cảnh báo trên bảng VMS và gợi ý tuyến thay thế.'
      : 'Giao thông ổn định, tiếp tục theo dõi.',
  ].join('\n');
}

function cameraStatusAnswer(ctx) {
  const off = ctx.cameras.filter((c) => !c.online);
  return [
    `### Trạng thái camera: ${ctx.cameras.length - off.length}/${ctx.cameras.length} trực tuyến`,
    off.length ? off.map((c) => `- **${c.id}** – ${c.name}: mất tín hiệu`).join('\n') : '- Tất cả camera hoạt động bình thường.',
  ].join('\n');
}

function recommendAnswer(ctx) {
  const recs = [];
  const hot = ctx.cameras.filter((c) => c.online && c.level >= 2).sort(byCongestion);
  const accidents = ctx.openIncidents.filter((i) => i.type === 'ACCIDENT');
  accidents.forEach((a) =>
    recs.push(`- **${a.cameraName}**: điều CSGT và cứu hộ tới hiện trường (${a.id}); phong tỏa làn bị ảnh hưởng.`),
  );
  hot.slice(0, 3).forEach((c) =>
    recs.push(`- **${c.name}**: tăng thời gian pha xanh 15–20 giây cho hướng ùn; hiển thị cảnh báo trên bảng VMS.`),
  );
  if (hot.length >= 2) recs.push('- Phân luồng từ xa: hướng dẫn phương tiện đi tuyến song song để giảm tải các nút trên.');
  const offline = ctx.cameras.filter((c) => !c.online);
  if (offline.length) recs.push(`- Cử kỹ thuật kiểm tra camera ${offline.map((c) => c.id).join(', ')}.`);
  if (recs.length === 0) recs.push('- Giao thông đang ổn định, chưa cần can thiệp. Tiếp tục giám sát.');
  return ['### Đề xuất điều hành', ...recs].join('\n');
}

export function summaryAnswer(ctx) {
  const k = ctx.kpis;
  const hot = ctx.cameras.filter((c) => c.online && c.level >= 2).sort(byCongestion);
  const status =
    k.congestionIndex >= 60 ? 'căng thẳng' : k.congestionIndex >= 35 ? 'đông đúc' : 'ổn định';
  return [
    `### Tóm tắt tình hình lúc ${fmtTime(ctx.generatedAt)}`,
    `- Giao thông toàn mạng: **${status}** (chỉ số ùn tắc ${k.congestionIndex}/100)`,
    `- Tổng lưu lượng: **${k.totalFlow} xe/phút**, tốc độ trung bình **${k.avgSpeed} km/h**`,
    `- Sự cố đang mở: **${k.openIncidents}** (${k.criticalIncidents} mức cao/khẩn cấp)`,
    `- Camera trực tuyến: ${k.camerasOnline}/${k.camerasTotal}`,
    hot.length ? `- Điểm nóng: ${hot.slice(0, 3).map((c) => `**${c.name}**`).join(', ')}` : '- Không có điểm nóng ùn tắc.',
  ].join('\n');
}

const HELP = [
  'Tôi có thể giúp bạn:',
  '- "Tóm tắt tình hình giao thông hiện tại"',
  '- "Những điểm nào đang ùn tắc?"',
  '- "Có sự cố nào nghiêm trọng không?"',
  '- "Tình hình ở Cầu Rồng thế nào?"',
  '- "Đề xuất phương án điều hành"',
].join('\n');

export function answerQuestion(question, ctx) {
  const intent = detectIntent(question, ctx.cameras);
  switch (intent) {
    case INTENTS.INCIDENTS:
      return incidentsAnswer(ctx);
    case INTENTS.CONGESTION:
      return congestionAnswer(ctx);
    case INTENTS.CAMERA_DETAIL:
      return cameraDetailAnswer(ctx, findCameraMention(question, ctx.cameras));
    case INTENTS.CAMERA_STATUS:
      return cameraStatusAnswer(ctx);
    case INTENTS.RECOMMEND:
      return recommendAnswer(ctx);
    case INTENTS.SUMMARY:
      return summaryAnswer(ctx);
    case INTENTS.GREETING:
      return `Xin chào! Tôi là trợ lý điều hành giao thông.\n${HELP}`;
    default:
      return `Tôi chưa hiểu rõ câu hỏi. ${HELP}`;
  }
}

/** Phân tích một sự cố cụ thể (mô phỏng đầu ra có cấu trúc của LLM). */
export function analyzeIncident(incident, ctx) {
  const cam = ctx.cameras.find((c) => c.id === incident.cameraId);
  const level = cam ? CONGESTION_LEVELS[cam.level].label : 'không rõ';
  const base = {
    ACCIDENT: {
      cause: 'Va chạm giữa phương tiện, có thể do mất tập trung hoặc giữ khoảng cách không an toàn khi lưu lượng cao.',
      actions: ['Điều CSGT và xe cứu thương tới hiện trường', 'Phong tỏa làn bị ảnh hưởng, đặt biển cảnh báo từ xa 200m', 'Phát cảnh báo trên bảng VMS các tuyến lân cận'],
      impact: 'Dự kiến gây ùn ứ 20–40 phút trên hướng bị ảnh hưởng.',
    },
    CONGESTION: {
      cause: 'Lưu lượng vượt năng lực thông hành của nút giao, chu kỳ đèn hiện tại chưa phù hợp.',
      actions: ['Tăng thời gian pha xanh cho hướng ùn 15–20 giây', 'Hướng dẫn phân luồng sang tuyến song song', 'Theo dõi thêm 10 phút, nếu không cải thiện cử CSGT điều tiết'],
      impact: 'Có thể lan rộng sang các nút liền kề nếu kéo dài quá 15 phút.',
    },
    WRONG_WAY: {
      cause: 'Phương tiện đi ngược chiều — nguy cơ va chạm trực diện cao.',
      actions: ['Thông báo ngay cho tổ CSGT gần nhất', 'Trích xuất biển số từ video để xử phạt', 'Kiểm tra lại biển báo/vạch kẻ đường tại vị trí'],
      impact: 'Rủi ro an toàn cao, ảnh hưởng lưu lượng thấp.',
    },
    RED_LIGHT: {
      cause: 'Vi phạm tín hiệu đèn giao thông.',
      actions: ['Lưu bằng chứng (ảnh, video, biển số) vào hồ sơ vi phạm', 'Chuyển dữ liệu cho bộ phận xử lý phạt nguội'],
      impact: 'Không ảnh hưởng đáng kể tới lưu lượng.',
    },
    STALLED_VEHICLE: {
      cause: 'Phương tiện dừng bất thường, có thể do hỏng hóc.',
      actions: ['Liên hệ đơn vị cứu hộ kéo xe', 'Cảnh báo làn bị chiếm dụng trên VMS'],
      impact: 'Giảm năng lực thông hành 1 làn, ùn ứ cục bộ.',
    },
    CAMERA_OFFLINE: {
      cause: 'Mất kết nối mạng hoặc nguồn điện tại camera.',
      actions: ['Kiểm tra trạng thái switch/nguồn từ xa', 'Cử kỹ thuật viên nếu không khôi phục sau 10 phút', 'Tạm dùng camera lân cận để giám sát khu vực'],
      impact: 'Mất khả năng giám sát khu vực này.',
    },
  }[incident.type];

  const risk = ['CRITICAL', 'HIGH'].includes(incident.severity) ? 'cao' : incident.severity === 'MEDIUM' ? 'trung bình' : 'thấp';
  return {
    summary: `${incident.description} Tình trạng hiện tại của nút: ${level}. Mức rủi ro đánh giá: ${risk}.`,
    probableCause: base.cause,
    impact: base.impact,
    recommendedActions: base.actions,
    confidence: incident.confidence,
    model: 'mock-llm',
  };
}

/**
 * Phân tích lưu lượng theo thời gian (bản giả lập trên trình duyệt, cùng nguyên tắc với backend):
 * thống kê được TÍNH trước (xu hướng, đỉnh, bất thường, ngoại suy), phần diễn giải dựa trên các số đó.
 */
export function analyzeTraffic(camera, history) {
  const pts = history.filter((p) => p.flow > 0 || p.avgSpeed > 0);
  if (pts.length < 3) throw new Error('Chưa đủ dữ liệu để phân tích');
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
  const flows = pts.map((p) => p.flow);
  const speeds = pts.map((p) => p.avgSpeed);
  const third = Math.max(1, Math.floor(pts.length / 3));
  const early = mean(flows.slice(0, third));
  const late = mean(flows.slice(-third));
  const changePct = early ? Math.round(((late - early) / early) * 1000) / 10 : 0;
  const trend = changePct > 10 ? 'tăng' : changePct < -10 ? 'giảm' : 'ổn định';
  const t = (ts) => new Date(ts).toLocaleTimeString('vi-VN');
  const peak = pts.reduce((a, b) => (b.flow > a.flow ? b : a));
  const slowest = pts.reduce((a, b) => (b.avgSpeed < a.avgSpeed ? b : a));
  const [fm, fs, sm, ss] = [mean(flows), sd(flows), mean(speeds), sd(speeds)];
  const anomalies = [];
  pts.forEach((p) => {
    if (fs && p.flow > fm + 2 * fs) anomalies.push(`${t(p.ts)}: lưu lượng tăng đột biến (${p.flow} xe/phút)`);
    if (ss && p.avgSpeed < sm - 2 * ss) anomalies.push(`${t(p.ts)}: tốc độ giảm đột ngột (${p.avgSpeed} km/h)`);
  });
  const recent = flows.slice(-10);
  const n = recent.length;
  const mx = (n - 1) / 2;
  const my = mean(recent);
  const slope = recent.reduce((s, y, x) => s + (x - mx) * (y - my), 0) / (recent.reduce((s, _, x) => s + (x - mx) ** 2, 0) || 1);
  const stats = {
    points: pts.length,
    avgFlow: Math.round(fm * 10) / 10,
    avgSpeed: Math.round(sm * 10) / 10,
    trend,
    changePct,
    peakFlow: { time: t(peak.ts), value: peak.flow },
    slowest: { time: t(slowest.ts), value: slowest.avgSpeed },
    forecast15min: Math.max(0, Math.round(recent[n - 1] + slope * 15)),
  };
  const level = camera.metric?.level ?? 0;
  const recs = [];
  if (level >= 2) {
    recs.push(
      camera.layout === 'interchange'
        ? 'Điều tiết luồng vào vòng xuyến, ưu tiên xe đi thẳng dùng cầu vượt'
        : 'Kéo dài pha xanh cho hướng ùn thêm 15–20 giây và theo dõi hàng chờ',
    );
  }
  if (trend === 'tăng') recs.push('Chuẩn bị phương án phân luồng sớm nếu xu hướng tăng tiếp diễn');
  if (anomalies.length) recs.push('Kiểm tra video tại các thời điểm bất thường để xác định nguyên nhân');
  if (!recs.length) recs.push('Giao thông ổn định, tiếp tục giám sát');
  return {
    scope: camera.name,
    dataSource: 'bộ giả lập trên trình duyệt',
    summary: `Trong ${pts.length} mẫu gần nhất tại ${camera.name}, lưu lượng trung bình ${stats.avgFlow} xe/phút, tốc độ trung bình ${stats.avgSpeed} km/h; xu hướng ${trend} (${changePct > 0 ? '+' : ''}${changePct}%).`,
    trend: `Lưu lượng ${trend} so với đầu giai đoạn; mức hiện tại: ${CONGESTION_LEVELS[level].label}.`,
    peaks: [`Lưu lượng cao nhất ${peak.flow} xe/phút lúc ${stats.peakFlow.time}`, `Tốc độ thấp nhất ${slowest.avgSpeed} km/h lúc ${stats.slowest.time}`],
    anomalies: anomalies.slice(0, 5),
    forecast: `Ước tính khoảng ${stats.forecast15min} xe/phút nếu xu hướng hiện tại tiếp diễn (ngoại suy tuyến tính).`,
    recommendations: recs,
    model: 'mock-llm',
    stats,
  };
}
