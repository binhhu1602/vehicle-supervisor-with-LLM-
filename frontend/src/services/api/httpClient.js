/**
 * Lớp bọc fetch dùng chung: gắn token, timeout, chuẩn hóa lỗi.
 */
const TOKEN_KEY = 'te.token';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function authHeaders() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function raw(url, { timeoutMs = 30000, signal, headers, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...headers },
    });
    if (!res.ok) throw new HttpError(res.status, `Yêu cầu thất bại (${res.status})`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export const httpClient = {
  raw,
  async get(url, opts) {
    return (await raw(url, opts)).json();
  },
  async post(url, body, opts) {
    return (await raw(url, { ...opts, method: 'POST', body: JSON.stringify(body) })).json();
  },
  TOKEN_KEY,
};
