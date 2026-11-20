import { describe, it, expect } from 'vitest';
import { resolveDashboardSize, normalizeSize, DETAILED_MIN_SHORT_SIDE } from './dashboardSize';

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
