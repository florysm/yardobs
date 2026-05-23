import { STORAGE_KEYS } from './storageKeys';

export async function apiFetch(url, options = {}) {
  const headers = { ...options.headers };
  try {
    const key = localStorage.getItem(STORAGE_KEYS.TWC_API_KEY);
    if (key) headers['X-TWC-Key'] = key;
  } catch {}
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
