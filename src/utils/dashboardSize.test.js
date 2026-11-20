import { describe, it, expect } from 'vitest';
import { resolveDashboardSize, normalizeSize, DETAILED_MIN_SHORT_SIDE, nextFit, FIT, MAX_FIT_SCALE } from './dashboardSize';

describe('resolveDashboardSize', () => {
  it('keeps a size the user picked', () => {
    expect(resolveDashboardSize('large', 1366, 1024)).toBe('large');
    expect(resolveDashboardSize('detailed', 1024, 768)).toBe('detailed');
    expect(resolveDashboardSize('normal', 1366, 1024)).toBe('normal');
  });
  it('Auto picks by the shorter screen side, either orientation', () => {
    expect(resolveDashboardSize('auto', 1024, 768)).toBe('normal');    // iPad 4
    expect(resolveDashboardSize('auto', 1194, 834)).toBe('normal');    // 11" iPad Pro
    expect(resolveDashboardSize('auto', 1366, 1024)).toBe('detailed'); // 12.9" iPad Pro
    expect(resolveDashboardSize('auto', 1024, 1366)).toBe('detailed');
  });
  it('boundary', () => {
    expect(resolveDashboardSize('auto', 1400, DETAILED_MIN_SHORT_SIDE)).toBe('detailed');
    expect(resolveDashboardSize('auto', 1400, DETAILED_MIN_SHORT_SIDE - 1)).toBe('normal');
  });
  it('never picks large on its own, and treats junk as auto', () => {
    expect(resolveDashboardSize('auto', 0, 0)).toBe('normal');
    expect(resolveDashboardSize(null, 1366, 1024)).toBe('detailed');
    expect(resolveDashboardSize('huge', 1024, 768)).toBe('normal');
    expect(normalizeSize(undefined)).toBe('auto');
  });
});

describe('nextFit', () => {
  it('narrows a short layout so it can grow to fill the height', () => {
    const r = nextFit({ winW: 1024, winH: 768, width: 820, contentH: 480, size: 'large' });
    expect(r.width).toBeLessThan(820);
    expect(r.scale).toBeUndefined();
  });
  it('stops narrowing at the size minimum and scales to the width', () => {
    const r = nextFit({ winW: 1024, winH: 768, width: FIT.large.min, contentH: 300, size: 'large' });
    expect(r).toEqual({ width: FIT.large.min, scale: 1024 / FIT.large.min });
  });
  it('widens a tall layout back toward its base', () => {
    const r = nextFit({ winW: 1024, winH: 768, width: 700, contentH: 900, size: 'large' });
    expect(r.width).toBeGreaterThan(700);
  });
  it('scales down to fit when the layout is taller than the screen at its base', () => {
    const r = nextFit({ winW: 1024, winH: 768, width: 1280, contentH: 1100, size: 'detailed' });
    expect(r).toEqual({ width: 1280, scale: 768 / 1100 });
  });
  it('uses the width as is when it already fits within the slack', () => {
    const r = nextFit({ winW: 1024, winH: 768, width: 1024, contentH: 740, size: 'normal' });
    expect(r).toEqual({ width: 1024, scale: 1 });
  });
  it('caps the scale', () => {
    const r = nextFit({ winW: 3000, winH: 2000, width: FIT.detailed.min, contentH: 700, size: 'detailed' });
    expect(r.scale).toBe(MAX_FIT_SCALE);
  });
});
