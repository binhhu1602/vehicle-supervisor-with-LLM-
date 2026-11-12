import {
  CONGESTION_LEVELS,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPES,
  SEVERITY,
} from '../../domain/constants.js';
import { Icon } from './Icon.jsx';

// Theo đèn giao thông: xanh → vàng → cam → đỏ
const LEVEL_TONE = ['ok', 'caution', 'warn', 'danger'];
const SEVERITY_TONE = { LOW: 'muted', MEDIUM: 'caution', HIGH: 'warn', CRITICAL: 'critical' };
const STATUS_TONE = { NEW: 'danger', ACKNOWLEDGED: 'caution', IN_PROGRESS: 'info', RESOLVED: 'ok', FALSE_ALARM: 'muted' };

export function Badge({ tone = 'muted', dot = false, pulse = false, children, title }) {
  return (
    <span className={`badge tone-${tone} ${pulse ? 'pulse' : ''}`} title={title}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function CongestionBadge({ level = 0, short = false }) {
  const l = CONGESTION_LEVELS[level];
  return (
    <Badge tone={LEVEL_TONE[level]} dot>
      {short ? l.short : l.label}
    </Badge>
  );
}

export function SeverityBadge({ severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY[severity]?.label}</Badge>;
}

export function StatusBadge({ status }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      {INCIDENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function IncidentTypeLabel({ type }) {
  const t = INCIDENT_TYPES[type];
  return (
    <span className="row" style={{ gap: 7 }}>
      {t && <Icon name={t.icon} size={15} className="faint" />}
      {t?.label ?? type}
    </span>
  );
}

export const levelColor = (level) => CONGESTION_LEVELS[level]?.color ?? 'var(--text-faint)';
