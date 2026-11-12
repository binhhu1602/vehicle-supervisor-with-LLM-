import { networkCongestionIndex } from '../domain/congestion.js';
import { config } from '../config/env.js';

/**
 * Reducer THUẦN quản lý trạng thái giao thông phía client.
 * Mọi thay đổi trạng thái đi qua đây → dễ dự đoán, dễ kiểm thử đơn vị (Ch08).
 */
export const initialTrafficState = Object.freeze({
  connection: { status: 'idle' },
  cameras: [], // danh mục camera (tĩnh)
  metrics: {}, // cameraId → số liệu mới nhất
  cameraHistory: {}, // cameraId → [{ ts, flow, avgSpeed }]
  history: [], // chuỗi tổng hợp toàn mạng theo thời gian
  incidents: [], // mới nhất ở đầu
  frames: {}, // cameraId → mốc thời gian khung hình AI Vision mới nhất
  lastUpdated: null,
});

const CAMERA_HISTORY_LIMIT = 40;

export function aggregate(metricsList, ts) {
  const online = metricsList.filter((m) => m.online);
  const totalFlow = online.reduce((s, m) => s + m.flow, 0);
  const avgSpeed = totalFlow
    ? Math.round(online.reduce((s, m) => s + m.avgSpeed * m.flow, 0) / totalFlow)
    : 0;
  const vehicles = online.reduce(
    (acc, m) => {
      Object.entries(m.vehicles).forEach(([k, v]) => (acc[k] = (acc[k] ?? 0) + v));
      return acc;
    },
    { motorbike: 0, car: 0, truck: 0, bus: 0 },
  );
  return {
    ts,
    totalFlow,
    avgSpeed,
    congestionIndex: networkCongestionIndex(online),
    congestedNodes: online.filter((m) => m.level >= 2).length,
    vehicles,
  };
}

function applyMetrics(state, metricsList, { historyLimit = config.historyLimit } = {}) {
  if (!metricsList?.length) return state;
  const ts = metricsList[0].ts;
  const metrics = { ...state.metrics };
  const cameraHistory = { ...state.cameraHistory };
  for (const m of metricsList) {
    metrics[m.cameraId] = m;
    cameraHistory[m.cameraId] = [
      ...(cameraHistory[m.cameraId] ?? []),
      { ts: m.ts, flow: m.flow, avgSpeed: m.avgSpeed },
    ].slice(-CAMERA_HISTORY_LIMIT);
  }
  return {
    ...state,
    metrics,
    cameraHistory,
    // Tổng hợp trên số liệu MỚI NHẤT của mọi camera (không chỉ lô vừa nhận) – đúng cả khi
    // AI Vision gửi riêng từng camera vào các thời điểm khác nhau
    history: [...state.history, aggregate(Object.values(metrics), ts)].slice(-historyLimit),
    lastUpdated: ts,
  };
}

function upsertIncident(list, incident) {
  const idx = list.findIndex((i) => i.id === incident.id);
  if (idx === -1) return [incident, ...list].slice(0, config.incidentLimit);
  const next = list.slice();
  next[idx] = incident;
  return next;
}

export function trafficReducer(state, action) {
  switch (action.type) {
    case 'CONNECTION':
      return { ...state, connection: action.payload };

    case 'SNAPSHOT': {
      const { cameras, metricsHistory = [], incidents = [] } = action.payload;
      let next = { ...initialTrafficState, connection: state.connection, cameras };
      for (const batch of metricsHistory) next = applyMetrics(next, batch);
      next.incidents = [...incidents].sort((a, b) => b.createdAt - a.createdAt);
      return next;
    }

    case 'METRICS':
      return applyMetrics(state, action.payload);

    case 'CAMERA_FRAME':
      return { ...state, frames: { ...state.frames, [action.payload.cameraId]: action.payload.ts } };

    case 'INCIDENT_NEW':
    case 'INCIDENT_UPDATE':
      return { ...state, incidents: upsertIncident(state.incidents, action.payload) };

    default:
      return state;
  }
}
