import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrafficMap } from '../components/map/TrafficMap.jsx';
import { Card } from '../components/common/Card.jsx';
import { CongestionBadge, Badge } from '../components/common/Badges.jsx';
import { CameraDetailModal } from '../components/camera/CameraDetailModal.jsx';
import { useCameras, useOpenIncidents } from '../hooks/useTrafficData.js';
import { CONGESTION_LEVELS } from '../domain/constants.js';

const LEVEL_HEX = ['#16a34a', '#eab308', '#f97316', '#dc2626'];

export default function MapPage() {
  const cameras = useCameras();
  const incidents = useOpenIncidents();
  const navigate = useNavigate();
  const [focus, setFocus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showIncidents, setShowIncidents] = useState(true);
  const live = selected && cameras.find((c) => c.id === selected);

  return (
    <div className="map-layout">
      <div className="map-canvas card">
        <TrafficMap
          cameras={cameras}
          incidents={showIncidents ? incidents : []}
          focus={focus}
          onSelectCamera={(c) => setSelected(c.id)}
          onSelectIncident={(i) => navigate(`/incidents?id=${i.id}`)}
        />
        <div className="map-legend card">
          {Object.values(CONGESTION_LEVELS).map((l) => (
            <div key={l.key} className="row" style={{ fontSize: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: LEVEL_HEX[l.key] }} />
              {l.label}
            </div>
          ))}
          <div className="row" style={{ fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px dashed #64748b' }} />
            Mất tín hiệu
          </div>
        </div>
      </div>

      <Card
        title="Nút giao giám sát"
        subtitle={`${cameras.length} camera · ${incidents.length} sự cố đang mở`}
        flush
        className="map-side"
        actions={
          <label className="row" style={{ fontSize: 12 }}>
            <span className="switch">
              <input type="checkbox" checked={showIncidents} onChange={(e) => setShowIncidents(e.target.checked)} />
              <span />
            </span>
            Sự cố
          </label>
        }
      >
        <ul className="list" style={{ overflowY: 'auto' }}>
          {cameras.map((c) => {
            const n = incidents.filter((i) => i.cameraId === c.id).length;
            return (
              <li key={c.id} className="list-item clickable" onClick={() => setFocus({ lat: c.lat, lng: c.lng, id: c.id, t: Date.now() })}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row space-between">
                    <strong style={{ fontSize: 13 }}>{c.name}</strong>
                    {c.metric?.online ? <CongestionBadge level={c.metric.level} short /> : <Badge tone="danger">Offline</Badge>}
                  </div>
                  <div className="row space-between faint" style={{ fontSize: 12, marginTop: 2 }}>
                    <span>
                      {c.id}
                      {n > 0 && <span style={{ color: 'var(--c-danger)' }}> · {n} sự cố</span>}
                    </span>
                    {c.metric?.online && (
                      <span className="num">
                        {c.metric.avgSpeed} km/h · {c.metric.flow} xe/ph
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 4, paddingLeft: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(c.id);
                    }}
                  >
                    Xem camera →
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {live && <CameraDetailModal camera={live} onClose={() => setSelected(null)} />}
    </div>
  );
}
