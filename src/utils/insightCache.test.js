import { describe, it, expect, beforeEach } from 'vitest';
import { readInsightCache, writeInsightCache, insightScope } from './insightCache';
import { INSIGHT_TTL_MS } from './storageKeys';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

const T = Date.parse('2026-11-17T12:00:00Z');

beforeEach(() => store.clear());

describe('insight cache', () => {
  it('round-trips data and meta within the TTL', () => {
    writeInsightCache('k', { narrative: 'Hi' }, { temp: 60 }, T);
    expect(readInsightCache('k', T + 1000)).toMatchObject({ data: { narrative: 'Hi' }, meta: { temp: 60 } });
  });

  it('expires at the TTL', () => {
    writeInsightCache('k', 'x', null, T);
    expect(readInsightCache('k', T + INSIGHT_TTL_MS - 1)).not.toBeNull();
    expect(readInsightCache('k', T + INSIGHT_TTL_MS)).toBeNull();
  });

  it('treats an entry from the future (clock moved backward) as expired', () => {
    writeInsightCache('k', 'x', null, T);
    expect(readInsightCache('k', T - 1000)).toBeNull();
  });

  it('ignores entries written by older builds, which could hold a blank or "busy" insight', () => {
    store.set('k', JSON.stringify({ data: { narrative: 'Insight temporarily unavailable' }, ts: T }));
    expect(readInsightCache('k', T)).toBeNull();
    store.set('a', JSON.stringify({ insight: 'old', ts: T, conditions: {} }));
    expect(readInsightCache('a', T)).toBeNull();
  });

  it('returns null for missing or malformed entries', () => {
    expect(readInsightCache('none', T)).toBeNull();
    store.set('bad', '{not json');
    expect(readInsightCache('bad', T)).toBeNull();
  });
});

describe('insightScope', () => {
  it('uses the station ID for station data', () => {
    expect(insightScope({ stationId: 'KXY1', sourceType: 'pws', lat: 1, lon: 2 })).toBe('KXY1');
  });

  it('uses coordinates for forecast-model data, even when a home station ID is present', () => {
    expect(insightScope({ stationId: 'KXY1', sourceType: 'forecast_model', lat: 48.8566, lon: 2.3522 })).toBe('geo48.86,2.35');
    expect(insightScope({ stationId: null, sourceType: 'forecast_model', lat: 0, lon: 0 })).toBe('geo0.00,0.00');
  });

  it('falls back to "preview" with nothing to go on', () => {
    expect(insightScope(null)).toBe('preview');
    expect(insightScope({ sourceType: 'forecast_model' })).toBe('preview');
  });
});
