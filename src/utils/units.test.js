import { describe, it, expect } from 'vitest';
import {
  UNITS, convertTemp, convertWind, convertPrecip, convertPressure,
  formatTemp, formatWind, formatPressure, formatPrecipTotal, formatPrecipRate,
  unitsForTimezone, unitsForRegion,
} from './units';

describe('conversions', () => {
  it('temperature F↔C', () => {
    expect(convertTemp(32, UNITS.METRIC)).toBe(0);
    expect(convertTemp(212, UNITS.METRIC)).toBe(100);
    expect(convertTemp(72, UNITS.IMPERIAL)).toBe(72);
    expect(convertTemp(null, UNITS.METRIC)).toBeNull();
  });
  it('wind mph→km/h', () => {
    expect(convertWind(10, UNITS.METRIC)).toBeCloseTo(16.0934, 3);
    expect(convertWind(10, UNITS.IMPERIAL)).toBe(10);
    expect(convertWind(null, UNITS.METRIC)).toBeNull();
  });
  it('precip in→mm', () => {
    expect(convertPrecip(1, UNITS.METRIC)).toBeCloseTo(25.4, 3);
    expect(convertPrecip(0.5, UNITS.IMPERIAL)).toBe(0.5);
  });
  it('pressure inHg→hPa', () => {
    expect(convertPressure(29.92, UNITS.METRIC)).toBeCloseTo(1013.2, 1);
    expect(convertPressure(29.92, UNITS.IMPERIAL)).toBe(29.92);
  });
});

describe('formatters', () => {
  it('temperature', () => {
    expect(formatTemp(32, UNITS.METRIC)).toBe('0°C');
    expect(formatTemp(72, UNITS.IMPERIAL)).toBe('72°F');
    expect(formatTemp(null, UNITS.IMPERIAL)).toBe('—');
  });
  it('wind', () => {
    expect(formatWind(10, UNITS.METRIC)).toBe('16 km/h');
    expect(formatWind(10, UNITS.IMPERIAL)).toBe('10 mph');
  });
  it('pressure always carries an explicit unit', () => {
    expect(formatPressure(29.92, UNITS.IMPERIAL)).toBe('29.92 inHg');
    expect(formatPressure(29.92, UNITS.METRIC)).toBe('1013 hPa');
  });
  it('precip totals & rates by system', () => {
    expect(formatPrecipTotal(0.5, UNITS.IMPERIAL)).toBe('0.50"');
    expect(formatPrecipTotal(0.5, UNITS.METRIC)).toBe('12.7 mm');
    expect(formatPrecipRate(0.05, UNITS.IMPERIAL)).toBe('0.05"/hr');
    expect(formatPrecipRate(0, UNITS.METRIC)).toBe('0.0 mm/hr');
  });
});

describe('unit detection helpers', () => {
  it('imperial time zones', () => {
    expect(unitsForTimezone('America/New_York')).toBe(UNITS.IMPERIAL);
    expect(unitsForTimezone('Pacific/Honolulu')).toBe(UNITS.IMPERIAL);
    expect(unitsForTimezone('Asia/Yangon')).toBe(UNITS.IMPERIAL);
  });
  it('metric time zones', () => {
    expect(unitsForTimezone('Europe/Paris')).toBe(UNITS.METRIC);
    expect(unitsForTimezone('America/Bogota')).toBe(UNITS.METRIC);
  });
  it('unknown time zone → null (caller falls back)', () => {
    expect(unitsForTimezone(null)).toBeNull();
    expect(unitsForTimezone('')).toBeNull();
  });
  it('region fallback', () => {
    expect(unitsForRegion('US')).toBe(UNITS.IMPERIAL);
    expect(unitsForRegion('LR')).toBe(UNITS.IMPERIAL);
    expect(unitsForRegion('GB')).toBe(UNITS.METRIC);
    expect(unitsForRegion('CO')).toBe(UNITS.METRIC);
  });
});
