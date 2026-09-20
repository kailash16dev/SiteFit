const API_BASE = import.meta.env.VITE_API_BASE || '';
export const TOKEN_KEY = 'sitefit:serpapi-token';
export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export async function apiPost(path, body, token = '') {
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Serpapi-Token': token } : {}) }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data?.error?.message || 'Request failed.'); error.status = response.status; error.code = data?.error?.code; error.partialResults = data?.partialResults || []; throw error; }
  return data;
}
