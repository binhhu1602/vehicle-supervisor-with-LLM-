import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext.jsx';
import { Icon } from '../components/common/Icon.jsx';
import { DEMO_USERS } from '../services/api/authService.js';
import { ROLE_LABEL } from '../domain/constants.js';
import { config } from '../config/env.js';
import { TrafficLightLogo } from '../components/layout/Sidebar.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(form.username, form.password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero" aria-hidden>
        <div className="login-hero-brand">
          <TrafficLightLogo />
          <span>{config.appName}</span>
        </div>
        <div className="hero-light">
          <span className="red" />
          <span className="yellow" />
          <span className="green" />
        </div>
        <div className="login-hero-text">
          <h2>
            Giám sát giao thông <em>thời gian thực</em>
          </h2>
          <p>Theo dõi lưu lượng, phát hiện sự cố tức thời và ra quyết định điều hành nhanh hơn với trợ lý LLM.</p>
          <div className="hero-stats">
            <div>
              <strong>8</strong>
              <span>nút giao</span>
            </div>
            <div>
              <strong>2s</strong>
              <span>chu kỳ cập nhật</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>giám sát</span>
            </div>
          </div>
        </div>
        <div className="road" />
      </section>

      <div className="login-side">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-head">
          <h1>Đăng nhập</h1>
          <p>Chào mừng trở lại trung tâm điều hành</p>
        </div>

        <label className="field">
          <span className="field-label">Tên đăng nhập</span>
          <input
            className="input"
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field-label">Mật khẩu</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>

        {error && (
          <div role="alert" className="login-error">
            <Icon name="xCircle" size={15} strokeWidth={2.2} />
            {error}
          </div>
        )}

        <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
          {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>

        {config.dataSource === 'mock' && (
          <div className="demo-accounts">
            <div className="field-label">Tài khoản dùng thử</div>
            <table>
              <tbody>
                {DEMO_USERS.map((u) => (
                  <tr key={u.username}>
                    <td className="mono">{u.username}</td>
                    <td className="faint">{ROLE_LABEL[u.role]}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-link"
                        aria-label={`Điền tài khoản ${u.username} · ${ROLE_LABEL[u.role]}`}
                        onClick={() => setForm({ username: u.username, password: u.password })}
                      >
                        Điền
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </form>
      <div className="login-foot">
        Phiên bản {config.version} · Đồ án Công nghệ phần mềm
      </div>
      </div>
    </div>
  );
}
