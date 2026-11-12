export const formatNumber = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n ?? 0));

export const formatTime = (ts, withSeconds = false) =>
  ts
    ? new Date(ts).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' } : {}),
      })
    : '—';

export const formatDateTime = (ts) =>
  ts ? new Date(ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—';

/** "vừa xong", "3 phút trước", "2 giờ trước" */
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 30) return 'vừa xong';
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export const formatDelta = (n, unit = '') => (n > 0 ? `+${n}${unit}` : `${n}${unit}`);

/** Xuất mảng đối tượng ra CSV (có BOM để Excel đọc đúng tiếng Việt). */
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','));
  return '﻿' + [header, ...body].join('\n');
}

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
