import { useEffect, useState } from 'react';
import { useMatches } from 'react-router-dom';
import { Icon } from '../common/Icon.jsx';
import { ConnectionStatus } from './ConnectionStatus.jsx';
import { useAuth } from '../../store/AuthContext.jsx';
import { useSettings } from '../../store/SettingsContext.jsx';
import { ROLE_LABEL } from '../../domain/constants.js';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="topbar-clock">
      {now.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })} ·{' '}
      {now.toLocaleTimeString('vi-VN')}
    </span>
  );
}

export function Topbar({ onToggleMenu }) {
  const { user, logout } = useAuth();
  const { settings, update } = useSettings();
  const matches = useMatches();
  const title = [...matches].reverse().find((m) => m.handle?.title)?.handle.title ?? '';
  const dark = settings.theme === 'dark';

  return (
    <header className="topbar">
      <button className="btn btn-ghost btn-icon menu-toggle" onClick={onToggleMenu} aria-label="Mở menu">
        <Icon name="menu" />
      </button>
      <h1 className="topbar-title">{title}</h1>
      <ConnectionStatus />
      <div className="topbar-spacer" />
      <Clock />
      <button
        className="btn btn-ghost btn-icon"
        onClick={() => update({ theme: dark ? 'light' : 'dark' })}
        aria-label={dark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
        title={dark ? 'Giao diện sáng' : 'Giao diện tối'}
      >
        <Icon name={dark ? 'sun' : 'moon'} />
      </button>
      <div className="topbar-user">
        <div className="user-text" style={{ textAlign: 'right', lineHeight: 1.25 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
          <div className="faint" style={{ fontSize: 11 }}>
            {ROLE_LABEL[user?.role]}
          </div>
        </div>
        <div className="avatar" aria-hidden>
          {user?.name
            ?.split(' ')
            .slice(-2)
            .map((w) => w[0])
            .join('')}
        </div>
        <button className="btn btn-ghost btn-icon" onClick={logout} aria-label="Đăng xuất" title="Đăng xuất">
          <Icon name="logout" />
        </button>
      </div>
    </header>
  );
}
