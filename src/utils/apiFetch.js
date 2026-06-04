import { STORAGE_KEYS } from './storageKeys';

export async function apiFetch(url, options = {}) {
  const headers = { ...options.headers };
  try {
    const key = localStorage.getItem(STORAGE_KEYS.TWC_API_KEY);
    if (key) headers['X-TWC-Key'] = key;
  } catch {
    // localStorage unavailable (e.g. private browsing); proceed without the key
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); if (d?.error) msg = d.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
