import { useMemo, useState } from 'react';
import { CameraCard } from '../components/camera/CameraCard.jsx';
import { CameraDetailModal } from '../components/camera/CameraDetailModal.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { Icon } from '../components/common/Icon.jsx';
import { useCameras } from '../hooks/useTrafficData.js';

const FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'jam', label: 'Ùn tắc' },
  { key: 'offline', label: 'Mất tín hiệu' },
];

export default function CamerasPage() {
  const cameras = useCameras();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState('');
  const [showBoxes, setShowBoxes] = useState(true);
  const [selected, setSelected] = useState(null);

  const districts = useMemo(() => [...new Set(cameras.map((c) => c.district))], [cameras]);
  const list = cameras.filter((c) => {
    if (filter === 'jam' && !(c.metric?.online && c.metric.level >= 2)) return false;
    if (filter === 'offline' && c.metric?.online !== false) return false;
    if (district && c.district !== district) return false;
    const q = query.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
  });
  const live = selected && cameras.find((c) => c.id === selected);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Camera giám sát</h2>
          <p>Hình ảnh trực tiếp kèm kết quả nhận diện phương tiện của AI Vision.</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.key} className={filter === f.key ? 'active' : ''} onClick={() => setFilter(f.key)} role="tab" aria-selected={filter === f.key}>
              {f.label}
            </button>
          ))}
        </div>
        <select className="select" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Lọc theo quận">
          <option value="">Tất cả quận</option>
          {districts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <div className="search">
          <Icon name="search" size={16} />
          <input className="input" placeholder="Tìm camera…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm camera" />
        </div>
        <label className="row" style={{ marginLeft: 'auto', fontSize: 13 }}>
          <span className="switch">
            <input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} />
            <span />
          </span>
          Hiển thị khung nhận diện
        </label>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="camera" title="Không có camera phù hợp" />
      ) : (
        <div className="camera-grid">
          {list.map((c) => (
            <CameraCard key={c.id} camera={c} onOpen={(cam) => setSelected(cam.id)} showBoxes={showBoxes} />
          ))}
        </div>
      )}

      {live && <CameraDetailModal camera={live} onClose={() => setSelected(null)} />}
    </>
  );
}
