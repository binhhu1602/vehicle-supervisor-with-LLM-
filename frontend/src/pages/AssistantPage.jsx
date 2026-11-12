import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/common/Icon.jsx';
import { Markdown } from '../components/common/Markdown.jsx';
import { Thinking } from '../components/common/EmptyState.jsx';
import { useLlm } from '../hooks/useLlm.js';
import { useLlmContext } from '../hooks/useTrafficData.js';
import { useAuth } from '../store/AuthContext.jsx';
import { formatTime } from '../utils/format.js';

const SUGGESTIONS = [
  'Tóm tắt tình hình giao thông hiện tại',
  'Những điểm nào đang ùn tắc?',
  'Có sự cố nào nghiêm trọng không?',
  'Đề xuất phương án điều hành',
  'Tình hình ở Ngã ba Huế thế nào?',
  'Camera nào đang mất tín hiệu?',
];
const STORE_KEY = 'te.chat';
const MAX_HISTORY = 12; // giới hạn số lượt gửi cho LLM để kiểm soát chi phí token

function loadChat() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY)) ?? [];
  } catch {
    return [];
  }
}

export default function AssistantPage() {
  const llm = useLlm();
  const context = useLlmContext();
  const contextRef = useRef(context);
  contextRef.current = context;
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [messages, setMessages] = useState(loadChat);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(messages.filter((m) => !m.pending)));
    } catch {
      /* bỏ qua */
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const send = useCallback(
    async (text) => {
      const question = text.trim();
      if (!question || streaming) return;
      const userMsg = { id: Date.now(), role: 'user', content: question, at: Date.now() };
      const botId = userMsg.id + 1;
      const history = [...messages, userMsg].slice(-MAX_HISTORY).map(({ role, content }) => ({ role, content }));
      setMessages((m) => [...m, userMsg, { id: botId, role: 'assistant', content: '', at: Date.now(), pending: true }]);
      setInput('');
      setStreaming(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const patch = (fn) => setMessages((m) => m.map((x) => (x.id === botId ? fn(x) : x)));
      try {
        for await (const chunk of llm.chat({ messages: history, context: contextRef.current, signal: ctrl.signal })) {
          patch((x) => ({ ...x, content: x.content + chunk }));
        }
        patch((x) => ({ ...x, pending: false }));
      } catch (e) {
        patch((x) => ({
          ...x,
          pending: false,
          content: e.name === 'AbortError' ? `${x.content}\n\n(đã dừng)` : 'Lỗi: không kết nối được tới dịch vụ LLM. Vui lòng thử lại.',
          error: e.name !== 'AbortError',
        }));
      } finally {
        setStreaming(false);
      }
    },
    [llm, messages, streaming],
  );

  // Hỗ trợ mở trợ lý với câu hỏi sẵn: /assistant?q=...
  useEffect(() => {
    const q = params.get('q');
    if (q && context.cameras.length) {
      setParams({}, { replace: true });
      send(q);
    }
  }, [params, context.cameras.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = (e) => {
    e.preventDefault();
    send(input);
  };

  return (
    <div className="chat-layout">
      <section className="card chat-panel">
        <header className="card-header">
          <div>
            <h3 className="card-title">Trợ lý AI điều hành giao thông</h3>
            <div className="card-subtitle">
              {llm.name} · Trả lời dựa trên dữ liệu thời gian thực của {context.cameras.length} camera
            </div>
          </div>
          <div className="card-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => setMessages([])} disabled={streaming || !messages.length}>
              Cuộc hội thoại mới
            </button>
          </div>
        </header>

        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <div className="status-icon info" aria-hidden>
                <Icon name="bot" size={24} strokeWidth={2.2} />
              </div>
              <h3>Trợ lý điều hành giao thông</h3>
              <p className="muted">
                Chào {user?.name?.split(' ').at(-1)}. Đặt câu hỏi về tình hình giao thông, sự cố hoặc yêu cầu đề xuất phương án
                điều hành. Chọn nhanh một câu hỏi mẫu:
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggestion" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`msg msg-${m.role} ${m.error ? 'msg-error' : ''}`}>
              <div className="msg-avatar" aria-hidden>
                <Icon name={m.role === 'user' ? 'user' : 'bot'} size={16} />
              </div>
              <div className="msg-bubble">
                {m.role === 'assistant' && m.pending && !m.content ? <Thinking label="Đang suy nghĩ" /> : <Markdown text={m.content} />}
                <div className="msg-time">{formatTime(m.at)}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className="chat-input" onSubmit={submit}>
          <textarea
            className="textarea"
            rows={1}
            value={input}
            placeholder="Nhập câu hỏi… (Enter để gửi, Shift+Enter xuống dòng)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            aria-label="Câu hỏi cho trợ lý AI"
            maxLength={1000}
          />
          {streaming ? (
            <button type="button" className="btn btn-danger" onClick={() => abortRef.current?.abort()}>
              <Icon name="stop" size={14} /> Dừng
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!input.trim()}>
              <Icon name="send" size={14} /> Gửi
            </button>
          )}
        </form>
      </section>

      <aside className="card chat-context">
        <header className="card-header">
          <div>
            <h3 className="card-title">Ngữ cảnh gửi cho AI</h3>
            <div className="card-subtitle">Cập nhật theo thời gian thực</div>
          </div>
        </header>
        <div className="card-body stack" style={{ gap: 10, fontSize: 13 }}>
          <div className="kv-grid">
            <span className="muted">Chỉ số ùn tắc</span>
            <strong className="num">{context.kpis.congestionIndex}/100</strong>
            <span className="muted">Tổng lưu lượng</span>
            <strong className="num">{context.kpis.totalFlow} xe/ph</strong>
            <span className="muted">Tốc độ TB</span>
            <strong className="num">{context.kpis.avgSpeed} km/h</strong>
            <span className="muted">Sự cố đang mở</span>
            <strong className="num">{context.kpis.openIncidents}</strong>
            <span className="muted">Camera online</span>
            <strong className="num">
              {context.kpis.camerasOnline}/{context.kpis.camerasTotal}
            </strong>
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            AI chỉ sử dụng dữ liệu tổng hợp ở trên, không truy cập hình ảnh cá nhân. Câu trả lời mang tính tham khảo; quyết
            định điều hành thuộc về người vận hành.
          </p>
        </div>
      </aside>
    </div>
  );
}
