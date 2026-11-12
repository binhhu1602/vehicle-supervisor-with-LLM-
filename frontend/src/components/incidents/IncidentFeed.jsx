import { INCIDENT_TYPES } from '../../domain/constants.js';
import { SeverityBadge, StatusBadge } from '../common/Badges.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { Icon } from '../common/Icon.jsx';
import { timeAgo } from '../../utils/format.js';

export function IncidentFeed({ incidents, onSelect, limit = 7 }) {
  if (incidents.length === 0) return <EmptyState icon="check" title="Không có sự cố đang mở" />;
  const now = Date.now();
  return (
    <ul className="list">
      {incidents.slice(0, limit).map((i) => (
        <li key={i.id} className="list-item clickable" onClick={() => onSelect?.(i)}>
          <span className={`type-icon sev-${i.severity.toLowerCase()}`} aria-hidden>
            <Icon name={INCIDENT_TYPES[i.type].icon} size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row space-between">
              <strong style={{ fontSize: 13 }}>{INCIDENT_TYPES[i.type].label}</strong>
              <span className="faint" style={{ fontSize: 12 }}>
                {timeAgo(i.createdAt, now)}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, margin: '1px 0 6px' }}>
              {i.cameraName} · <span className="mono">{i.id}</span>
            </div>
            <div className="row">
              <SeverityBadge severity={i.severity} />
              <StatusBadge status={i.status} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
