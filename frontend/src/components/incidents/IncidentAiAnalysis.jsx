import { useEffect, useRef, useState } from 'react';
import { useLlm } from '../../hooks/useLlm.js';
import { useLlmContext } from '../../hooks/useTrafficData.js';
import { Thinking } from '../common/EmptyState.jsx';
import { Icon } from '../common/Icon.jsx';

/** Phân tích sự cố bằng LLM: tóm tắt, nguyên nhân, tác động, hành động đề xuất. */
export function IncidentAiAnalysis({ incident }) {
  const llm = useLlm();
  const context = useLlmContext();
  const contextRef = useRef(context);
  contextRef.current = context;
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ loading: true, data: null, error: '' });
    llm
      .analyzeIncident({ incident, context: contextRef.current, signal: ctrl.signal })
      .then((data) => setState({ loading: false, data, error: '' }))
      .catch((e) => {
        if (e.name !== 'AbortError') setState({ loading: false, data: null, error: 'Không phân tích được sự cố.' });
      });
    return () => ctrl.abort();
  }, [incident.id, nonce, llm]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="ai-box">
      <div className="row space-between" style={{ marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>
          Phân tích sự cố <span className="tag">LLM</span>
        </strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setNonce((n) => n + 1)} disabled={state.loading}>
          <Icon name="refresh" size={13} /> Phân tích lại
        </button>
      </div>
      {state.loading && <Thinking />}
      {state.error && <div style={{ color: 'var(--c-danger)' }}>{state.error}</div>}
      {state.data && (
        <div className="stack" style={{ gap: 10, fontSize: 13 }}>
          <p style={{ margin: 0 }}>{state.data.summary}</p>
          <div>
            <div className="field-label">Nguyên nhân có thể</div>
            <div>{state.data.probableCause}</div>
          </div>
          <div>
            <div className="field-label">Tác động dự kiến</div>
            <div>{state.data.impact}</div>
          </div>
          <div>
            <div className="field-label">Hành động đề xuất</div>
            <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {state.data.recommendedActions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
          </div>
          <div className="faint" style={{ fontSize: 12 }}>
            Mô hình: {state.data.model} · Độ tin cậy phát hiện: {Math.round(state.data.confidence * 100)}% · Kết quả AI
            chỉ mang tính tham khảo, người điều hành chịu trách nhiệm quyết định.
          </div>
        </div>
      )}
    </section>
  );
}
