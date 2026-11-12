import { useState } from 'react';
import { Modal } from '../common/Modal.jsx';
import { IncidentTypeLabel, SeverityBadge, StatusBadge } from '../common/Badges.jsx';
import { IncidentAiAnalysis } from './IncidentAiAnalysis.jsx';
import { availableActions, TRANSITIONS } from '../../domain/incidentStateMachine.js';
import { INCIDENT_STATUS_LABEL } from '../../domain/constants.js';
import { useAuth } from '../../store/AuthContext.jsx';
import { useTraffic } from '../../store/TrafficContext.jsx';
import { formatDateTime } from '../../utils/format.js';

const ACTION_STYLE = { acknowledge: 'btn-primary', start: 'btn-primary', resolve: 'btn-primary', falseAlarm: 'btn-danger', reopen: '' };

export function IncidentDetail({ incident, onClose }) {
  const { user, can } = useAuth();
  const { actions } = useTraffic();
  const [note, setNote] = useState('');
  if (!incident) return null;
  const canUpdate = can('incident:update');
  const allowed = availableActions(incident.status);

  const run = (action) => {
    actions.transitionIncident(incident.id, action, user.name, note.trim());
    setNote('');
  };

  return (
    <Modal open variant="drawer" onClose={onClose} title={<span className="mono">{incident.id}</span>}>
      <div className="stack">
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>
            <IncidentTypeLabel type={incident.type} />
          </h2>
          <div className="row row-wrap">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
            <span className="faint" style={{ fontSize: 12 }}>
              {formatDateTime(incident.createdAt)}
            </span>
          </div>
        </div>

        <dl className="kv">
          <dt>Vị trí</dt>
          <dd>
            {incident.cameraName} ({incident.cameraId}) · {incident.district}
          </dd>
          <dt>Mô tả</dt>
          <dd>{incident.description}</dd>
          <dt>Số liệu lúc phát hiện</dt>
          <dd className="num">
            {incident.snapshot.flow} xe/ph · {incident.snapshot.avgSpeed} km/h
          </dd>
        </dl>

        <IncidentAiAnalysis incident={incident} />

        <section>
          <h3 className="card-title" style={{ marginBottom: 8 }}>
            Xử lý sự cố
          </h3>
          {canUpdate ? (
            <div className="stack" style={{ gap: 10 }}>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Ghi chú xử lý (không bắt buộc)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                aria-label="Ghi chú xử lý"
              />
              <div className="row row-wrap">
                {allowed.map((a) => (
                  <button key={a} className={`btn ${ACTION_STYLE[a]}`} onClick={() => run(a)}>
                    {TRANSITIONS[a].label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="faint">Tài khoản Người xem không có quyền cập nhật sự cố.</div>
          )}
        </section>

        <section>
          <h3 className="card-title" style={{ marginBottom: 8 }}>
            Lịch sử xử lý
          </h3>
          <ol className="timeline">
            {[...incident.timeline].reverse().map((t, idx) => (
              <li key={`${t.at}-${idx}`}>
                <div className="row space-between">
                  <strong style={{ fontSize: 13 }}>
                    {t.action === 'detected' ? 'Phát hiện tự động' : TRANSITIONS[t.action]?.label ?? t.action}
                  </strong>
                  <span className="faint num" style={{ fontSize: 12 }}>
                    {formatDateTime(t.at)}
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {t.actor}
                  {t.from ? ` · ${INCIDENT_STATUS_LABEL[t.from]} → ${INCIDENT_STATUS_LABEL[t.to]}` : ''}
                </div>
                {t.note && <div style={{ fontSize: 13, marginTop: 2 }}>“{t.note}”</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Modal>
  );
}
