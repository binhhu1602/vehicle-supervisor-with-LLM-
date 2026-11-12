import { CameraFeed } from './CameraFeed.jsx';
import { Badge, CongestionBadge } from '../common/Badges.jsx';

export function CameraCard({ camera, onOpen, showBoxes }) {
  const m = camera.metric;
  return (
    <article className="card camera-card">
      <button className="camera-card-media" onClick={() => onOpen(camera)} aria-label={`Mở camera ${camera.name}`}>
        <CameraFeed camera={camera} metric={m} showBoxes={showBoxes} />
      </button>
      <div className="camera-card-body">
        <div className="row space-between">
          <strong className="camera-card-title" title={camera.name}>
            {camera.name}
          </strong>
          {m?.online ? <CongestionBadge level={m.level} short /> : <Badge tone="danger" dot>Offline</Badge>}
        </div>
        <div className="row space-between faint" style={{ fontSize: 12 }}>
          <span>
            {camera.id} · {camera.district}
          </span>
          {m?.online && (
            <span className="num">
              {m.flow} xe/ph · {m.avgSpeed} km/h
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
