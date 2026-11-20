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

// ── Fit to screen ───────────────────────────────────────────────────────────
// On a tablet-sized window the dashboard is laid out at a set width and then
// scaled to fill the screen (DashboardView). Each size starts at `base` and
// may narrow toward `min`: narrower makes the content taller relative to its
// width, so a short layout (Large) grows until it fills the height instead of
// leaving the bottom of the screen empty. Below FIT_MIN_WIDTH (phones, slim
// split view) the dashboard scrolls normally; it matches the 760px breakpoint
// in index.css where the columns stack.
export const FIT_MIN_WIDTH = 760;
export const FIT = {
  large:    { base: 820,  min: 680 },
  normal:   { base: 1024, min: 880 },
  detailed: { base: 1280, min: 1060 },
};
export const MAX_FIT_SCALE = 2;
export const FIT_MAX_STEPS = 10;
const SLACK = 1.06; // leftover space under 6% is left alone
const STEP = 0.06;

// One step of fitting. Given the window, the layout width just tried and the
// content height it produced, returns { width } to try a different width, or
// { width, scale } when that width is the one to use.
export function nextFit({ winW, winH, width, contentH, size }) {
  const { base, min } = FIT[size] ?? FIT.normal;
  const sW = winW / width;
  const sH = contentH > 0 ? winH / contentH : sW;
  if (sH > sW * SLACK && width > min) return { width: Math.max(min, Math.round(width * (1 - STEP))) };
  if (sW > sH * SLACK && width < base) return { width: Math.min(base, Math.round(width * (1 + STEP))) };
  return { width, scale: Math.min(sW, sH, MAX_FIT_SCALE) };
}
