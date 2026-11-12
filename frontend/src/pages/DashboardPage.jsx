import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/common/Card.jsx';
import { StatCard } from '../components/common/StatCard.jsx';
import { TrendChart } from '../components/charts/TrendChart.jsx';
import { VehicleMix } from '../components/charts/VehicleMix.jsx';
import { HotspotList } from '../components/dashboard/HotspotList.jsx';
import { IncidentFeed } from '../components/incidents/IncidentFeed.jsx';
import { AiInsightPanel } from '../components/assistant/AiInsightPanel.jsx';
import { CameraDetailModal } from '../components/camera/CameraDetailModal.jsx';
import { LazyTrafficMap } from '../components/map/LazyTrafficMap.jsx';
import { CONGESTION_LEVELS } from '../domain/constants.js';
import { useTraffic } from '../store/TrafficContext.jsx';
import { useCameras, useKpis, useOpenIncidents } from '../hooks/useTrafficData.js';
import { formatNumber, formatTime } from '../utils/format.js';

export default function DashboardPage() {
  const { state } = useTraffic();
  const kpis = useKpis();
  const cameras = useCameras();
  const openIncidents = useOpenIncidents();
  const navigate = useNavigate();
  const [selectedCam, setSelectedCam] = useState(null);
  const ready = state.history.length > 0;
  const last = state.history.at(-1);
  const liveCamera = selectedCam && cameras.find((c) => c.id === selectedCam);

  // Chỉ số ùn tắc đổi màu như đèn: xanh < 35 ≤ vàng < 60 ≤ đỏ
  const indexAccent = kpis.congestionIndex >= 60 ? 'red' : kpis.congestionIndex >= 35 ? 'yellow' : 'green';

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Tổng quan giao thông</h2>
          <p>
            Dữ liệu thời gian thực từ {kpis.camerasTotal} camera · cập nhật lúc{' '}
            <span className="mono">{formatTime(state.lastUpdated, true)}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <StatCard
          icon="car"
          label="Tổng lưu lượng"
          value={formatNumber(kpis.totalFlow)}
          unit="xe/phút"
          delta={kpis.flowDelta}
          deltaGoodWhen="none"
          foot="so với 30 giây trước"
          accent="green"
        />
        <StatCard
          icon="speed"
          accent="blue"
          label="Tốc độ trung bình"
          value={kpis.avgSpeed}
          unit="km/h"
          delta={kpis.speedDelta}
          deltaUnit=" km/h"
          foot="so với 30 giây trước"
        />
        <StatCard
          icon="traffic"
          label="Chỉ số ùn tắc"
          value={kpis.congestionIndex}
          unit="/ 100"
          accent={indexAccent}
          foot={`${kpis.congestedNodes} nút đang ùn ứ/tắc`}
        />
        <StatCard
          icon="alert"
          label="Sự cố đang mở"
          value={kpis.openIncidents}
          accent={kpis.criticalIncidents ? 'red' : kpis.openIncidents ? 'amber' : 'green'}
          foot={`${kpis.criticalIncidents} mức cao/khẩn cấp · ${kpis.camerasOnline}/${kpis.camerasTotal} camera online`}
        />
      </div>

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <div className="stack">
          <Card title="Tổng lưu lượng toàn mạng" subtitle="xe/phút · 3 phút gần nhất">
            <TrendChart data={state.history} dataKey="totalFlow" name="Lưu lượng" unit="xe/phút" color="var(--chart-flow)" />
          </Card>
          <Card title="Tốc độ trung bình" subtitle="km/h · có trọng số theo lưu lượng">
            <TrendChart data={state.history} dataKey="avgSpeed" name="Tốc độ TB" unit="km/h" color="var(--chart-speed)" height={170} />
          </Card>
        </div>
        <div className="stack">
          <AiInsightPanel ready={ready} />
          <Card title="Cơ cấu phương tiện" subtitle="xe/phút, toàn mạng">
            <VehicleMix vehicles={last?.vehicles} />
          </Card>
        </div>
      </div>

      <div className="grid grid-3">
        <Card
          title="Bản đồ giao thông"
          subtitle="Màu nút giao theo mức ùn tắc · bấm vào nút để xem camera"
          actions={
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/map')}>
              Toàn màn hình →
            </button>
          }
          bodyClassName="map-card-body"
        >
          <LazyTrafficMap
            height={360}
            compact
            cameras={cameras}
            incidents={openIncidents}
            onSelectCamera={(c) => setSelectedCam(c.id)}
            onSelectIncident={(i) => navigate(`/incidents?id=${i.id}`)}
          />
          <div className="map-legend-inline">
            {Object.values(CONGESTION_LEVELS).map((l) => (
              <span key={l.key}>
                <i style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </Card>
        <Card title="Điểm nóng ùn tắc" subtitle="Xếp theo mức ùn tắc và tốc độ" flush>
          <HotspotList cameras={cameras} onSelect={(c) => setSelectedCam(c.id)} />
        </Card>
        <Card
          title="Sự cố cần xử lý"
          subtitle="Ưu tiên theo mức độ nghiêm trọng"
          flush
          actions={
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/incidents')}>
              Tất cả →
            </button>
          }
        >
          <IncidentFeed incidents={openIncidents} onSelect={(i) => navigate(`/incidents?id=${i.id}`)} />
        </Card>
      </div>

      {liveCamera && <CameraDetailModal camera={liveCamera} onClose={() => setSelectedCam(null)} />}
    </>
  );
}
