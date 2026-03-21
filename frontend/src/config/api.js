/**
 * API / WebSocket origins for the FastAPI backend.
 *
 * Production (e.g. Render static site): set VITE_API_URL to the backend origin, e.g.
 *   https://your-api.onrender.com
 * WebSocket base defaults to wss/http→ws from VITE_API_URL, or set VITE_WS_URL explicitly.
 *
 * Local dev: if unset, uses http(s)://<current-host>:8000 and ws(s)://<current-host>:8000.
 */

function stripTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

function httpOriginToWsOrigin(httpUrl) {
  const u = stripTrailingSlash(httpUrl);
  if (u.startsWith('https://')) return `wss://${u.slice('https://'.length)}`;
  if (u.startsWith('http://')) return `ws://${u.slice('http://'.length)}`;
  return u;
}

export function getApiBaseUrl() {
  const env = import.meta.env.VITE_API_URL?.trim();
  if (env) return stripTrailingSlash(env);
  return `http://${window.location.hostname}:8000`;
}

export function getWsBaseUrl() {
  const wsEnv = import.meta.env.VITE_WS_URL?.trim();
  if (wsEnv) return stripTrailingSlash(wsEnv);
  const apiEnv = import.meta.env.VITE_API_URL?.trim();
  if (apiEnv) return httpOriginToWsOrigin(stripTrailingSlash(apiEnv));
  return `ws://${window.location.hostname}:8000`;
}

export const API_BASE_URL = getApiBaseUrl();
export const WS_BASE_URL = getWsBaseUrl();
