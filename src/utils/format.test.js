import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  aqiCategory, fmt, fixed, degreesToCompass, getLocaleHour12,
  fmtHourShort, fmtHourIso, fmtTimeTick, fmtClockTime,
} from './format';

describe('aqiCategory', () => {
  it('boundaries', () => {
    expect(aqiCategory(null)).toBeNull();
    expect(aqiCategory(50)).toBe('Good');
    expect(aqiCategory(100)).toBe('Moderate');
    expect(aqiCategory(150)).toBe('Sensitive Groups');
    expect(aqiCategory(200)).toBe('Unhealthy');
    expect(aqiCategory(300)).toBe('Very Unhealthy');
    expect(aqiCategory(301)).toBe('Hazardous');
  });
});

describe('fmt', () => {
  it('rounds, handles null/NaN', () => {
    expect(fmt(1.234, 2)).toBe('1.23');
    expect(fmt(5)).toBe('5');
    expect(fmt(null)).toBe('—');
    expect(fmt(NaN)).toBe('—');
  });
});

describe('degreesToCompass', () => {
  it('cardinals + null', () => {
    expect(degreesToCompass(0)).toBe('N');
    expect(degreesToCompass(90)).toBe('E');
    expect(degreesToCompass(180)).toBe('S');
    expect(degreesToCompass(270)).toBe('W');
    expect(degreesToCompass(null)).toBe('');
  });
});

describe('getLocaleHour12', () => {
  it('detects 12h vs 24h locales', () => {
    expect(getLocaleHour12('en-US')).toBe(true);
    expect(getLocaleHour12('de-DE')).toBe(false);
  });
});

// Hour formatters read getLocaleHour12() with no arg → navigator.language.
// Pin navigator to a 12h locale so these are deterministic. TZ=UTC (set by the
// npm script) makes the Date getters deterministic too.
describe('time formatters (12h locale, TZ=UTC)', () => {
  beforeAll(() => vi.stubGlobal('navigator', { language: 'en-US' }));
  afterAll(() => vi.unstubAllGlobals());

  it('fmtHourShort', () => {
    expect(fmtHourShort(0)).toBe('12A');
    expect(fmtHourShort(12)).toBe('12P');
    expect(fmtHourShort(13)).toBe('1P');
  });
  it('fmtHourIso rounds to nearest hour', () => {
    expect(fmtHourIso('2026-07-14T13:10:00Z')).toBe('1pm');
    expect(fmtHourIso('2026-07-14T13:40:00Z')).toBe('2pm');
  });
  it('fmtTimeTick', () => {
    expect(fmtTimeTick('00:10')).toBe('12am');
    expect(fmtTimeTick('13:40')).toBe('2pm');
  });
  it('fmtClockTime', () => {
    const t = new Date('2026-07-14T13:30:00Z');
    expect(fmtClockTime(t)).toBe('1:30 PM');           // device zone (UTC in tests)
    expect(fmtClockTime(t, 'America/Los_Angeles')).toBe('6:30 AM');
    expect(fmtClockTime(t, 'Not/AZone')).toBe('1:30 PM');
    expect(fmtClockTime(null)).toBe('--');
    expect(fmtClockTime(new Date(NaN))).toBe('--');
  });
});

describe('fixed', () => {
  it('drops the sign when a negative rounds to zero', () => {
    expect(fixed(-0.3)).toBe('0');
    expect(fixed(-0.04, 1)).toBe('0.0');
    expect(fmt(-0.2)).toBe('0');
  });
  it('keeps real negatives and positives', () => {
    expect(fixed(-0.6)).toBe('-1');
    expect(fixed(-1.25, 1)).toBe('-1.3');
    expect(fixed(2.5, 1)).toBe('2.5');
  });
});
