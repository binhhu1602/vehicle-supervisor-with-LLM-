import { useNavigate } from 'react-router-dom';
import { StatusPanel } from '../components/common/EmptyState.jsx';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <StatusPanel
      tone="warn"
      icon="compass"
      title="Không tìm thấy trang"
      subtitle="Đường dẫn không tồn tại hoặc đã bị thay đổi"
      actions={
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          Về trang Tổng quan
        </button>
      }
    />
  );
}
