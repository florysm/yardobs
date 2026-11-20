import { describe, it, expect } from 'vitest';
import { cleanKey, keyShapeHint, buildDeviceLink, readDeviceLink, readPastedLink, linkOrigin, isSetupHash, setupFingerprint } from './deviceSetup';

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

  it('round-trips station, key, expiry and the dashboard flag', () => {
    const link = buildDeviceLink(origin, { stationId: 'KXYZ123', key: KEY, expires: '2027-01-31', dashboard: true });
    expect(link.startsWith('https://yardobs.app/#setup=')).toBe(true);
    expect(readDeviceLink(new URL(link).hash)).toEqual({ stationId: 'KXYZ123', key: KEY, expires: '2027-01-31', dashboard: true });
  });

  it('does not show the key or station in the link', () => {
    const link = buildDeviceLink(origin, { stationId: 'KXYZ123', key: KEY });
    expect(link).not.toContain(KEY);
    expect(link).not.toContain('KXYZ123');
    expect(link).toMatch(/^https:\/\/yardobs\.app\/#setup=[A-Za-z0-9_-]+$/);
  });

  it('leaves expiry and dashboard off when not given', () => {
    const link = buildDeviceLink(origin, { stationId: 'KXYZ123', key: KEY });
    expect(readDeviceLink(new URL(link).hash)).toEqual({ stationId: 'KXYZ123', key: KEY, expires: null, dashboard: false });
  });

  it('still reads links in the old readable format', () => {
    expect(readDeviceLink(`#setup&station=K1&key=${KEY}&expires=2027-01-31`))
      .toEqual({ stationId: 'K1', key: KEY, expires: '2027-01-31', dashboard: false });
    expect(readDeviceLink(`#setup&station=K1&key=${KEY}&expires=soon`).expires).toBeNull();
  });

  it('ignores hashes that are not setup links, are incomplete or are garbled', () => {
    expect(readDeviceLink('')).toBeNull();
    expect(readDeviceLink('#dashboard')).toBeNull();
    expect(readDeviceLink('#setup&station=KXYZ123')).toBeNull();
    expect(readDeviceLink(`#setup&key=${KEY}`)).toBeNull();
    expect(readDeviceLink('#setup=')).toBeNull();
    expect(readDeviceLink('#setup=!!!not-base64')).toBeNull();
    expect(readDeviceLink('#setup=' + btoa('"just a string"'))).toBeNull();
    expect(readDeviceLink(undefined)).toBeNull();
  });

  it('reads a link pasted as text', () => {
    const link = buildDeviceLink(origin, { stationId: 'K1', key: KEY });
    expect(readPastedLink(`  ${link}\n`)).toMatchObject({ stationId: 'K1', key: KEY });
    expect(readPastedLink(`here you go: ${link} thanks`)).toMatchObject({ stationId: 'K1' });
    expect(readPastedLink('KXYZ123')).toBeNull();
    expect(readPastedLink(null)).toBeNull();
  });

  it('recognizes setup hashes of either format', () => {
    expect(isSetupHash('#setup=abc')).toBe(true);
    expect(isSetupHash('#setup&station=K1')).toBe(true);
    expect(isSetupHash('#other')).toBe(false);
  });
});

describe('linkOrigin', () => {
  it('points the vercel.app address at yardobs.app', () => {
    expect(linkOrigin({ hostname: 'yardobs.vercel.app', origin: 'https://yardobs.vercel.app' })).toBe('https://yardobs.app');
  });
  it('keeps other origins, so test builds link to themselves', () => {
    expect(linkOrigin({ hostname: 'yardobs.app', origin: 'https://yardobs.app' })).toBe('https://yardobs.app');
    expect(linkOrigin({ hostname: 'localhost', origin: 'http://localhost:5173' })).toBe('http://localhost:5173');
    expect(linkOrigin({ hostname: 'yardobs-git-x.vercel.app', origin: 'https://yardobs-git-x.vercel.app' })).toBe('https://yardobs-git-x.vercel.app');
  });
});

describe('setupFingerprint', () => {
  it('is stable for a link and differs between links', () => {
    const a = new URL(buildDeviceLink('https://yardobs.app', { stationId: 'K1', key: KEY })).hash;
    const b = new URL(buildDeviceLink('https://yardobs.app', { stationId: 'K2', key: KEY })).hash;
    expect(setupFingerprint(a)).toBe(setupFingerprint(a));
    expect(setupFingerprint(a)).not.toBe(setupFingerprint(b));
    expect(setupFingerprint(a)).not.toContain(KEY);
  });
});
