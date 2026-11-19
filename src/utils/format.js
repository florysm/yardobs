// EPA US AQI category boundaries (upper bound, inclusive). The scoring curve in
// scoring.js anchors its control points to these same numbers — see the
// band-alignment test in scoring.test.js.
export const AQI_BOUNDS = [
  [50,  'Good'],
  [100, 'Moderate'],
  [150, 'Sensitive Groups'],
  [200, 'Unhealthy'],
  [300, 'Very Unhealthy'],
];
const AQI_ABOVE_RANGE = 'Hazardous';

export function aqiCategory(aqi) {
  if (aqi == null) return null;
  const hit = AQI_BOUNDS.find(([max]) => aqi <= max);
  return hit ? hit[1] : AQI_ABOVE_RANGE;
}

// toFixed without the "-0": -0.3 rounds to "-0", which reads as a sign error
// ("-0°C" just below freezing). Anything that rounds to zero prints as zero.
export function fixed(v, digits = 0) {
  const s = v.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

export function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return fixed(Number(val), digits);
}

const COMPASS_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

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
    return hour12FromResolved(new Intl.DateTimeFormat(loc, { hour: 'numeric' }).resolvedOptions());
  } catch {
    return true;
  }
}

// hourCycle is recent (Safari 13+); older browsers (iOS 10 on an iPad 4) only
// report hour12, and without this fallback they always got the 24-hour clock.
export function hour12FromResolved({ hourCycle, hour12 } = {}) {
  if (hourCycle) return hourCycle === 'h11' || hourCycle === 'h12';
  if (typeof hour12 === 'boolean') return hour12;
  return true;
}

// Integer hour (0–23) → compact label: '12A'/'1P' (12h locales) or '13' (24h locales).
export function fmtHourShort(h) {
  if (!getLocaleHour12()) return String(h);
  if (h === 12) return '12P';
  if (h === 0)  return '12A';
  return h > 12 ? `${h - 12}P` : `${h}A`;
}

// ISO timestamp → rounded hour label: '12am'/'1pm' (12h) or '13:00' (24h).
// Read from the text, never `new Date(isoStr)`: Open-Meteo's times are the
// place's wall clock with no offset, which modern browsers parse as local time
// but older Safari (iOS 10) parses as UTC, shifting every label by the UTC
// offset. The text is already the hour to show.
export function fmtHourIso(isoStr) {
  const hh = Number(String(isoStr).slice(11, 13));
  const mm = Number(String(isoStr).slice(14, 16)) || 0;
  const h = mm >= 30 ? (hh + 1) % 24 : hh;
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

// Date → clock time in the user's locale, '9:45 AM' or '09:45'. `timeZone`
// shows it on another place's clock (Explore: sunrise in Los Angeles reads as
// LA time, not the device's). '--' for a missing or invalid date — SunCalc
// returns Invalid Date for events that don't happen (polar day/night).
export function fmtClockTime(date, timeZone) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '--';
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const opts = { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12(locale) };
  let text;
  try {
    text = date.toLocaleTimeString(locale, timeZone ? { ...opts, timeZone } : opts);
  } catch {
    text = date.toLocaleTimeString(locale, opts); // unknown zone: the device's
  }
  // Newer ICU puts a narrow no-break space before AM/PM; keep a plain one.
  return text.replace(/\u202f/g, ' ');
}
