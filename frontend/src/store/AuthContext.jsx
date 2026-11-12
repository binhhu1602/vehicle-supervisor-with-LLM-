import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createAuthService } from '../services/api/authService.js';
import { httpClient } from '../services/api/httpClient.js';
import { can as canDo } from '../domain/permissions.js';
import { config } from '../config/env.js';

const AuthContext = createContext(null);
const USER_KEY = 'te.user';

function readStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children, authService = createAuthService(config) }) {
  const [user, setUser] = useState(readStoredUser);

  const login = useCallback(
    async (username, password) => {
      const { user: u, token } = await authService.login(username, password);
      try {
        sessionStorage.setItem(USER_KEY, JSON.stringify(u));
        sessionStorage.setItem(httpClient.TOKEN_KEY, token);
      } catch {
        /* trình duyệt chặn storage: vẫn đăng nhập trong phiên hiện tại */
      }
      setUser(u);
      return u;
    },
    [authService],
  );

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(httpClient.TOKEN_KEY);
    } catch {
      /* bỏ qua */
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, can: (permission) => canDo(user, permission) }),
    [user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>');
  return ctx;
}
