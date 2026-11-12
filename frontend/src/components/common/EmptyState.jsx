import { Icon } from './Icon.jsx';

export function EmptyState({ icon = 'inbox', title, children }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        <Icon name={icon} size={28} strokeWidth={1.5} />
      </div>
      {title && <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{title}</div>}
      {children && <div style={{ fontSize: 13, marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function Thinking({ label = 'Đang phân tích' }) {
  return (
    <div className="row muted" role="status">
      <span className="dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {label}…
    </div>
  );
}

/**
 * Bảng trạng thái: icon tròn viền, tiêu đề lớn, dòng phụ, hàng nút và (tùy chọn) khung chi tiết lỗi.
 */
export function StatusPanel({ tone = 'danger', icon = 'x', title, subtitle, actions, details, detailsTitle = 'Chi tiết lỗi:' }) {
  return (
    <div className="status-panel" role={tone === 'danger' ? 'alert' : undefined}>
      <div className={`status-icon ${tone}`} aria-hidden>
        <Icon name={icon} size={26} strokeWidth={2.4} />
      </div>
      <div className="status-title">{title}</div>
      {subtitle && <div className="status-sub">{subtitle}</div>}
      {actions && <div className="status-actions">{actions}</div>}
      {details && (
        <div className="error-details">
          <div className="error-details-title">
            <Icon name="xCircle" size={16} strokeWidth={2.2} />
            {detailsTitle}
          </div>
          <pre>{details}</pre>
        </div>
      )}
    </div>
  );
}
