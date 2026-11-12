import { IncidentTypeLabel, SeverityBadge, StatusBadge } from '../common/Badges.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { formatDateTime } from '../../utils/format.js';

export function IncidentTable({ incidents, selectedId, onSelect }) {
  if (incidents.length === 0) return <EmptyState icon="search" title="Không có sự cố phù hợp bộ lọc" />;
  return (
    <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 290px)' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Loại sự cố</th>
            <th>Vị trí</th>
            <th>Mức độ</th>
            <th>Trạng thái</th>
            <th>Thời điểm</th>
            <th>Độ tin cậy AI</th>
          </tr>
        </thead>
        <tbody>
          {incidents.map((i) => (
            <tr
              key={i.id}
              className={`clickable ${i.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(i)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(i)}
            >
              <td className="mono">{i.id}</td>
              <td>
                <IncidentTypeLabel type={i.type} />
              </td>
              <td>
                <div>{i.cameraName}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {i.cameraId} · {i.district}
                </div>
              </td>
              <td>
                <SeverityBadge severity={i.severity} />
              </td>
              <td>
                <StatusBadge status={i.status} />
              </td>
              <td className="num">{formatDateTime(i.createdAt)}</td>
              <td className="num">{Math.round(i.confidence * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
