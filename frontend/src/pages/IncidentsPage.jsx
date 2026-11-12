import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../components/common/Card.jsx';
import { StatCard } from '../components/common/StatCard.jsx';
import { Icon } from '../components/common/Icon.jsx';
import { IncidentTable } from '../components/incidents/IncidentTable.jsx';
import { IncidentDetail } from '../components/incidents/IncidentDetail.jsx';
import { useTraffic } from '../store/TrafficContext.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { isOpen } from '../domain/incidentStateMachine.js';
import { INCIDENT_STATUS_LABEL, INCIDENT_TYPES, SEVERITY } from '../domain/constants.js';
import { downloadFile, formatDateTime, toCsv } from '../utils/format.js';

const SCOPES = [
  { key: 'open', label: 'Đang mở' },
  { key: 'closed', label: 'Đã đóng' },
  { key: 'all', label: 'Tất cả' },
];

export function filterIncidents(incidents, { scope, severity, type, query }) {
  const q = query.trim().toLowerCase();
  return incidents.filter((i) => {
    if (scope === 'open' && !isOpen(i)) return false;
    if (scope === 'closed' && isOpen(i)) return false;
    if (severity && i.severity !== severity) return false;
    if (type && i.type !== type) return false;
    return !q || [i.id, i.cameraName, i.cameraId, i.description].some((s) => s.toLowerCase().includes(q));
  });
}

export default function IncidentsPage() {
  const { state } = useTraffic();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState({ scope: 'open', severity: '', type: '', query: '' });
  const selectedId = params.get('id');

  const list = useMemo(() => filterIncidents(state.incidents, filters), [state.incidents, filters]);
  const selected = selectedId && state.incidents.find((i) => i.id === selectedId);
  const counts = useMemo(() => {
    const open = state.incidents.filter(isOpen);
    return {
      NEW: open.filter((i) => i.status === 'NEW').length,
      ACKNOWLEDGED: open.filter((i) => i.status === 'ACKNOWLEDGED').length,
      IN_PROGRESS: open.filter((i) => i.status === 'IN_PROGRESS').length,
      closed: state.incidents.length - open.length,
    };
  }, [state.incidents]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const select = (i) => setParams(i ? { id: i.id } : {});

  const exportCsv = () => {
    const csv = toCsv(list, [
      { label: 'Mã', value: 'id' },
      { label: 'Loại', value: (i) => INCIDENT_TYPES[i.type].label },
      { label: 'Camera', value: 'cameraId' },
      { label: 'Vị trí', value: 'cameraName' },
      { label: 'Mức độ', value: (i) => SEVERITY[i.severity].label },
      { label: 'Trạng thái', value: (i) => INCIDENT_STATUS_LABEL[i.status] },
      { label: 'Thời điểm', value: (i) => formatDateTime(i.createdAt) },
      { label: 'Mô tả', value: 'description' },
    ]);
    downloadFile(`su-co-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Sự cố & cảnh báo</h2>
          <p>Sự cố được AI Vision phát hiện tự động. Người điều hành tiếp nhận, xử lý và đóng sự cố.</p>
        </div>
        {can('report:export') && (
          <button className="btn" onClick={exportCsv}>
            <Icon name="download" size={16} /> Xuất CSV
          </button>
        )}
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <StatCard icon="alert" label="Mới – chờ tiếp nhận" value={counts.NEW} accent="red" />
        <StatCard icon="info" label="Đã tiếp nhận" value={counts.ACKNOWLEDGED} accent="yellow" />
        <StatCard icon="tool" label="Đang xử lý" value={counts.IN_PROGRESS} accent="blue" />
        <StatCard icon="check" label="Đã đóng" value={counts.closed} accent="green" />
      </div>

      <Card flush>
        <div className="toolbar" style={{ padding: '0 16px 12px' }}>
          <div className="segmented">
            {SCOPES.map((s) => (
              <button key={s.key} className={filters.scope === s.key ? 'active' : ''} onClick={() => set({ scope: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
          <select className="select" value={filters.severity} onChange={(e) => set({ severity: e.target.value })} aria-label="Lọc mức độ">
            <option value="">Mọi mức độ</option>
            {Object.entries(SEVERITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select className="select" value={filters.type} onChange={(e) => set({ type: e.target.value })} aria-label="Lọc loại sự cố">
            <option value="">Mọi loại sự cố</option>
            {Object.entries(INCIDENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <div className="search">
            <Icon name="search" size={16} />
            <input className="input" placeholder="Tìm theo mã, vị trí…" value={filters.query} onChange={(e) => set({ query: e.target.value })} aria-label="Tìm sự cố" />
          </div>
          <span className="faint" style={{ marginLeft: 'auto', fontSize: 13 }}>
            {list.length} kết quả
          </span>
        </div>
        <IncidentTable incidents={list} selectedId={selectedId} onSelect={select} />
      </Card>

      {selected && <IncidentDetail incident={selected} onClose={() => select(null)} />}
    </>
  );
}
