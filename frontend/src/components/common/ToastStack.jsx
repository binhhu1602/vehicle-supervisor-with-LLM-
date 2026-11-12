import { useToast } from '../../store/ToastContext.jsx';
import { Icon } from './Icon.jsx';

export function ToastStack() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.tone}`}
          role="alert"
          onClick={() => {
            t.onClick?.();
            dismiss(t.id);
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="toast-title">{t.title}</div>
            {t.message && <div className="toast-msg">{t.message}</div>}
          </div>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="Đóng thông báo"
            onClick={(e) => {
              e.stopPropagation();
              dismiss(t.id);
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
