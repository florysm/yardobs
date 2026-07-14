import { describe, it, expect } from 'vitest';
import { validCoords, validStationId, validDate } from './validate.js';

describe('validCoords', () => {
  it('accepts valid pairs and absence', () => {
    expect(validCoords('25.77', '-80.19')).toBe(true);
    expect(validCoords(undefined, undefined)).toBe(true);
  });
  it('rejects non-numeric, out-of-range, or half-present', () => {
    expect(validCoords('abc', '-80')).toBe(false);
    expect(validCoords('91', '0')).toBe(false);
    expect(validCoords('0', '181')).toBe(false);
    expect(validCoords('25.77', undefined)).toBe(false);
  });
});

describe('validStationId', () => {
  it('accepts safe ids and absence', () => {
    expect(validStationId('KFLMIAMI123')).toBe(true);
    expect(validStationId('a.b-c_d')).toBe(true);
    expect(validStationId(undefined)).toBe(true);
  });
  it('rejects injection-y values', () => {
    expect(validStationId('DROP;TABLE')).toBe(false);
    expect(validStationId('a b')).toBe(false);
    expect(validStationId('x&y=1')).toBe(false);
  });
});

describe('validDate', () => {
  it('accepts YYYYMMDD and absence', () => {
    expect(validDate('20260714')).toBe(true);
    expect(validDate(undefined)).toBe(true);
  });
  it('rejects other formats', () => {
    expect(validDate('2026-07-14')).toBe(false);
    expect(validDate('1234567')).toBe(false);
    expect(validDate('abcd1234')).toBe(false);
  });
});
