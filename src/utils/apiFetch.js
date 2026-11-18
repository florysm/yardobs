import { STORAGE_KEYS, readStored } from './storageKeys';

// fetch with the saved TWC key attached. A caller that passes its own key
// header (StationForm testing a key before saving it) keeps that one.
// Throws on a non-2xx with the server's error message and `status` set, so
// callers can tell an answer from the server apart from no answer at all.
export async function apiFetch(url, options = {}) {
  const headers = { ...options.headers };
  const hasKey = Object.keys(headers).some(h => h.toLowerCase() === 'x-twc-key');
  const key = hasKey ? null : readStored(STORAGE_KEYS.TWC_API_KEY);
  if (key) headers['X-TWC-Key'] = key;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const d = await res.json(); if (d?.error) msg = d.error; } catch {}
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return res.json();
}
