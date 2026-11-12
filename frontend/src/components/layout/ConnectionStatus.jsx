import { useEffect, useState } from 'react';
import { useTraffic } from '../../store/TrafficContext.jsx';
import { Badge } from '../common/Badges.jsx';
import { timeAgo } from '../../utils/format.js';

const MAP = {
  idle: ['muted', 'Chưa kết nối'],
  connecting: ['warn', 'Đang kết nối…'],
  reconnecting: ['warn', 'Đang kết nối lại…'],
  connected: ['ok', 'Trực tuyến'],
  disconnected: ['danger', 'Mất kết nối'],
};

export function ConnectionStatus() {
  const { state } = useTraffic();
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const [tone, label] = MAP[state.connection.status] ?? MAP.idle;
  const stale = state.lastUpdated && Date.now() - state.lastUpdated > 10000;
  return (
    <Badge
      tone={stale ? 'warn' : tone}
      dot
      title={state.lastUpdated ? `Cập nhật ${timeAgo(state.lastUpdated)}` : undefined}
    >
      {stale ? 'Dữ liệu chậm' : label}
    </Badge>
  );
}
