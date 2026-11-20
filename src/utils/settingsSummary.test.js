import { describe, it, expect } from 'vitest';
import { stationSummary } from './settingsSummary';

const now = new Date(2026, 10, 20); // Nov 20, 2026

describe('stationSummary', () => {
  it('no station', () => {
    expect(stationSummary({ stationId: '', hasKey: false, now })).toEqual({ text: 'Not connected', needsAttention: true });
  });
  it('no key', () => {
    expect(stationSummary({ stationId: 'K1', hasKey: false, now })).toEqual({ text: 'K1 · No API key', needsAttention: true });
  });
  it('expired key', () => {
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: '2026-11-19', now }))
      .toEqual({ text: 'K1 · Key expired', needsAttention: true });
  });
  it('expiring within two weeks', () => {
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: '2026-11-29', now }).text).toBe('K1 · Key expires in 9 days');
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: '2026-11-20', now }).text).toBe('K1 · Key expires today');
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: '2026-11-21', now }).text).toBe('K1 · Key expires tomorrow');
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: '2026-11-29', now }).needsAttention).toBe(true);
  });
  it('healthy key, with or without a recorded expiry', () => {
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: '2027-06-01', now })).toEqual({ text: 'K1 · Key saved', needsAttention: false });
    expect(stationSummary({ stationId: 'K1', hasKey: true, expires: null, now })).toEqual({ text: 'K1 · Key saved', needsAttention: false });
  });
});
