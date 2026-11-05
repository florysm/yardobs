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

