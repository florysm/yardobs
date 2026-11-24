// { x, y, v } points for a day's readings placed by time of day: `samples` are
// { minute, value } with minute 0–1439 since local midnight, so the line runs
// from the left edge at midnight and stops at the latest reading instead of
// stretching a morning's worth of data across the whole day. Lowest value at
// the bottom. Empty when there's nothing to draw.
export const DAY_MINUTES = 1440;

export function dayCurvePoints(samples, width, height, pad = 3) {
  const s = (samples ?? []).filter(p => p && p.minute != null && p.value != null && !isNaN(p.value));
  if (s.length < 2) return [];
  const vals = s.map(p => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return s.map(p => ({
    x: (Math.max(0, Math.min(DAY_MINUTES, p.minute)) / DAY_MINUTES) * width,
    y: pad + (1 - (p.value - min) / span) * (height - 2 * pad),
    v: p.value,
  }));
}

// Minutes since midnight from a "YYYY-MM-DD HH:MM:SS" local timestamp, or null.
export function minuteOfDay(localTime) {
  const m = /[ T](\d{2}):(\d{2})/.exec(localTime ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
