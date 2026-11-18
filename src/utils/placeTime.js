// The clock of the place being shown, which is not always the device's.
//
// Open-Meteo is asked for timezone=auto, so its hourly and daily times are
// the location's wall clock ("2026-11-17T14:00", no offset), and it names
// that zone in the response (`timezone: "America/Los_Angeles"`). Exploring Los
// Angeles from New York, "now" has to be read on LA's clock to find the
// current hour in those arrays — the device's clock is three hours ahead and,
// near midnight, on a different date.
//
// With no zone (no hourly forecast yet, or an unknown name) everything falls
// back to the device clock, which is what the app did before.

// The IANA zone an Open-Meteo response is in, or null when missing/unknown.
export function placeTimeZone(data) {
  const tz = data?.timezone;
  if (typeof tz !== 'string' || !tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

const PART_OPTS = {
  hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
};

// { year, month (1–12), day, hour, minute, second } on `tz`'s wall clock.
function wallParts(tz, now) {
  if (tz) {
    try {
      const parts = {};
      for (const p of new Intl.DateTimeFormat('en-US', { ...PART_OPTS, timeZone: tz }).formatToParts(now)) {
        if (p.type !== 'literal') parts[p.type] = Number(p.value);
      }
      return { ...parts, hour: parts.hour % 24 };
    } catch { /* fall through to the device clock */ }
  }
  return {
    year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(),
    hour: now.getHours(), minute: now.getMinutes(), second: now.getSeconds(),
  };
}

/**
 * The place's "now", in the shapes the forecast code compares against:
 *   date     'YYYY-MM-DD'      — matches Open-Meteo's time strings
 *   hour     0–23
 *   minute   0–59
 *   hourKey  'YYYY-MM-DDTHH'   — the prefix of the current hour's entry
 *   wall     a Date whose local getters read the place's wall clock, for the
 *            helpers that take a Date (currentDayPart, buildLookahead). Only
 *            its getters mean anything; don't use its getTime() as an instant.
 */
export function placeClock(tz, now = new Date()) {
  const p = wallParts(tz, now);
  const pad = n => String(n).padStart(2, '0');
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const wall = new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return { tz, date, hour: p.hour, minute: p.minute, hourKey: `${date}T${pad(p.hour)}`, wall };
}
