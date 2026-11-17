import { describe, it, expect } from 'vitest';
import {
  ICONS, LABELS, WMO_TO_TWC, wmoToTwc, iconFor, labelFor, hourlyDisplayCode, FALLBACK_ICON,
} from './weatherIcons';

describe('ICONS / LABELS', () => {
  it('cover the same TWC codes', () => {
    expect(Object.keys(ICONS).sort()).toEqual(Object.keys(LABELS).sort());
  });
  it('fall back for unknown codes', () => {
    expect(iconFor(999)).toBe(FALLBACK_ICON);
    expect(labelFor(999, 'Clear')).toBe('Clear');
  });
});

describe('wmoToTwc', () => {
  it('maps every WMO code, day and night, to a TWC code with an icon and label', () => {
    for (const code of Object.keys(WMO_TO_TWC).map(Number)) {
      for (const isDay of [1, 0]) {
        const twc = wmoToTwc(code, isDay);
        expect(ICONS[twc], `WMO ${code}`).toBeDefined();
        expect(LABELS[twc], `WMO ${code}`).toBeDefined();
      }
    }
  });

  it('keeps slight and moderate showers out of Heavy Rain', () => {
    expect(labelFor(wmoToTwc(80))).toBe('Scattered Showers');
    expect(labelFor(wmoToTwc(81))).toBe('Showers');
    expect(labelFor(wmoToTwc(82))).toBe('Heavy Rain');
  });

  it('separates freezing drizzle, rain intensities and snow intensities', () => {
    expect([56, 57].map(c => labelFor(wmoToTwc(c)))).toEqual(['Freezing Drizzle', 'Freezing Drizzle']);
    expect([61, 63, 65].map(c => labelFor(wmoToTwc(c)))).toEqual(['Rain', 'Rain', 'Heavy Rain']);
    expect([71, 73, 75].map(c => labelFor(wmoToTwc(c)))).toEqual(['Flurries', 'Snow', 'Heavy Snow']);
  });

  it('uses night variants only for clear and partly cloudy skies', () => {
    expect([0, 1, 2].map(c => wmoToTwc(c, 0))).toEqual([31, 33, 29]);
    expect([0, 1, 2].map(c => wmoToTwc(c, 1))).toEqual([32, 34, 30]);
    expect(wmoToTwc(3, 0)).toBe(wmoToTwc(3, 1));
  });

  it('defaults unknown codes to Cloudy and null to null', () => {
    expect(wmoToTwc(42)).toBe(26);
    expect(wmoToTwc(null)).toBeNull();
  });
});

describe('hourlyDisplayCode', () => {
  it('hides unlikely precipitation', () => {
    expect(hourlyDisplayCode(61, 20)).toBe(3);
    expect(hourlyDisplayCode(61, 30)).toBe(61);
  });
  it('softens an unlikely thunderstorm to showers, or overcast when very unlikely', () => {
    expect(hourlyDisplayCode(95, 35)).toBe(80);
    expect(hourlyDisplayCode(95, 10)).toBe(3);
    expect(hourlyDisplayCode(95, 40)).toBe(95);
  });
  it('leaves dry codes alone', () => {
    expect(hourlyDisplayCode(2, 0)).toBe(2);
  });
});
