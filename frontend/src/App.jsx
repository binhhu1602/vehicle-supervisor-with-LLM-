import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout.jsx';
import { RequireAuth } from './components/layout/RequireAuth.jsx';
import { NAV_ITEMS } from './components/layout/Sidebar.jsx';
import { AuthProvider } from './store/AuthContext.jsx';
import { SettingsProvider } from './store/SettingsContext.jsx';
import { ToastProvider } from './store/ToastContext.jsx';
import { TrafficProvider } from './store/TrafficContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import ErrorPage from './pages/ErrorPage.jsx';

// Tách mã theo trang (code splitting) để tải nhanh trang đầu tiên — yêu cầu hiệu năng
const MapPage = lazy(() => import('./pages/MapPage.jsx'));
const CamerasPage = lazy(() => import('./pages/CamerasPage.jsx'));
const IncidentsPage = lazy(() => import('./pages/IncidentsPage.jsx'));
const AssistantPage = lazy(() => import('./pages/AssistantPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

const PAGES = {
  '/': DashboardPage,
  '/map': MapPage,
  '/cameras': CamerasPage,
  '/incidents': IncidentsPage,
  '/assistant': AssistantPage,
  '/reports': ReportsPage,
  '/settings': SettingsPage,
};

const loading = <div className="skeleton" style={{ height: 240 }} />;

/** Chỉ kết nối dữ liệu thời gian thực sau khi người dùng đã đăng nhập. */
function ProtectedShell() {
  return (
    <RequireAuth>
      <TrafficProvider>
        <AppLayout />
      </TrafficProvider>
    </RequireAuth>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <ErrorPage /> },
  {
    path: '/',
    element: <ProtectedShell />,
    errorElement: <ErrorPage />,
    children: [
      ...NAV_ITEMS.filter((n) => n.to).map((n) => {
        const Page = PAGES[n.to];
        return {
          ...(n.to === '/' ? { index: true } : { path: n.to.slice(1) }),
          handle: { title: n.title },
          errorElement: <ErrorPage />,
          element: (
            <RequireAuth permission={n.perm}>
              <Suspense fallback={loading}>
                <Page />
              </Suspense>
            </RequireAuth>
          ),
        };
      }),
      { path: '*', element: <NotFoundPage />, handle: { title: 'Không tìm thấy' } },
    ],
  },
], {
  future: { v7_relativeSplatPath: true, v7_fetcherPersist: true, v7_normalizeFormMethod: true, v7_partialHydration: true, v7_skipActionErrorRevalidation: true },
});

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </ToastProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
