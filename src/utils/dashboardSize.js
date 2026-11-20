// Dashboard sizes, for how far away the tablet sits. Saved per device.
//   large    — across the room: big type, fewer things on screen
//   normal   — arm's length (the original dashboard)
//   detailed — up close or a big screen: extra cards
//   auto     — picks normal or detailed from the screen size. It never picks
//              large: the screen can't tell how far away you are.

export const DASHBOARD_SIZES = ['auto', 'large', 'normal', 'detailed'];
export const SIZE_LABELS = { auto: 'Auto', large: 'Large', normal: 'Normal', detailed: 'Detailed' };

// Shorter screen side, in CSS pixels, from which Auto shows Detailed. The 12.9"
// iPad Pro (1366×1024) clears it; iPad 4 (1024×768), the 11" Pro (1194×834)
// and most laptop windows don't.
export const DETAILED_MIN_SHORT_SIDE = 1000;

export function normalizeSize(value) {
  return DASHBOARD_SIZES.indexOf(value) >= 0 ? value : 'auto';
}

export function resolveDashboardSize(pref, width, height) {
  const size = normalizeSize(pref);
  if (size !== 'auto') return size;
  const shortSide = Math.min(Number(width) || 0, Number(height) || 0);
  return shortSide >= DETAILED_MIN_SHORT_SIDE ? 'detailed' : 'normal';
}

// The size for this window right now.
export function resolveForWindow(pref) {
  if (typeof window === 'undefined') return resolveDashboardSize(pref, 0, 0);
  return resolveDashboardSize(pref, window.innerWidth, window.innerHeight);
}
