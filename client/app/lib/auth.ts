import { API_BASE_URL } from './api';

export interface UserData {
  username: string;
  nombre: string | null;
  apellido: string | null;
  rol: string;
}

export interface LoginResponse {
  access_token: string;
  user: UserData;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Error al iniciar sesión');
  }

  return res.json();
}

export function setToken(token: string) {
  document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24}`;
}

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
  return match ? match[1] : null;
}

export function setUser(user: UserData) {
  document.cookie = `user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${60 * 60 * 24}`;
}

export function getUser(): UserData | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )user=([^;]*)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function removeToken() {
  document.cookie = 'token=; path=/; max-age=0';
  document.cookie = 'user=; path=/; max-age=0';
}

/**
 * Builds the Authorization header from the cookie-stored token.
 *
 * The `token`/`user` cookies are read only by Next.js middleware (routing)
 * and by the client (user hydration). The NestJS backend never reads the
 * cookie — it authenticates exclusively via `Authorization: Bearer <token>`.
 * This helper is the single place that bridges the cookie-stored token into
 * that Bearer header for authenticated fetches.
 */
export function getAuthHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
