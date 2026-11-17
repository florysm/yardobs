import { describe, it, expect } from 'vitest';
import { resolveAutoTheme, deriveFromSensors, heroCondition, ICON_STORMY, ICON_RAINY, ICON_CLOUDY, ICON_PARTLY } from './sky';
import { THEME_IDS } from '../themes.js';
import { WMO_TO_TWC, wmoToTwc } from './weatherIcons';

const day = (o) => ({ isDay: 1, ...o });

describe('resolveAutoTheme', () => {
  it('defaults to light with no data', () => {
    expect(resolveAutoTheme(null)).toBe(THEME_IDS.light);
  });

  it('trusts a dry rain gauge over a rainy model code', () => {
    expect(resolveAutoTheme(day({ precipRate: 0, iconCode: 12 }))).toBe(THEME_IDS.cloudy);
  });

  it('uses the gauge for wet, and heavy measured rain is stormy', () => {
    expect(resolveAutoTheme(day({ precipRate: 0.05, iconCode: 26 }))).toBe(THEME_IDS.rainy);
    expect(resolveAutoTheme(day({ precipRate: 0.2 }))).toBe(THEME_IDS.stormy);
  });

  it('uses the model for wet only without a gauge (preview)', () => {
    expect(resolveAutoTheme(day({ iconCode: 12 }))).toBe(THEME_IDS.rainy);
    expect(resolveAutoTheme(day({ iconCode: 4 }))).toBe(THEME_IDS.stormy);
  });

  it('is dark on a dry night', () => {
    expect(resolveAutoTheme({ isDay: 0, precipRate: 0, iconCode: 32 })).toBe(THEME_IDS.dark);
  });

  it('reads sun and overcast from the sensors first', () => {
    expect(resolveAutoTheme(day({ precipRate: 0, uv: 6, iconCode: 26 }))).toBe(THEME_IDS.sunny);
    expect(resolveAutoTheme(day({ precipRate: 0, solar: 500 }))).toBe(THEME_IDS.sunny);
    expect(resolveAutoTheme(day({ precipRate: 0, solar: 100, iconCode: 32 }))).toBe(THEME_IDS.cloudy);
  });

  it('falls back to the model sky when sensors are silent', () => {
    expect(resolveAutoTheme(day({ iconCode: 26 }))).toBe(THEME_IDS.cloudy);
    expect(resolveAutoTheme(day({ iconCode: 30 }))).toBe(THEME_IDS.light);
    expect(resolveAutoTheme(day({ iconCode: 32 }))).toBe(THEME_IDS.sunny);
    expect(resolveAutoTheme(day({ solar: 300 }))).toBe(THEME_IDS.light);
    expect(resolveAutoTheme(day({}))).toBe(THEME_IDS.sunny);
  });

  it('gives every Open-Meteo code a sky group or a clear sky', () => {
    const grouped = c => [ICON_STORMY, ICON_RAINY, ICON_CLOUDY, ICON_PARTLY].some(s => s.has(c));
    const clear = new Set([31, 32, 33, 34]);
    for (const code of Object.keys(WMO_TO_TWC).map(Number)) {
      const twc = wmoToTwc(code);
      expect(grouped(twc) || clear.has(twc), `WMO ${code} → ${twc}`).toBe(true);
    }
  });
});

describe('deriveFromSensors', () => {
  it('reads rain, night and solar', () => {
    expect(deriveFromSensors(day({ precipRate: 0.2 })).label).toBe('Heavy Rain');
    expect(deriveFromSensors(day({ precipRate: 0.02 })).label).toBe('Light Rain');
    expect(deriveFromSensors({ isDay: 0 }).label).toBe('Clear');
    expect(deriveFromSensors(day({ solar: 100 })).label).toBe('Cloudy');
    expect(deriveFromSensors(day({ solar: 600 })).label).toBe('Sunny');
    expect(deriveFromSensors(day({})).label).toBe('Partly Cloudy');
  });
});

describe('heroCondition', () => {
  it('uses the iconCode label and emoji', () => {
    expect(heroCondition(day({ iconCode: 26 }))).toEqual({ icon: '☁️', label: 'Cloudy' });
  });
  it('upgrades partly cloudy to Sunny on strong sun, by day only', () => {
    expect(heroCondition(day({ iconCode: 30, uv: 7 })).label).toBe('Sunny');
    expect(heroCondition({ isDay: 0, iconCode: 29, uv: 7 }).label).toBe('Partly Cloudy');
    expect(heroCondition(day({ iconCode: 30, uv: 2 })).label).toBe('Partly Cloudy');
  });
  it('falls back to the sensors without an iconCode, and null without data', () => {
    expect(heroCondition(day({ precipRate: 0.2 })).label).toBe('Heavy Rain');
    expect(heroCondition(null)).toBeNull();
  });
});
