// Returns YYYYMMDD in local time — used for TWC API date params and cache keys.
// toISOString() returns UTC, which causes off-by-one date errors in the evening
// when UTC has rolled past midnight but the user's local date hasn't yet.
export function toDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// Returns YYYY-MM-DD in local time — used for forecast timestamp filtering and cache keys.
export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


// How long a not-yet-final day of station history may be reused before it is
// refetched. A station's summary for today keeps changing until midnight.
export const HISTORY_REFRESH_MS = 15 * 60 * 1000;

// Whether a cached history entry for `dateKey` (YYYYMMDD, local) fetched at
// `fetchedAtMs` can still be used at `nowMs`. A day fetched after it ended is
// final and cached for good; today (or yesterday fetched before midnight) is
// reused only for HISTORY_REFRESH_MS.
export function historyCacheUsable(dateKey, fetchedAtMs, nowMs = Date.now()) {
  if (fetchedAtMs == null) return false;
  if (toDateStr(new Date(fetchedAtMs)) > dateKey) return true;
  const age = nowMs - fetchedAtMs;
  return age >= 0 && age < HISTORY_REFRESH_MS;
}

// A new Date n local days from `date` (DST-safe: works on the calendar date).
export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// The same calendar day one year earlier, at the same local time. Feb 29 maps
// to Feb 28 (setFullYear would roll it to Mar 1, and subtracting 365 days is a
// day off whenever the past year held a Feb 29). The one "last year" rule for
// every year-over-year comparison.
export function sameDayLastYear(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth();
  d.setFullYear(d.getFullYear() - 1);
  if (d.getMonth() !== month) d.setDate(0); // rolled into March: back to Feb 28
  return d;
}

// YYYYMMDD of sameDayLastYear(date) — the TWC history key for "this day last year".
export function lastYearKey(date = new Date()) {
  return toDateStr(sameDayLastYear(date));
}

// How old the last conditions update is, for a display left on for hours:
// 'fresh' under 15 minutes, 'stale' under 30, 'old' after that (or never loaded).
// The normal poll is every 5 minutes, so 'stale' means a few polls have failed.
export const STALE_AFTER_MS = 15 * 60 * 1000;
export const OLD_AFTER_MS   = 30 * 60 * 1000;
export function freshness(lastUpdated, nowMs = Date.now()) {
  if (!lastUpdated) return 'old';
  const age = nowMs - lastUpdated.getTime();
  if (age < STALE_AFTER_MS) return 'fresh';
  if (age < OLD_AFTER_MS) return 'stale';
  return 'old';
}

// The next local `hour`:00 strictly after `now`, as epoch ms. The dashboard
// reloads itself then, once a day, to shed whatever a long-lived page piles up.
export function nextLocalHour(hour, now = new Date()) {
  const t = new Date(now);
  t.setHours(hour, 0, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime();
}
