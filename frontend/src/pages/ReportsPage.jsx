import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../components/common/Card.jsx';
import { Icon } from '../components/common/Icon.jsx';
import { Markdown } from '../components/common/Markdown.jsx';
import { Thinking } from '../components/common/EmptyState.jsx';
import { CongestionBadge } from '../components/common/Badges.jsx';
import { TrendChart } from '../components/charts/TrendChart.jsx';
import { useTraffic } from '../store/TrafficContext.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { useCameras, useLlmContext } from '../hooks/useTrafficData.js';
import { useLlm } from '../hooks/useLlm.js';
import { INCIDENT_TYPES } from '../domain/constants.js';
import { downloadFile, formatTime, toCsv } from '../utils/format.js';

const avg = (arr, key) => (arr.length ? Math.round(arr.reduce((s, x) => s + x[key], 0) / arr.length) : 0);

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: '8px 10px', fontSize: 12, boxShadow: 'var(--shadow)' }}>
      {payload[0].payload.label}: <strong>{payload[0].value}</strong> sự cố
    </div>
  );
}

export default function ReportsPage() {
  const { state } = useTraffic();
  const { can } = useAuth();
  const cameras = useCameras();
  const context = useLlmContext();
  const llm = useLlm();
  const [report, setReport] = useState({ loading: false, text: '', at: null });

  const byType = useMemo(
    () =>
      Object.entries(INCIDENT_TYPES)
        .map(([k, t]) => ({ key: k, label: t.label, count: state.incidents.filter((i) => i.type === k).length }))
        .sort((a, b) => b.count - a.count),
    [state.incidents],
  );

  const camRows = cameras.map((c) => {
    const onlineHistory = c.history.filter((h) => h.avgSpeed > 0);
    return {
      id: c.id,
      name: c.name,
      district: c.district,
      avgFlow: avg(c.history, 'flow'),
      avgSpeed: avg(onlineHistory, 'avgSpeed'),
      minSpeed: onlineHistory.length ? Math.min(...onlineHistory.map((h) => h.avgSpeed)) : 0,
      incidents: state.incidents.filter((i) => i.cameraId === c.id).length,
      level: c.metric?.level ?? 0,
      online: c.metric?.online,
    };
  });

  const generate = async () => {
    setReport({ loading: true, text: '', at: null });
    try {
      const summary = await llm.summarize({ context });
      const top = [...camRows].sort((a, b) => a.avgSpeed - b.avgSpeed).slice(0, 3);
      const text = [
        summary,
        '',
        '### Thống kê trong phiên giám sát',
        `- Khoảng thời gian: ${formatTime(state.history[0]?.ts, true)} – ${formatTime(state.history.at(-1)?.ts, true)}`,
        `- Tổng số sự cố ghi nhận: **${state.incidents.length}**, nhiều nhất là **${byType[0]?.label}** (${byType[0]?.count})`,
        `- Các nút có tốc độ trung bình thấp nhất: ${top.map((t) => `**${t.name}** (${t.avgSpeed} km/h)`).join(', ')}`,
      ].join('\n');
      setReport({ loading: false, text, at: Date.now() });
    } catch {
      setReport({ loading: false, text: 'Không tạo được báo cáo. Vui lòng thử lại.', at: null });
    }
  };

  const exportCsv = () =>
    downloadFile(
      `thong-ke-nut-giao-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(camRows, [
        { label: 'Mã camera', value: 'id' },
        { label: 'Nút giao', value: 'name' },
        { label: 'Quận', value: 'district' },
        { label: 'Lưu lượng TB (xe/ph)', value: 'avgFlow' },
        { label: 'Tốc độ TB (km/h)', value: 'avgSpeed' },
        { label: 'Tốc độ thấp nhất (km/h)', value: 'minSpeed' },
        { label: 'Số sự cố', value: 'incidents' },
      ]),
    );

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Báo cáo & thống kê</h2>
          <p>Số liệu tổng hợp trong phiên giám sát hiện tại. Báo cáo theo ngày/tháng sẽ lấy từ backend.</p>
        </div>
        <div className="row">
          {can('report:export') && (
            <button className="btn" onClick={exportCsv}>
              <Icon name="download" size={16} /> Xuất CSV
            </button>
          )}
          <button className="btn btn-primary" onClick={generate} disabled={report.loading}>
            <Icon name="report" size={16} /> Tạo báo cáo (LLM)
          </button>
        </div>
      </div>

      {(report.loading || report.text) && (
        <Card
          title={
            <span className="row">
              Báo cáo tổng hợp <span className="tag">LLM</span>
            </span>
          }
          subtitle={report.at ? `Tạo lúc ${formatTime(report.at, true)} · ${llm.name}` : ''}
          style={{ marginBottom: 16 }}
        >
          {report.loading ? <Thinking label="Đang tổng hợp báo cáo" /> : <Markdown text={report.text} />}
        </Card>
      )}

      <div className="grid grid-2-even" style={{ marginBottom: 16 }}>
        <Card title="Chỉ số ùn tắc toàn mạng" subtitle="0 – 100, càng cao càng ùn tắc">
          <TrendChart data={state.history} dataKey="congestionIndex" name="Chỉ số ùn tắc" unit="/100" color="var(--chart-index)" domain={[0, 100]} />
        </Card>
        <Card title="Sự cố theo loại" subtitle={`${state.incidents.length} sự cố trong phiên`}>
          <div style={{ width: '100%', height: 200 }} role="img" aria-label="Biểu đồ số sự cố theo loại">
            <ResponsiveContainer>
              <BarChart data={byType} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={4}>
                <CartesianGrid stroke="var(--grid)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-faint)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={130} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                <Bar dataKey="count" fill="var(--series-1)" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fill: 'var(--text-muted)', fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Thống kê theo nút giao" flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Camera</th>
                <th>Nút giao</th>
                <th>Quận</th>
                <th>Lưu lượng TB</th>
                <th>Tốc độ TB</th>
                <th>Tốc độ thấp nhất</th>
                <th>Sự cố</th>
                <th>Hiện tại</th>
              </tr>
            </thead>
            <tbody>
              {camRows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.district}</td>
                  <td className="num">{r.avgFlow} xe/ph</td>
                  <td className="num">{r.avgSpeed} km/h</td>
                  <td className="num">{r.minSpeed} km/h</td>
                  <td className="num">{r.incidents}</td>
                  <td>{r.online ? <CongestionBadge level={r.level} short /> : <span className="faint">Offline</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
