import { describe, it, expect } from 'vitest';
import { yoyInsight, yoyMode, lyObsAtHour } from './yoyInsight';

// TZ=UTC (npm script): local hours equal the UTC hours below.
const at = h => new Date(Date.UTC(2026, 10, 17, h, 15));
const obs = (h, tempAvg, precipTotal = 0) => ({
  obsTimeLocal: `2025-11-17 ${String(h).padStart(2, '0')}:00:00`,
  imperial: { tempAvg, precipTotal },
});
const lyHourly = [obs(6, 40), obs(9, 48), obs(13, 58, 0.15), obs(16, 60, 0.2)];
const base = { lyHourlyObs: lyHourly, lyDailyHigh: 62, lyDailyPrecip: 0.3, units: 'imperial' };

describe('yoyMode', () => {
  it('follows the shared day parts', () => {
    expect([0, 5, 7].map(yoyMode)).toEqual(['start', 'start', 'start']);
    expect([8, 11].map(yoyMode)).toEqual(['building', 'building']);
    expect([12, 17].map(yoyMode)).toEqual(['afternoon', 'afternoon']);
    expect([18, 21, 23].map(yoyMode)).toEqual(['summary', 'summary', 'summary']);
  });
});

describe('lyObsAtHour', () => {
  it('picks the closest hour', () => {
    expect(lyObsAtHour(lyHourly, 10).imperial.tempAvg).toBe(48);
    expect(lyObsAtHour(lyHourly, 15).imperial.tempAvg).toBe(60);
  });
  it('is null with no data', () => {
    expect(lyObsAtHour([], 10)).toBeNull();
    expect(lyObsAtHour(null, 10)).toBeNull();
  });
});

describe('yoyInsight', () => {
  it('start: compares with the same hour last year', () => {
    const note = yoyInsight({ ...base, currentTemp: 45, now: at(6) });
    expect(note).toMatch(/^Warmer start than last November 17 — 45° now vs 40°/);
  });

  it('start: says "consistent" when the rounded temps match', () => {
    expect(yoyInsight({ ...base, currentTemp: 40.4, now: at(6) })).toMatch(/consistent with last November 17/);
  });

  it('building: running delta plus the forecast high', () => {
    const note = yoyInsight({ ...base, currentTemp: 44, forecastHigh: 65, now: at(9) });
    expect(note).toBe("Running 4° below last year right now, but today's forecast high of 65° would top last year's 62°.");
  });

  it('afternoon: already past last year\'s high', () => {
    expect(yoyInsight({ ...base, currentTemp: 64, now: at(14) })).toMatch(/^Already warmer than last year's high of 62°/);
  });

  it('afternoon: rain clauses use last year\'s amount by that hour', () => {
    const note = yoyInsight({ ...base, currentTemp: 55, todayPrecip: 0, now: at(13) });
    expect(note).toMatch(/Dry so far; last year had 0\.15" by now\.$/);
  });

  it('summary: how the day peaked, wetter or drier', () => {
    const note = yoyInsight({ ...base, currentTemp: 50, todayHigh: 66, todayPrecip: 0.5, now: at(20) });
    expect(note).toBe('Warmer day than last year: peaked at 66° vs 62° last November 17. Also wetter — 0.50" vs 0.30" last year.');
  });

  it('converts temperatures and rain for metric', () => {
    const note = yoyInsight({ ...base, units: 'metric', currentTemp: 50, todayHigh: 66, todayPrecip: 0.5, now: at(20) });
    expect(note).toBe('Warmer day than last year: peaked at 19° vs 17° last November 17. Also wetter — 12.7 mm vs 7.6 mm last year.');
  });

  it('returns null without last-year data', () => {
    expect(yoyInsight({ currentTemp: 50, lyHourlyObs: [], units: 'imperial', now: at(6) })).toBeNull();
    expect(yoyInsight({ currentTemp: 50, lyHourlyObs: [], units: 'imperial', now: at(20) })).toBeNull();
  });
});
