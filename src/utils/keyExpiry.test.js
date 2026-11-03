import { describe, it, expect } from 'vitest';
import { isValidExpiryDate, daysUntilExpiry, keyExpiryStatus, expiryMessage } from './keyExpiry';

const NOW = new Date(2026, 10, 3, 21, 30); // Nov 3 2026, late evening local

describe('isValidExpiryDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidExpiryDate('2026-11-15')).toBe(true);
    expect(isValidExpiryDate('2026-02-30')).toBe(false);
    expect(isValidExpiryDate('11/15/2026')).toBe(false);
    expect(isValidExpiryDate('')).toBe(false);
    expect(isValidExpiryDate(null)).toBe(false);
  });
});

describe('daysUntilExpiry', () => {
  it('counts calendar days regardless of the time of day', () => {
    expect(daysUntilExpiry('2026-11-15', NOW)).toBe(12);
    expect(daysUntilExpiry('2026-11-04', NOW)).toBe(1);
    expect(daysUntilExpiry('2026-11-03', NOW)).toBe(0);
    expect(daysUntilExpiry('2026-11-02', NOW)).toBe(-1);
  });

  it('returns null without a valid date', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
});

describe('keyExpiryStatus', () => {
  it('classifies by days remaining', () => {
    expect(keyExpiryStatus(null, NOW).state).toBe('none');
    expect(keyExpiryStatus('2026-12-31', NOW).state).toBe('ok');
    expect(keyExpiryStatus('2026-11-17', NOW).state).toBe('soon'); // 14 days
    expect(keyExpiryStatus('2026-11-18', NOW).state).toBe('ok');   // 15 days
    expect(keyExpiryStatus('2026-11-03', NOW).state).toBe('soon'); // today
    expect(keyExpiryStatus('2026-11-01', NOW)).toEqual({ state: 'expired', days: -2 });
  });
});

describe('expiryMessage', () => {
  it('is null when nothing needs attention', () => {
    expect(expiryMessage(null, NOW)).toBeNull();
    expect(expiryMessage('2027-01-01', NOW)).toBeNull();
  });

  it('describes upcoming, same-day and past expiration', () => {
    expect(expiryMessage('2026-11-15', NOW)).toMatch(/12 days/);
    expect(expiryMessage('2026-11-04', NOW)).toMatch(/1 day\)/);
    expect(expiryMessage('2026-11-03', NOW)).toMatch(/expires today/);
    expect(expiryMessage('2026-11-01', NOW)).toMatch(/has expired/);
  });
});
