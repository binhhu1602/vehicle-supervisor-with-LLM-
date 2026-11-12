import { useNavigate } from 'react-router-dom';
import { Modal } from '../common/Modal.jsx';
import { CameraFeed } from './CameraFeed.jsx';
import { TrendChart } from '../charts/TrendChart.jsx';
import { VehicleMix } from '../charts/VehicleMix.jsx';
import { Badge, CongestionBadge } from '../common/Badges.jsx';
import { IncidentFeed } from '../incidents/IncidentFeed.jsx';
import { Icon } from '../common/Icon.jsx';
import { LazyTrafficMap } from '../map/LazyTrafficMap.jsx';
import { TrafficAnalysisPanel } from './TrafficAnalysisPanel.jsx';
import { useOpenIncidents } from '../../hooks/useTrafficData.js';

function Metric({ label, value, unit }) {
  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div className="faint" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
        {value}
        <span className="stat-unit">{unit}</span>
      </div>
    </div>
  );
}

export function CameraDetailModal({ camera, onClose }) {
  const navigate = useNavigate();
  const incidents = useOpenIncidents().filter((i) => i.cameraId === camera?.id);
  if (!camera) return null;
  const m = camera.metric;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="row">
          {camera.name} <span className="faint mono" style={{ fontSize: 12 }}>{camera.id}</span>
        </span>
      }
      actions={
        <button
          className="btn btn-sm"
          onClick={() => navigate(`/assistant?q=${encodeURIComponent(`Tình hình ở ${camera.name} thế nào?`)}`)}
        >
          <Icon name="bot" size={14} /> Hỏi trợ lý về nút này
        </button>
      }
    >
      <div className="grid camera-detail">
        <div className="stack">
          <CameraFeed camera={camera} metric={m} />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
            <Metric label="Lưu lượng" value={m?.flow ?? 0} unit="xe/ph" />
            <Metric label="Tốc độ TB" value={m?.avgSpeed ?? 0} unit="km/h" />
            <Metric label="Chiếm dụng làn" value={Math.round((m?.occupancy ?? 0) * 100)} unit="%" />
            <div className="card" style={{ padding: '10px 12px' }}>
              <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
                Tình trạng
              </div>
              {m?.online ? <CongestionBadge level={m.level} /> : <Badge tone="danger" dot>Mất tín hiệu</Badge>}
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>
              Lưu lượng gần đây (xe/phút)
            </div>
            <TrendChart data={camera.history} dataKey="flow" name="Lưu lượng" unit="xe/ph" height={150} />
          </div>
          <TrafficAnalysisPanel camera={camera} />
        </div>
        <div className="stack">
          <div>
            <div className="card-title" style={{ marginBottom: 10 }}>
              Cơ cấu phương tiện (xe/phút)
            </div>
            <VehicleMix vehicles={m?.vehicles} />
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>
              Sự cố đang mở tại nút
            </div>
            <div className="card">
              <IncidentFeed incidents={incidents} onSelect={(i) => navigate(`/incidents?id=${i.id}`)} limit={5} />
            </div>
          </div>
          <div>
            <div className="card-title" style={{ marginBottom: 6 }}>
              Vị trí nút giao
            </div>
            <div className="camera-location">
              <LazyTrafficMap
                height={210}
                compact
                center={[camera.lat, camera.lng]}
                zoom={16}
                cameras={[camera]}
                incidents={incidents}
                onSelectIncident={(i) => navigate(`/incidents?id=${i.id}`)}
              />
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>
              {camera.layout === 'interchange' ? 'Nút giao khác mức (vòng xuyến + cầu vượt)' : 'Ngã tư có đèn tín hiệu'} ·{' '}
              {camera.lanes} làn đường chính · {camera.lat.toFixed(4)}, {camera.lng.toFixed(4)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
