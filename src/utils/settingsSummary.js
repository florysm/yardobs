import { keyExpiryStatus } from './keyExpiry';

// At this window width and wider, Settings opens as a side panel and shows the
// Layout section (phone/dashboard), which only matters on a tablet or computer.
export const SETTINGS_PANEL_MIN_WIDTH = 768;

// The collapsed Station row in Settings: { text, needsAttention }.
// needsAttention (no station, no key, key expired or expiring within two
// weeks) makes the row start open and show its text in amber.
export function stationSummary({ stationId, hasKey, expires, now = new Date() }) {
  if (!stationId) return { text: 'Not connected', needsAttention: true };
  if (!hasKey) return { text: `${stationId} · No API key`, needsAttention: true };
  const { state, days } = keyExpiryStatus(expires, now);
  if (state === 'expired') return { text: `${stationId} · Key expired`, needsAttention: true };
  if (state === 'soon') {
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    return { text: `${stationId} · Key expires ${when}`, needsAttention: true };
  }
  return { text: `${stationId} · Key saved`, needsAttention: false };
}
