// TWC key clean-up, and the "set up another device" link.

// Spaces, line breaks and zero-width characters that ride along when a key is
// pasted from an email, a note or a web page. None can be part of a real key.
const INVISIBLE = /[\s­​-‍⁠﻿]/g;

export function cleanKey(raw) {
  return String(raw ?? '').replace(INVISIBLE, '');
}

// TWC's PWS keys are 32 letters and digits. When TWC rejects a key that
// doesn't look like one, say what's off instead of only "rejected". Advisory
// only: never used to block a save, in case TWC's key format ever changes.
export const TWC_KEY_LENGTH = 32;
export function keyShapeHint(key) {
  if (!key) return null;
  if (/[^A-Za-z0-9]/.test(key)) return 'The key has characters other than letters and numbers; check for a typo.';
  if (key.length !== TWC_KEY_LENGTH) {
    return `The key entered is ${key.length} characters; TWC keys are ${TWC_KEY_LENGTH}.`;
  }
  return null;
}

// ── Setup link ──────────────────────────────────────────────────────────────
// https://yardobs.app/#setup=<code>
//
// <code> is the station, key, expiry and "open as a dashboard" flag, packed as
// URL-safe base64 so the key isn't readable in the address bar, a screenshot
// or over someone's shoulder. That is scrambling, not encryption: anyone who
// has the whole link can still decode it and use the key, so it's meant for
// your own devices.
//
// It rides in the fragment (after '#'), which browsers never send to any
// server, ours included. A home-screen web app on iOS has its own storage, so
// the app keeps the link in a Safari tab's address until it's added to the
// Home Screen (see consumeDeviceLink in App.jsx).
//
// Links made before this format (#setup&station=…&key=…) still work.

const SETUP_FLAG = 'setup';
const CANONICAL_ORIGIN = 'https://yardobs.app';
const VERCEL_HOST = 'yardobs.vercel.app';

// The origin a setup link should point to. The production app also answers at
// yardobs.vercel.app; a device opened from there would otherwise hand out links
// to that address. Localhost and preview builds keep their own origin so links
// made while testing open the same build.
export function linkOrigin(location) {
  if (!location) return CANONICAL_ORIGIN;
  return location.hostname === VERCEL_HOST ? CANONICAL_ORIGIN : location.origin;
}

// btoa/atob only take Latin-1, so the JSON is percent-encoded first. Works on
// iOS 10, which has no TextEncoder.
function toBase64Url(text) {
  return btoa(encodeURIComponent(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(atob(b64 + '==='.slice((b64.length + 3) % 4)));
}

export function buildDeviceLink(origin, { stationId, key, expires, dashboard = false }) {
  const payload = { s: stationId, k: key };
  if (expires) payload.e = expires;
  if (dashboard) payload.d = 1;
  return `${origin}/#${SETUP_FLAG}=${toBase64Url(JSON.stringify(payload))}`;
}

function normalize({ stationId, key, expires, dashboard }) {
  const sid = String(stationId ?? '').trim();
  const k = cleanKey(key);
  if (!sid || !k) return null;
  return {
    stationId: sid,
    key: k,
    expires: /^\d{4}-\d{2}-\d{2}$/.test(expires ?? '') ? expires : null,
    dashboard: !!dashboard,
  };
}

// { stationId, key, expires, dashboard } from a location.hash, or null when the
// hash isn't a setup link or is missing what's needed.
export function readDeviceLink(hash) {
  if (typeof hash !== 'string') return null;
  if (hash.startsWith(`#${SETUP_FLAG}=`)) {
    try {
      const p = JSON.parse(fromBase64Url(hash.slice(SETUP_FLAG.length + 2)));
      if (!p || typeof p !== 'object') return null;
      return normalize({ stationId: p.s, key: p.k, expires: p.e, dashboard: p.d });
    } catch { return null; }
  }
  if (hash.startsWith(`#${SETUP_FLAG}&`)) {
    let p;
    try { p = new URLSearchParams(hash.slice(SETUP_FLAG.length + 2)); } catch { return null; }
    return normalize({ stationId: p.get('station'), key: p.get('key'), expires: p.get('expires') });
  }
  return null;
}

// A setup link pasted as text (from Messages, Notes…): the same result as
// readDeviceLink, or null when the text holds no setup link.
export function readPastedLink(text) {
  const s = String(text ?? '').trim();
  const at = s.indexOf(`#${SETUP_FLAG}`);
  return at < 0 ? null : readDeviceLink(s.slice(at).split(/\s/)[0]);
}

export function isSetupHash(hash) {
  return typeof hash === 'string' && (hash.startsWith(`#${SETUP_FLAG}=`) || hash.startsWith(`#${SETUP_FLAG}&`));
}

// Removes a setup link from the address bar (without a reload), so a later
// reload can't bring back the old key over one saved since.
export function clearSetupHash() {
  try {
    if (isSetupHash(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch { /* the fragment stays; harmless */ }
}

// A short fingerprint of a setup hash, saved once the link has been applied.
// A home-screen icon keeps the link in its address and opens it on every
// launch; the fingerprint lets the app apply it only the first time, so a key
// renewed later on that device isn't overwritten by the old one.
export function setupFingerprint(hash) {
  let h = 5381;
  const s = String(hash ?? '');
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
