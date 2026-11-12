import { CongestionBadge, levelColor } from '../common/Badges.jsx';
import { EmptyState } from '../common/EmptyState.jsx';

/** Xếp hạng các nút giao theo mức ùn tắc (cao → thấp), rồi theo tốc độ (thấp → cao). */
export function HotspotList({ cameras, onSelect, limit = 8 }) {
  const ranked = cameras
    .filter((c) => c.metric?.online)
    .sort((a, b) => b.metric.level - a.metric.level || a.metric.avgSpeed - b.metric.avgSpeed)
    .slice(0, limit);

  if (ranked.length === 0) return <EmptyState title="Chưa có dữ liệu" />;
  return (
    <ul className="list">
      {ranked.map((c) => (
        <li key={c.id} className={`list-item ${onSelect ? 'clickable' : ''}`} onClick={() => onSelect?.(c)}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row space-between">
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
              <CongestionBadge level={c.metric.level} short />
            </div>
            <div className="row space-between faint" style={{ fontSize: 12, margin: '4px 0 6px' }}>
              <span>
                {c.id} · {c.district}
              </span>
              <span className="num">
                {c.metric.avgSpeed} km/h · {c.metric.flow} xe/ph
              </span>
            </div>
            <div className="bar" title={`Chiếm dụng làn ${Math.round(c.metric.occupancy * 100)}%`}>
              <span style={{ width: `${c.metric.occupancy * 100}%`, background: levelColor(c.metric.level) }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
