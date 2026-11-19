import { describe, it, expect } from 'vitest';
import { cleanKey, keyShapeHint, buildDeviceLink, readDeviceLink } from './deviceSetup';

const KEY = 'e1f10a1e78da46f5b10a1e78da96f525';

describe('cleanKey', () => {
  it('drops spaces, line breaks and zero-width characters', () => {
    expect(cleanKey(` ${KEY.slice(0, 16)}​${KEY.slice(16)}\n`)).toBe(KEY);
    expect(cleanKey('﻿' + KEY)).toBe(KEY);
  });
  it('handles missing input', () => {
    expect(cleanKey(null)).toBe('');
    expect(cleanKey(undefined)).toBe('');
  });
});

describe('keyShapeHint', () => {
  it('is quiet for a well-formed key or none', () => {
    expect(keyShapeHint(KEY)).toBeNull();
    expect(keyShapeHint('')).toBeNull();
  });
  it('names a wrong length', () => {
    expect(keyShapeHint(KEY.slice(1))).toMatch(/31 characters; TWC keys are 32/);
  });
  it('flags stray symbols', () => {
    expect(keyShapeHint(KEY.slice(1) + '-')).toMatch(/other than letters and numbers/);
  });
});

describe('device setup link', () => {
  const origin = 'https://yardobs.app';

  it('round-trips station, key and expiry', () => {
    const link = buildDeviceLink(origin, { stationId: 'KXYZ123', key: KEY, expires: '2027-01-31' });
    expect(link.startsWith('https://yardobs.app/#setup&')).toBe(true);
    expect(readDeviceLink(new URL(link).hash)).toEqual({ stationId: 'KXYZ123', key: KEY, expires: '2027-01-31' });
  });

  it('leaves expiry out when there is none', () => {
    const link = buildDeviceLink(origin, { stationId: 'KXYZ123', key: KEY });
    expect(link).not.toMatch(/expires/);
    expect(readDeviceLink(new URL(link).hash).expires).toBeNull();
  });

  it('ignores hashes that are not setup links or are incomplete', () => {
    expect(readDeviceLink('')).toBeNull();
    expect(readDeviceLink('#dashboard')).toBeNull();
    expect(readDeviceLink('#setup&station=KXYZ123')).toBeNull();
    expect(readDeviceLink(`#setup&key=${KEY}`)).toBeNull();
    expect(readDeviceLink(undefined)).toBeNull();
  });

  it('drops a malformed expiry', () => {
    expect(readDeviceLink(`#setup&station=K1&key=${KEY}&expires=soon`).expires).toBeNull();
  });
});
