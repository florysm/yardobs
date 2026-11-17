import { describe, it, expect } from 'vitest';
import { toDateStr, toISODate, historyCacheUsable, HISTORY_REFRESH_MS } from './dateUtils';

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

describe('historyCacheUsable', () => {
  const at = (day, h) => Date.UTC(2026, 6, day, h, 0, 0); // TZ=UTC

  it('treats a day fetched after it ended as final', () => {
    expect(historyCacheUsable('20260713', at(14, 0) + 60_000, at(20, 9))).toBe(true);
  });
  it('reuses today only briefly', () => {
    const fetched = at(14, 9);
    expect(historyCacheUsable('20260714', fetched, fetched + HISTORY_REFRESH_MS - 1)).toBe(true);
    expect(historyCacheUsable('20260714', fetched, fetched + HISTORY_REFRESH_MS)).toBe(false);
  });
  it('refetches yesterday once if it was cached before midnight', () => {
    expect(historyCacheUsable('20260713', at(13, 22), at(14, 8))).toBe(false);
  });
  it('rejects missing or future timestamps', () => {
    expect(historyCacheUsable('20260714', null, at(14, 9))).toBe(false);
    expect(historyCacheUsable('20260714', at(14, 10), at(14, 9))).toBe(false);
  });
});
