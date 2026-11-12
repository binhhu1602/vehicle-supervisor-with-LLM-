import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { ToastStack } from '../common/ToastStack.jsx';
import { useIncidentNotifications } from '../../hooks/useIncidentNotifications.js';
import { useTraffic } from '../../store/TrafficContext.jsx';
import { useSettings } from '../../store/SettingsContext.jsx';
import { config } from '../../config/env.js';

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { actions } = useTraffic();
  const { settings } = useSettings();
  useIncidentNotifications();

  // Chế độ giả lập: ngưỡng lưu ở trình duyệt → đồng bộ vào bộ giả lập.
  // Chế độ backend: ngưỡng do server quản lý, chỉ gửi khi Quản trị viên bấm "Lưu" (SettingsPage).
  useEffect(() => {
    if (config.dataSource === 'mock') actions.updateThresholds(settings.thresholds);
  }, [actions, settings.thresholds]);
  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="main">
        <Topbar onToggleMenu={() => setMenuOpen((o) => !o)} />
        <main className="content" onClick={() => menuOpen && setMenuOpen(false)}>
          <Outlet />
        </main>
      </div>
      <ToastStack />
    </div>
  );
}
