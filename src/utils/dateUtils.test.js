import { describe, it, expect } from 'vitest';
import { toDateStr, toISODate, getTimePeriod } from './dateUtils';

// TZ=UTC (npm script) means local getters equal the UTC values below.
const d = (h) => new Date(Date.UTC(2026, 6, 14, h, 30, 0)); // 2026-07-14

describe('toDateStr / toISODate', () => {
  it('formats local date', () => {
    expect(toDateStr(d(12))).toBe('20260714');
    expect(toISODate(d(12))).toBe('2026-07-14');
  });
  it('zero-pads month/day', () => {
    expect(toDateStr(new Date(Date.UTC(2026, 0, 3, 12)))).toBe('20260103');
    expect(toISODate(new Date(Date.UTC(2026, 0, 3, 12)))).toBe('2026-01-03');
  });
});

describe('getTimePeriod', () => {
  it('buckets the hour', () => {
    expect(getTimePeriod(d(7))).toBe('morning');
    expect(getTimePeriod(d(14))).toBe('afternoon');
    expect(getTimePeriod(d(20))).toBe('evening');
    expect(getTimePeriod(d(2))).toBe('night');
  });
});
