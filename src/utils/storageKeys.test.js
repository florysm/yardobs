import { describe, it, expect, vi, afterEach } from 'vitest';
import { STORAGE_KEYS, readStored, writeStored } from './storageKeys';

describe('storage key builders', () => {
  it('keeps day-part names space-free', () => {
    expect(STORAGE_KEYS.insightKey('KXY1', '2026-11-17', 'early morning', 'imperial'))
      .toBe('yardobs-insight-KXY1-2026-11-17-early-morning-imperial');
    expect(STORAGE_KEYS.activityInsightKey('geo1.00,2.00', 'bbq', 'late evening', 'metric'))
      .toBe('yardobs-activity-insight-geo1.00,2.00-bbq-late-evening-metric');
  });

  it('defaults the forecast-day AQI bucket and part', () => {
    expect(STORAGE_KEYS.forecastDayInsightKey('KXY1', '2026-11-18', 'imperial'))
      .toBe('yardobs-fcday-insight-KXY1-2026-11-18-imperial-aqna-day');
    expect(STORAGE_KEYS.forecastDayInsightKey('KXY1', '2026-11-17', 'imperial', 50, 'early afternoon'))
      .toBe('yardobs-fcday-insight-KXY1-2026-11-17-imperial-aq50-early-afternoon');
  });

  it('has no duplicate fixed keys', () => {
    const fixed = Object.values(STORAGE_KEYS).filter(v => typeof v === 'string');
    expect(new Set(fixed).size).toBe(fixed.length);
  });
});

describe('readStored / writeStored', () => {
  afterEach(() => vi.unstubAllGlobals());
  const memory = () => {
    const m = {};
    vi.stubGlobal('localStorage', {
      getItem: k => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: k => { delete m[k]; },
    });
    return m;
  };

  it('round-trips, and falls back when missing or empty', () => {
    const m = memory();
    expect(readStored('k', 'd')).toBe('d');
    writeStored('k', 'v');
    expect(readStored('k', 'd')).toBe('v');
    m.k = '';
    expect(readStored('k', 'd')).toBe('d');
  });

  it('removes the key for null or empty', () => {
    const m = memory();
    writeStored('k', 'v');
    writeStored('k', null);
    expect('k' in m).toBe(false);
    writeStored('k', 'v');
    writeStored('k', '');
    expect('k' in m).toBe(false);
  });

  it('never throws when storage is blocked', () => {
    const boom = () => { throw new Error('blocked'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(readStored('k', 'd')).toBe('d');
    expect(() => writeStored('k', 'v')).not.toThrow();
  });
});
