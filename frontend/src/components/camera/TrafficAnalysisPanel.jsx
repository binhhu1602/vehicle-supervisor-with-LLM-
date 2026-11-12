import { useRef, useState } from 'react';
import { useLlm } from '../../hooks/useLlm.js';
import { Thinking } from '../common/EmptyState.jsx';
import { Icon } from '../common/Icon.jsx';
import { config } from '../../config/env.js';

const RANGES = [
  { minutes: 15, label: '15 phút' },
  { minutes: 60, label: '1 giờ' },
  { minutes: 180, label: '3 giờ' },
];

function Section({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="field-label">{title}</div>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Phân tích lưu lượng bằng LLM:
 * video camera → mô hình nhận diện (YOLO + ByteTrack) trích xuất số liệu → thống kê → LLM diễn giải.
 */
export function TrafficAnalysisPanel({ camera }) {
  const llm = useLlm();
  const [minutes, setMinutes] = useState(60);
  const [state, setState] = useState({ loading: false, data: null, error: '' });
  const abortRef = useRef(null);

  const run = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ loading: true, data: null, error: '' });
    try {
      const data = await llm.analyzeTraffic({ camera, history: camera.history, minutes, signal: ctrl.signal });
      setState({ loading: false, data, error: '' });
    } catch (e) {
      if (e.name === 'AbortError') return;
      const msg = e.status === 400 || /đủ dữ liệu/.test(e.message) ? 'Chưa đủ dữ liệu lưu lượng để phân tích, hãy thử lại sau ít phút.' : 'Không phân tích được lưu lượng. Vui lòng thử lại.';
      setState({ loading: false, data: null, error: msg });
    }
  };

  const d = state.data;
  return (
    <section className="ai-box">
      <div className="row space-between row-wrap" style={{ marginBottom: 8, gap: 8 }}>
        <strong style={{ fontSize: 13 }}>
          Phân tích lưu lượng <span className="tag">LLM</span>
        </strong>
        <div className="row">
          {config.llmProvider === 'http' && (
            <div className="segmented" role="group" aria-label="Khoảng thời gian">
              {RANGES.map((r) => (
                <button key={r.minutes} className={minutes === r.minutes ? 'active' : ''} onClick={() => setMinutes(r.minutes)}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={run} disabled={state.loading}>
            <Icon name="report" size={14} /> Phân tích
          </button>
        </div>
      </div>

      {!d && !state.loading && !state.error && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Số liệu do mô hình nhận diện (YOLO + ByteTrack) trích xuất từ video: lưu lượng, tốc độ, chiếm dụng, cơ cấu phương tiện. LLM
          diễn giải xu hướng, thời điểm cao điểm, bất thường và đề xuất điều hành.
        </p>
      )}
      {state.loading && <Thinking label="Đang phân tích chuỗi số liệu" />}
      {state.error && <div style={{ color: 'var(--c-danger)', fontSize: 13 }}>{state.error}</div>}

      {d && (
        <div className="stack" style={{ gap: 10, fontSize: 13 }}>
          <div className="traffic-stats">
            <div>
              <span>Lưu lượng TB</span>
              <strong className="num">{d.stats.avgFlow}</strong>
              <small>xe/phút</small>
            </div>
            <div>
              <span>Tốc độ TB</span>
              <strong className="num">{d.stats.avgSpeed}</strong>
              <small>km/h</small>
            </div>
            <div>
              <span>Xu hướng</span>
              <strong className={d.stats.trend === 'tăng' ? 'trend-up' : d.stats.trend === 'giảm' ? 'trend-down' : ''}>
                {d.stats.trend === 'tăng' ? '▲' : d.stats.trend === 'giảm' ? '▼' : '■'} {d.stats.changePct > 0 ? '+' : ''}
                {d.stats.changePct}%
              </strong>
              <small>{d.stats.trend}</small>
            </div>
            <div>
              <span>Dự báo 15′</span>
              <strong className="num">{d.stats.forecast15min}</strong>
              <small>xe/phút</small>
            </div>
          </div>
          <p style={{ margin: 0 }}>{d.summary}</p>
          <p style={{ margin: 0 }} className="muted">
            {d.trend}
          </p>
          <Section title="Thời điểm đáng chú ý" items={d.peaks} />
          <Section title="Bất thường" items={d.anomalies} />
          <div>
            <div className="field-label">Dự báo</div>
            <div>{d.forecast}</div>
          </div>
          <Section title="Đề xuất điều hành" items={d.recommendations} />
          <div className="faint" style={{ fontSize: 12 }}>
            Nguồn số liệu: {d.dataSource} · {d.stats.points} điểm dữ liệu · Mô hình: {d.model}. Kết quả chỉ mang tính tham khảo.
          </div>
        </div>
      )}
    </section>
  );
}
