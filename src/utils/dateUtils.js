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
