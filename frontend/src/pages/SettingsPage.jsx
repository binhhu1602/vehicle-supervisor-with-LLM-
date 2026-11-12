import { useState } from 'react';
import { Card } from '../components/common/Card.jsx';
import { useSettings } from '../store/SettingsContext.jsx';
import { useAuth } from '../store/AuthContext.jsx';
import { useToast } from '../store/ToastContext.jsx';
import { useTraffic } from '../store/TrafficContext.jsx';
import { SEVERITY } from '../domain/constants.js';
import { DEFAULT_THRESHOLDS } from '../domain/congestion.js';
import { config } from '../config/env.js';

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="row space-between setting-row">
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function validateThresholds(t) {
  const errors = [];
  if (!(t.jamSpeed > 0 && t.jamSpeed < t.slowSpeed && t.slowSpeed < t.busySpeed)) {
    errors.push('Ngưỡng tốc độ phải thỏa: 0 < Tắc nghiêm trọng < Ùn ứ < Đông xe');
  }
  if (!(t.highOccupancy > 0 && t.highOccupancy <= 1)) errors.push('Tỉ lệ chiếm dụng phải trong khoảng (0, 1]');
  return errors;
}

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { can } = useAuth();
  const { notify } = useToast();
  const { actions } = useTraffic();
  const [draft, setDraft] = useState(settings.thresholds);
  const errors = validateThresholds(draft);
  const editable = can('settings:edit');

  const saveThresholds = () => {
    update({ thresholds: draft });
    if (config.dataSource !== 'mock') actions.updateThresholds(draft); // gửi lên server (chỉ ADMIN được chấp nhận)
    notify({ title: 'Đã lưu ngưỡng phân loại ùn tắc', tone: 'ok', timeoutMs: 3000 });
  };

  const numField = (key, label, unit, step = 1) => (
    <label className="field" key={key}>
      <span className="field-label">{label}</span>
      <div className="row">
        <input
          className="input num"
          type="number"
          step={step}
          value={draft[key]}
          disabled={!editable}
          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
          style={{ width: 120 }}
        />
        <span className="faint">{unit}</span>
      </div>
    </label>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Cài đặt</h2>
          <p>Tùy chỉnh giao diện, thông báo và tham số phân tích.</p>
        </div>
      </div>
      <div className="grid grid-2-even">
        <div className="stack">
          <Card title="Giao diện & thông báo">
            <div className="stack" style={{ gap: 4 }}>
              <div className="row space-between setting-row">
                <div style={{ fontWeight: 500 }}>Chủ đề giao diện</div>
                <div className="segmented">
                  {[
                    ['dark', 'Tối'],
                    ['light', 'Sáng'],
                  ].map(([k, l]) => (
                    <button key={k} className={settings.theme === k ? 'active' : ''} onClick={() => update({ theme: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle
                label="Thông báo sự cố mới"
                hint="Hiển thị thông báo góc màn hình khi phát hiện sự cố"
                checked={settings.notifications}
                onChange={(v) => update({ notifications: v })}
              />
              <label className="row space-between setting-row">
                <div>
                  <div style={{ fontWeight: 500 }}>Mức độ tối thiểu để thông báo</div>
                </div>
                <select className="select" value={settings.minNotifySeverity} onChange={(e) => update({ minNotifySeverity: e.target.value })}>
                  {Object.entries(SEVERITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle label="Âm thanh cảnh báo" checked={settings.sound} onChange={(v) => update({ sound: v })} />
            </div>
          </Card>

          <Card title="Thông tin hệ thống">
            <div className="kv-grid" style={{ fontSize: 13 }}>
              <span className="muted">Phiên bản</span>
              <span className="mono">{config.version}</span>
              <span className="muted">Nguồn dữ liệu</span>
              <span className="mono">{config.dataSource === 'mock' ? 'mock (giả lập)' : `websocket · ${config.wsUrl}`}</span>
              <span className="muted">Nhà cung cấp LLM</span>
              <span className="mono">{config.llmProvider === 'mock' ? 'mock (giả lập)' : `http · ${config.apiBaseUrl}/llm`}</span>
              <span className="muted">Chu kỳ cập nhật</span>
              <span className="mono">{config.mockTickMs} ms</span>
            </div>
            <p className="field-hint" style={{ marginTop: 10 }}>
              Thay đổi nguồn dữ liệu trong file <code>.env.local</code> (xem <code>.env.example</code>).
            </p>
          </Card>
        </div>

        <Card title="Ngưỡng phân loại ùn tắc" subtitle={editable ? 'Áp dụng cho bộ phân tích' : 'Chỉ Quản trị viên được chỉnh sửa'}>
          <div className="stack" style={{ gap: 14 }}>
            {numField('busySpeed', 'Đông xe khi tốc độ dưới', 'km/h')}
            {numField('slowSpeed', 'Ùn ứ khi tốc độ dưới', 'km/h')}
            {numField('jamSpeed', 'Tắc nghiêm trọng khi tốc độ dưới', 'km/h')}
            {numField('highOccupancy', 'Tỉ lệ chiếm dụng làn cao', '(0–1)', 0.05)}
            {errors.length > 0 && (
              <ul role="alert" style={{ color: 'var(--c-danger)', margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {editable && (
              <div className="row">
                <button className="btn btn-primary" disabled={errors.length > 0} onClick={saveThresholds}>
                  Lưu ngưỡng
                </button>
                <button className="btn" onClick={() => setDraft(DEFAULT_THRESHOLDS)}>
                  Mặc định
                </button>
                <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => { reset(); setDraft(DEFAULT_THRESHOLDS); }}>
                  Khôi phục mọi cài đặt
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
