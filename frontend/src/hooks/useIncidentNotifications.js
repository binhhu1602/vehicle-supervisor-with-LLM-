import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTraffic } from '../store/TrafficContext.jsx';
import { useSettings } from '../store/SettingsContext.jsx';
import { useToast } from '../store/ToastContext.jsx';
import { INCIDENT_TYPES, REALTIME_EVENTS, SEVERITY } from '../domain/constants.js';

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* không hỗ trợ âm thanh */
  }
}

/** Observer: lắng nghe sự cố mới và hiển thị thông báo theo cài đặt người dùng. */
export function useIncidentNotifications() {
  const { subscribe } = useTraffic();
  const { settings } = useSettings();
  const { notify } = useToast();
  const navigate = useNavigate();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(
    () =>
      subscribe(REALTIME_EVENTS.INCIDENT_NEW, (inc) => {
        const s = settingsRef.current;
        if (!s.notifications) return;
        if (SEVERITY[inc.severity].rank < SEVERITY[s.minNotifySeverity].rank) return;
        const tone = ['HIGH', 'CRITICAL'].includes(inc.severity) ? 'danger' : 'warn';
        notify({
          title: INCIDENT_TYPES[inc.type].label,
          message: `${inc.cameraName} · Mức ${SEVERITY[inc.severity].label} · ${inc.id}`,
          tone,
          onClick: () => navigate(`/incidents?id=${inc.id}`),
        });
        if (s.sound) beep();
      }),
    [subscribe, notify, navigate],
  );
}
