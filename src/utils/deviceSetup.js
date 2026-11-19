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
// https://yardobs.app/#setup&station=KXY1&key=…&expires=2027-01-31
//
// Everything rides in the fragment (after '#'), which browsers never send to
// any server, ours included. Opening the link on another device saves the
// station, key and expiry there, then strips the fragment from the address bar.
// Anyone holding the link has the key, so it's meant for your own devices.

const SETUP_FLAG = 'setup';

export function buildDeviceLink(origin, { stationId, key, expires }) {
  const p = new URLSearchParams();
  p.set('station', stationId);
  p.set('key', key);
  if (expires) p.set('expires', expires);
  return `${origin}/#${SETUP_FLAG}&${p.toString()}`;
}

// { stationId, key, expires } from a location.hash, or null when the hash
// isn't a setup link or is missing what's needed.
export function readDeviceLink(hash) {
  if (typeof hash !== 'string' || !hash.startsWith(`#${SETUP_FLAG}&`)) return null;
  let p;
  try { p = new URLSearchParams(hash.slice(SETUP_FLAG.length + 2)); } catch { return null; }
  const stationId = (p.get('station') ?? '').trim();
  const key = cleanKey(p.get('key'));
  if (!stationId || !key) return null;
  const expires = p.get('expires');
  return { stationId, key, expires: /^\d{4}-\d{2}-\d{2}$/.test(expires ?? '') ? expires : null };
}
