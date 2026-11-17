import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS } from './storageKeys';

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
