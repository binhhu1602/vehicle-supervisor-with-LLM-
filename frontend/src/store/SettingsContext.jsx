import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_THRESHOLDS } from '../domain/congestion.js';

const SettingsContext = createContext(null);
const KEY = 'te.settings.v2'; // v2: giao diện mới, mặc định sáng

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  notifications: true,
  minNotifySeverity: 'MEDIUM',
  sound: false,
  thresholds: DEFAULT_THRESHOLDS,
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved ? { ...DEFAULT_SETTINGS, ...saved, thresholds: { ...DEFAULT_THRESHOLDS, ...saved.thresholds } } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* bỏ qua */
    }
  }, [settings]);

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings phải được dùng bên trong <SettingsProvider>');
  return ctx;
}
