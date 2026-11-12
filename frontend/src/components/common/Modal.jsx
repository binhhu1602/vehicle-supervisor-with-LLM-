import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';

/** Hộp thoại (variant="modal") hoặc ngăn kéo bên phải (variant="drawer"). Đóng bằng Esc hoặc click nền. */
export function Modal({ open, onClose, title, actions, children, variant = 'modal', labelledBy = 'modal-title' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className={`overlay ${variant === 'drawer' ? 'drawer' : ''}`} onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id={labelledBy} style={{ fontSize: 16, flex: 1, minWidth: 0 }}>
            {title}
          </h3>
          {actions}
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
