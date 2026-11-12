import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '../common/Card.jsx';
import { Icon } from '../common/Icon.jsx';
import { Markdown } from '../common/Markdown.jsx';
import { Thinking } from '../common/EmptyState.jsx';
import { useLlm } from '../../hooks/useLlm.js';
import { useLlmContext } from '../../hooks/useTrafficData.js';
import { formatTime } from '../../utils/format.js';

/** Thẻ "Nhận định của AI": LLM tóm tắt tình hình từ dữ liệu thời gian thực. */
export function AiInsightPanel({ ready }) {
  const llm = useLlm();
  const context = useLlmContext();
  const contextRef = useRef(context);
  contextRef.current = context;
  const [text, setText] = useState('');
  const [at, setAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const out = await llm.summarize({ context: contextRef.current, signal: ctrl.signal });
      setText(out);
      setAt(Date.now());
    } catch (e) {
      if (e.name !== 'AbortError') setError('Không thể lấy nhận định từ AI. Vui lòng thử lại.');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [llm]);

  useEffect(() => {
    if (ready && !at) run();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <Card
      title={
        <span className="row">
          Nhận định tình hình <span className="tag">LLM</span>
        </span>
      }
      subtitle={at ? `Cập nhật lúc ${formatTime(at, true)} · ${llm.name}` : llm.name}
      actions={
        <button className="btn btn-sm" onClick={run} disabled={loading || !ready}>
          <Icon name="refresh" size={14} /> Làm mới
        </button>
      }
    >
      {loading ? <Thinking /> : error ? <div style={{ color: 'var(--c-danger)' }}>{error}</div> : <Markdown text={text} />}
    </Card>
  );
}
