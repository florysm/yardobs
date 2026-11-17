import SunCalc from 'suncalc';

const DAY_MS = 86_400_000;

/**
 * The moonrise/moonset pair the Moon card should show at `now`.
 *
 * Today's rise and today's set aren't necessarily one pass of the moon: near
 * full moon it sets in the morning and rises again in the evening, so pairing
 * them puts the set before the rise. Instead this looks at yesterday, today and
 * tomorrow and picks the pass the moon is in (if it's up) or the next one (if
 * it's down), then the first set after that rise.
 *
 * `getTimes(date)` returns SunCalc-style `{ rise?, set?, alwaysUp?, alwaysDown? }`
 * for the local day containing `date`; injected so this stays testable.
 */
export function pickMoonWindow(now, getTimes, moonUp) {
  const nowMs = now.getTime();
  const days = [-1, 0, 1, 2].map(d => getTimes(new Date(nowMs + d * DAY_MS)));
  const today = days[1];
  const valid = d => d instanceof Date && isFinite(d);
  const rises = days.map(t => t.rise).filter(valid).sort((a, b) => a - b);
  const sets  = days.map(t => t.set).filter(valid).sort((a, b) => a - b);

  const rise = moonUp
    ? rises.filter(r => r.getTime() <= nowMs).pop() ?? null
    : rises.find(r => r.getTime() > nowMs) ?? null;
  // The set that ends this pass: the first one after the rise (or after now,
  // when the moon is up but rose before the window we looked at).
  const after = rise ? rise.getTime() : nowMs;
  const set = sets.find(s => s.getTime() > after) ?? null;

  return {
    rise,
    set,
    moonUp,
    alwaysUp:   today.alwaysUp   ?? false,
    alwaysDown: today.alwaysDown ?? false,
  };
}

export function resolveMoonWindow(lat, lon, now = new Date()) {
  if (lat == null || lon == null) return { rise: null, set: null, moonUp: false, alwaysUp: false, alwaysDown: false };
  const moonUp = SunCalc.getMoonPosition(now, lat, lon).altitude > 0;
  return pickMoonWindow(now, d => SunCalc.getMoonTimes(d, lat, lon), moonUp);
}

export function moonPhaseName(phase) {
  if (phase < 0.0625 || phase >= 0.9375) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  return 'Waning Crescent';
}

// Fraction of the way from `startMs` to `endMs` at `nowMs`, clamped to [0, 1)
// so the arc dot never sits exactly on the far horizon. Null without both ends.
export function arcProgress(startMs, endMs, nowMs) {
  if (!startMs || !endMs || endMs <= startMs) return null;
  return Math.max(0, Math.min(0.9999, (nowMs - startMs) / (endMs - startMs)));
}
