import { NavLink } from 'react-router-dom';
import { Icon } from '../common/Icon.jsx';
import { useAuth } from '../../store/AuthContext.jsx';
import { useOpenIncidents } from '../../hooks/useTrafficData.js';
import { config } from '../../config/env.js';

export const NAV_ITEMS = [
  { section: 'Giám sát' },
  { to: '/', label: 'Tổng quan', icon: 'dashboard', end: true, perm: 'dashboard:view', title: 'Tổng quan giao thông' },
  { to: '/map', label: 'Bản đồ', icon: 'map', perm: 'dashboard:view', title: 'Bản đồ giao thông' },
  { to: '/cameras', label: 'Camera', icon: 'camera', perm: 'camera:view', title: 'Camera giám sát' },
  { to: '/incidents', label: 'Sự cố & cảnh báo', icon: 'alert', perm: 'incident:view', badge: true, title: 'Sự cố & cảnh báo' },
  { section: 'Phân tích' },
  { to: '/assistant', label: 'Trợ lý AI', icon: 'bot', perm: 'assistant:use', title: 'Trợ lý AI điều hành' },
  { to: '/reports', label: 'Báo cáo', icon: 'report', perm: 'report:view', title: 'Báo cáo & thống kê' },
  { section: 'Hệ thống' },
  { to: '/settings', label: 'Cài đặt', icon: 'settings', perm: 'dashboard:view', title: 'Cài đặt' },
];

export function TrafficLightLogo() {
  return (
    <div className="tl-logo" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

export function Sidebar({ open, onNavigate }) {
  const { can } = useAuth();
  const newCount = useOpenIncidents().filter((i) => i.status === 'NEW').length;

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Điều hướng chính">
      <div className="brand">
        <TrafficLightLogo />
        <div>
          <div className="brand-name">{config.appName}</div>
          <div className="brand-sub">Giám sát giao thông · AI</div>
        </div>
      </div>
      <nav>
        {NAV_ITEMS.map((item, i) =>
          item.section ? (
            <div key={`s-${i}`} className="nav-section">
              {item.section}
            </div>
          ) : (
            can(item.perm) && (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link" onClick={onNavigate}>
                <Icon name={item.icon} />
                {item.label}
                {item.badge && newCount > 0 && <span className="nav-badge">{newCount}</span>}
              </NavLink>
            )
          ),
        )}
      </nav>
      <div className="sidebar-footer">
        <div>Phiên bản {config.version}</div>
        <div>
          Dữ liệu: <strong>{config.dataSource === 'mock' ? 'Giả lập' : 'WebSocket'}</strong> · LLM:{' '}
          <strong>{config.llmProvider === 'mock' ? 'Giả lập' : 'Backend'}</strong>
        </div>
      </div>
    </aside>
  );
}
