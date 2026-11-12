import { isOpen } from '../domain/incidentStateMachine.js';
import { SEVERITY } from '../domain/constants.js';

/** Selectors: suy ra dữ liệu hiển thị từ state, tách biệt khỏi component (View). */

export const selectCameraList = (state) =>
  state.cameras.map((c) => ({ ...c, metric: state.metrics[c.id] ?? null, history: state.cameraHistory[c.id] ?? [], frameTs: state.frames?.[c.id] ?? null }));

export const selectOpenIncidents = (state) =>
  state.incidents
    .filter(isOpen)
    .sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank || b.createdAt - a.createdAt);

export function selectKpis(state) {
  const last = state.history.at(-1);
  const prev = state.history.at(-16); // ~30 giây trước (chu kỳ 2s)
  const open = state.incidents.filter(isOpen);
  const online = Object.values(state.metrics).filter((m) => m.online).length;
  return {
    totalFlow: last?.totalFlow ?? 0,
    avgSpeed: last?.avgSpeed ?? 0,
    congestionIndex: last?.congestionIndex ?? 0,
    congestedNodes: last?.congestedNodes ?? 0,
    flowDelta: last && prev ? last.totalFlow - prev.totalFlow : 0,
    speedDelta: last && prev ? last.avgSpeed - prev.avgSpeed : 0,
    openIncidents: open.length,
    criticalIncidents: open.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity)).length,
    camerasOnline: online,
    camerasTotal: state.cameras.length,
  };
}
