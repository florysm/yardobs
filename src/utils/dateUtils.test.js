import { describe, it, expect } from 'vitest';
import { toDateStr, toISODate, historyCacheUsable, HISTORY_REFRESH_MS, addDays, sameDayLastYear, lastYearKey } from './dateUtils';

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

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(toDateStr(addDays(new Date(Date.UTC(2026, 0, 1, 12)), -1))).toBe('20251231');
    expect(toDateStr(addDays(new Date(Date.UTC(2024, 1, 28, 12)), 1))).toBe('20240229');
  });
  it('does not mutate its input', () => {
    const base = new Date(Date.UTC(2026, 6, 14, 12));
    addDays(base, 5);
    expect(toDateStr(base)).toBe('20260714');
  });
});

describe('sameDayLastYear / lastYearKey', () => {
  it('keeps the calendar day', () => {
    expect(lastYearKey(new Date(Date.UTC(2026, 10, 17, 12)))).toBe('20251117');
  });
  it('maps Feb 29 to Feb 28', () => {
    expect(lastYearKey(new Date(Date.UTC(2028, 1, 29, 12)))).toBe('20270228');
  });
  it('is the same calendar day across a leap year (365 days back would be a day off)', () => {
    // Mar 1 2024 → Mar 1 2023 spans Feb 29 2024, i.e. 366 days.
    const mar1 = new Date(Date.UTC(2024, 2, 1, 12));
    expect(lastYearKey(mar1)).toBe('20230301');
    expect(toDateStr(addDays(mar1, -365))).toBe('20230302');
  });
  it('keeps the time of day', () => {
    expect(sameDayLastYear(new Date(Date.UTC(2026, 10, 17, 15, 45))).getUTCHours()).toBe(15);
  });
});
