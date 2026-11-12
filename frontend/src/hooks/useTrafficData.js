import { useMemo } from 'react';
import { useTraffic } from '../store/TrafficContext.jsx';
import { selectCameraList, selectKpis, selectOpenIncidents } from '../store/selectors.js';
import { buildLlmContext } from '../services/llm/contextBuilder.js';

/** Các hook tiện ích để View lấy dữ liệu đã được tính sẵn (memoized). */
export function useCameras() {
  const { state } = useTraffic();
  return useMemo(() => selectCameraList(state), [state.cameras, state.metrics, state.cameraHistory, state.frames]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useKpis() {
  const { state } = useTraffic();
  return useMemo(() => selectKpis(state), [state.history, state.incidents, state.metrics, state.cameras]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useOpenIncidents() {
  const { state } = useTraffic();
  return useMemo(() => selectOpenIncidents(state), [state.incidents]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Ngữ cảnh đã chuẩn hóa để gửi cho LLM. Dùng getter để luôn lấy dữ liệu mới nhất khi gọi. */
export function useLlmContext() {
  const cameras = useCameras();
  const openIncidents = useOpenIncidents();
  const kpis = useKpis();
  return useMemo(() => buildLlmContext({ cameras, openIncidents, kpis }), [cameras, openIncidents, kpis]);
}
