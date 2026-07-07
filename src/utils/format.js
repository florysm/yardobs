export function aqiCategory(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

export function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

import { COMPASS_DIRS } from '../../utils/compass.js';

export function degreesToCompass(deg) {
  if (deg == null) return '';
  return COMPASS_DIRS[Math.round(deg / 22.5) % 16];
}

// Whether the given (or browser) locale defaults to a 12-hour clock. Separate
// from units detection (src/utils/units.js) — e.g. Canada is metric but
// commonly 12-hour, so the two heuristics must not be conflated.
export function getLocaleHour12(locale) {
  try {
    const loc = locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
    const { hourCycle } = new Intl.DateTimeFormat(loc, { hour: 'numeric' }).resolvedOptions();
    return hourCycle === 'h11' || hourCycle === 'h12';
  } catch {
    return true;
  }
}

// Integer hour (0–23) → compact label: '12A'/'1P' (12h locales) or '13' (24h locales).
export function fmtHourShort(h) {
  if (!getLocaleHour12()) return String(h);
  if (h === 12) return '12P';
  if (h === 0)  return '12A';
  return h > 12 ? `${h - 12}P` : `${h}A`;
}

// ISO timestamp → rounded hour label: '12am'/'1pm' (12h) or '13:00' (24h).
export function fmtHourIso(isoStr) {
  const d = new Date(isoStr);
  const h = d.getMinutes() >= 30 ? (d.getHours() + 1) % 24 : d.getHours();
  if (!getLocaleHour12()) return `${h}:00`;
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

// 'HH:MM' string → rounded hour label: '12am'/'1pm' (12h) or '13:00' (24h).
export function fmtTimeTick(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const rounded = m >= 30 ? (h + 1) % 24 : h;
  if (!getLocaleHour12()) return `${rounded}:00`;
  if (rounded === 0)  return '12am';
  if (rounded < 12)   return `${rounded}am`;
  if (rounded === 12) return '12pm';
  return `${rounded - 12}pm`;
}

// ISO timestamp → '12:34 AM/PM' (12h) or '14:34' (24h)
export function fmtSunTime(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  const h = d.getHours(), m = d.getMinutes().toString().padStart(2, '0');
  if (!getLocaleHour12()) return `${h.toString().padStart(2, '0')}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// Date object → '12:34 AM/PM' (12h) or '14:34' (24h)
export function fmtMoonTime(date) {
  if (!date) return '--';
  const h = date.getHours(), m = date.getMinutes().toString().padStart(2, '0');
  if (!getLocaleHour12()) return `${h.toString().padStart(2, '0')}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
