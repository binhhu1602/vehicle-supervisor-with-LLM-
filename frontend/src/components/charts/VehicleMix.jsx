import { VEHICLE_TYPES } from '../../domain/constants.js';
import { formatNumber } from '../../utils/format.js';

/** Cơ cấu phương tiện: thanh xếp chồng + chú thích có số liệu (nhận diện không chỉ bằng màu). */
export function VehicleMix({ vehicles }) {
  const entries = Object.entries(VEHICLE_TYPES).map(([key, t]) => ({ key, ...t, value: vehicles?.[key] ?? 0 }));
  const total = entries.reduce((s, e) => s + e.value, 0) || 1;
  return (
    <div>
      <div
        style={{ display: 'flex', gap: 2, height: 14, borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}
        role="img"
        aria-label="Cơ cấu phương tiện"
      >
        {entries.map((e) => (
          <div
            key={e.key}
            title={`${e.label}: ${formatNumber(e.value)} (${Math.round((e.value / total) * 100)}%)`}
            style={{ width: `${(e.value / total) * 100}%`, background: e.color, transition: 'width .5s' }}
          />
        ))}
      </div>
      <ul className="list" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
        {entries.map((e) => (
          <li key={e.key} className="row" style={{ alignItems: 'flex-start' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: e.color, marginTop: 5, flexShrink: 0 }} />
            <div>
              <div className="muted" style={{ fontSize: 12 }}>
                {e.label}
              </div>
              <div className="num" style={{ fontWeight: 600 }}>
                {formatNumber(e.value)} <span className="faint">· {Math.round((e.value / total) * 100)}%</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
