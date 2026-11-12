import { useState } from 'react';
import { useNavigate, useRouteError } from 'react-router-dom';
import { StatusPanel } from '../components/common/EmptyState.jsx';

/** Trang lỗi: lỗi ở một trang không làm sập toàn bộ ứng dụng (yêu cầu độ tin cậy). */
export default function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [showStack, setShowStack] = useState(false);
  console.error('[ErrorPage]', error);
  const message = error?.message ?? String(error ?? 'Lỗi không xác định');

  return (
    <div style={{ padding: 24 }}>
      <StatusPanel
        tone="danger"
        icon="x"
        title="Không thể hiển thị trang"
        subtitle="Đã xảy ra lỗi trong quá trình tải giao diện"
        actions={
          <>
            <button className="btn btn-primary" onClick={() => setShowStack((s) => !s)}>
              {showStack ? 'Ẩn chi tiết' : 'Xem chi tiết'}
            </button>
            <button className="btn btn-warn" onClick={() => window.location.reload()}>
              Thử lại
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Về trang Tổng quan
            </button>
          </>
        }
        details={showStack && error?.stack ? error.stack : message}
      />
    </div>
  );
}
