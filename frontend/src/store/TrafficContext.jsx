import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { initialTrafficState, trafficReducer } from './trafficReducer.js';
import { createRealtimeSource } from '../services/realtime/index.js';
import { REALTIME_EVENTS as E } from '../domain/constants.js';
import { config } from '../config/env.js';

const TrafficContext = createContext(null);

const EVENT_TO_ACTION = {
  [E.CONNECTION]: 'CONNECTION',
  [E.SNAPSHOT]: 'SNAPSHOT',
  [E.METRICS]: 'METRICS',
  [E.INCIDENT_NEW]: 'INCIDENT_NEW',
  [E.INCIDENT_UPDATE]: 'INCIDENT_UPDATE',
  [E.CAMERA_FRAME]: 'CAMERA_FRAME',
};

/**
 * Controller (MVC): nối nguồn dữ liệu thời gian thực (Model phía server) với state React.
 * Component con chỉ đọc state và gọi actions, không biết về WebSocket/giả lập.
 */
export function TrafficProvider({ children, source: injectedSource }) {
  const [state, dispatch] = useReducer(trafficReducer, initialTrafficState);
  const sourceRef = useRef(null);
  if (!sourceRef.current) sourceRef.current = injectedSource ?? createRealtimeSource(config);

  useEffect(() => {
    const source = sourceRef.current;
    const unsubs = Object.entries(EVENT_TO_ACTION).map(([event, type]) =>
      source.on(event, (payload) => dispatch({ type, payload })),
    );
    source.connect();
    return () => {
      unsubs.forEach((u) => u());
      source.disconnect();
    };
  }, []);

  const transitionIncident = useCallback((id, action, actor, note = '') => {
    sourceRef.current.send({ type: 'incident:transition', payload: { id, action, actor, note } });
  }, []);

  const updateThresholds = useCallback((thresholds) => {
    sourceRef.current.send({ type: 'config:thresholds', payload: thresholds });
  }, []);

  /** Cho phép component đăng ký trực tiếp sự kiện (vd. hiển thị thông báo khi có sự cố mới). */
  const subscribe = useCallback((event, handler) => sourceRef.current.on(event, handler), []);

  // actions ổn định qua các lần render → effect phụ thuộc vào actions không chạy lại mỗi chu kỳ dữ liệu
  const actions = useMemo(() => ({ transitionIncident, updateThresholds }), [transitionIncident, updateThresholds]);
  const value = useMemo(() => ({ state, actions, subscribe }), [state, actions, subscribe]);

  return <TrafficContext.Provider value={value}>{children}</TrafficContext.Provider>;
}

export function useTraffic() {
  const ctx = useContext(TrafficContext);
  if (!ctx) throw new Error('useTraffic phải được dùng bên trong <TrafficProvider>');
  return ctx;
}
