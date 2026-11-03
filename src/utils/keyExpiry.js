// TWC API keys expire, but the API never says when — an expired key just
// starts returning 401. The owner can optionally record the expiration date
// shown on their wunderground.com API keys page, and these helpers turn that
// into a reminder. Dates are local calendar days ('YYYY-MM-DD').

export const KEY_RENEW_URL = 'https://www.wunderground.com/member/api-keys';
export const KEY_WARN_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidExpiryDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_RE.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Whole calendar days from today until the expiration date: 0 on the day
// itself, negative once it has passed. Null when no valid date is set.
export function daysUntilExpiry(dateStr, now = new Date()) {
  if (!isValidExpiryDate(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const expires = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((expires - today) / 86_400_000);
}

// 'none' (no date), 'ok', 'soon' (within KEY_WARN_DAYS, incl. today) or 'expired'.
export function keyExpiryStatus(dateStr, now = new Date()) {
  const days = daysUntilExpiry(dateStr, now);
  if (days == null) return { state: 'none', days: null };
  if (days < 0) return { state: 'expired', days };
  if (days <= KEY_WARN_DAYS) return { state: 'soon', days };
  return { state: 'ok', days };
}

export function formatExpiryDate(dateStr) {
  if (!isValidExpiryDate(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function expiryMessage(dateStr, now = new Date()) {
  const { state, days } = keyExpiryStatus(dateStr, now);
  if (state === 'expired') return 'Your TWC API key has expired — renew it to keep your station connected';
  if (state !== 'soon') return null;
  if (days === 0) return 'Your TWC API key expires today — renew it to stay connected';
  return `Your TWC API key expires ${formatExpiryDate(dateStr)} (${days} day${days === 1 ? '' : 's'}) — renew it to stay connected`;
}
