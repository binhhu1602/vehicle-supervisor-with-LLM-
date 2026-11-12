import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/AuthContext.jsx';
import { StatusPanel } from '../common/EmptyState.jsx';

/** Chặn truy cập khi chưa đăng nhập hoặc không đủ quyền. */
export function RequireAuth({ children, permission }) {
  const { user, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(permission)) {
    return (
      <StatusPanel
        tone="warn"
        icon="lock"
        title="Không đủ quyền truy cập"
        subtitle="Tài khoản của bạn không được phép xem trang này"
        actions={
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Về trang Tổng quan
          </button>
        }
      />
    );
  }
  return children;
}
