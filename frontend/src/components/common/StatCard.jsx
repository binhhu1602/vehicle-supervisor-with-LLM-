import { Icon } from './Icon.jsx';

/**
 * Thẻ chỉ số KPI.
 * - `accent`: màu nhấn theo đèn giao thông: 'green' | 'yellow' | 'amber' | 'red' | 'blue'
 * - `deltaGoodWhen`: tăng là tốt ("up"), giảm là tốt ("down") hay trung tính ("none")
 */
export function StatCard({ icon, label, value, unit, delta, deltaUnit = '', deltaGoodWhen = 'up', foot, accent = 'green' }) {
  const hasDelta = typeof delta === 'number' && delta !== 0;
  const good = hasDelta && (deltaGoodWhen === 'up' ? delta > 0 : delta < 0);
  const deltaClass = deltaGoodWhen === 'none' ? 'muted' : good ? 'delta-up' : 'delta-down';
  return (
    <div className={`card stat-card stat-${accent}`} data-testid="stat-card">
      <div className="stat-head">
        {icon && (
          <span className="stat-icon" aria-hidden>
            <Icon name={icon} size={19} strokeWidth={2} />
          </span>
        )}
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      <div className="stat-foot">
        {hasDelta && (
          <span className={deltaClass}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
            {deltaUnit}{' '}
          </span>
        )}
        {foot}
      </div>
    </div>
  );
}
