import { lazy, Suspense } from 'react';

// Tải Leaflet theo nhu cầu: trang Tổng quan vẫn mở nhanh, bản đồ hiện sau khi tải xong
const TrafficMap = lazy(() => import('./TrafficMap.jsx').then((m) => ({ default: m.TrafficMap })));

export function LazyTrafficMap({ height = 300, ...props }) {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height }} />}>
      <TrafficMap height={height} {...props} />
    </Suspense>
  );
}
