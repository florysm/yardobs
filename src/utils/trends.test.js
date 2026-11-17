import { describe, it, expect } from 'vitest';
import {
  trailingDayKeys, lastYearKeys, weekdayLabel, dayPrecip, sumPrecip, weeklyGroups,
  fixMidnightReset, stats, summarize, buildHourlyRows, buildDailyRows,
  hourlyLastYearKeys, todayPrecipFromRecent,
} from './trends';

// TZ=UTC (npm script): local dates equal the UTC dates below.
const today = new Date(Date.UTC(2026, 10, 17, 10, 30)); // Tue 2026-11-17 10:30
const day = (date, tempHigh, tempLow, precipTotal) =>
  [{ obsTimeLocal: `${date} 23:59:59`, humidityAvg: 50, imperial: { tempAvg: (tempHigh + tempLow) / 2, tempHigh, tempLow, precipTotal, pressureMax: 30 } }];
const hourly = (stamp, tempAvg, precipTotal = 0) =>
  ({ obsTimeLocal: stamp, humidityAvg: 60, imperial: { tempAvg, precipTotal, pressureMax: 30 } });

describe('date keys', () => {
  it('builds trailing keys oldest first, ending today', () => {
    expect(trailingDayKeys(3, today)).toEqual(['20261115', '20261116', '20261117']);
  });
  it('maps each day to the same calendar day last year, across a leap year', () => {
    expect(lastYearKeys(['20240229', '20240301'])).toEqual(['20230228', '20230301']);
  });
  it('labels weekdays', () => {
    expect(weekdayLabel('20261117')).toBe('Tu');
  });
  it('groups 30 days into three weeks and a final nine days', () => {
    const groups = weeklyGroups(trailingDayKeys(30, today));
    expect(groups.map(g => g.keys.length)).toEqual([7, 7, 7, 9]);
    expect(groups[0].label).toBe('10/19–10/25');
    expect(groups[3].label).toBe('11/9–11/17');
  });
});

describe('rain totals', () => {
  const historyDaily = { '20261116': day('2026-11-16', 60, 40, 0.25), '20261117': day('2026-11-17', 60, 40, 0.1) };
  it('reads a day and sums a range, treating missing days as 0', () => {
    expect(dayPrecip(historyDaily, '20261116')).toBe(0.25);
    expect(dayPrecip(historyDaily, '20261101')).toBeNull();
    expect(sumPrecip(historyDaily, ['20261115', '20261116', '20261117'])).toBeCloseTo(0.35);
  });
  it('takes today\'s running total from the rolling hourly history', () => {
    const recent = [hourly('2026-11-16 23:00:00', 50, 0.4), hourly('2026-11-17 08:00:00', 50, 0.05), hourly('2026-11-17 09:00:00', 50, 0.12)];
    expect(todayPrecipFromRecent(recent, today)).toBe(0.12);
    expect(todayPrecipFromRecent([], today)).toBeNull();
  });
});

describe('fixMidnightReset / stats / summarize', () => {
  it('carries the pre-midnight total forward', () => {
    const rows = [{ precip: 0.2 }, { precip: 0.3 }, { precip: 0 }, { precip: 0.1 }];
    expect(fixMidnightReset(rows).map(r => r.precip)).toEqual([0.2, 0.3, 0.3, 0.4]);
  });
  it('ignores nulls', () => {
    expect(stats([3, null, 1, 2])).toEqual({ high: 3, low: 1, avg: 2 });
    expect(stats([null])).toEqual({ high: null, low: null, avg: null });
  });
  it('summarizes a day of hourly obs', () => {
    const obs = [{ imperial: { tempHigh: 50, tempLow: 40, precipTotal: 0.1 } }, { imperial: { tempHigh: 55, tempLow: 42, precipTotal: 0.2 } }];
    expect(summarize(obs)).toEqual({ tempHigh: 55, tempLow: 40, precipTotal: 0.2 });
    expect(summarize([])).toBeNull();
  });
});

describe('buildHourlyRows', () => {
  it('matches last year by date and hour across midnight', () => {
    const ly = hourlyLastYearKeys(today);
    expect(ly).toEqual({ today: '20251117', yesterday: '20251116' });
    const historyRecent = [hourly('2026-11-16 23:00:00', 50), hourly('2026-11-17 09:00:00', 55)];
    const history = {
      '20251116': [hourly('2025-11-16 09:00:00', 1), hourly('2025-11-16 23:00:00', 41)],
      '20251117': [hourly('2025-11-17 09:00:00', 45), hourly('2025-11-17 23:00:00', 2)],
    };
    const rows = buildHourlyRows({ historyRecent, history, metric: 'temp', units: 'imperial', today });
    expect(rows.map(r => [r.time, r.temp, r.ly_temp])).toEqual([['23:00', 50, 41], ['09:00', 55, 45]]);
  });
});

describe('buildDailyRows', () => {
  const keys = ['20261116', '20261117'];
  const lyKeys = lastYearKeys(keys);
  const historyDaily = {
    '20261117': day('2026-11-17', 60, 40, 0.1),
    '20251116': day('2025-11-16', 50, 30, 0),
    '20251117': day('2025-11-17', 52, 32, 0.3),
  };
  it('drops days with no summary and adds last year\'s high/low for temperature', () => {
    const rows = buildDailyRows({ historyDaily, keys, lyKeys, metric: 'temp', showYoY: true, units: 'imperial' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ time: '11-17', tempHigh: 60, tempLow: 40, ly_tempHigh: 52, ly_tempLow: 32 });
  });
  it('adds the metric itself otherwise, and nothing without YoY', () => {
    const rows = buildDailyRows({ historyDaily, keys, lyKeys, metric: 'precip', showYoY: true, units: 'imperial' });
    expect(rows[0].ly_precip).toBe(0.3);
    const plain = buildDailyRows({ historyDaily, keys, lyKeys, metric: 'precip', showYoY: false, units: 'imperial' });
    expect(plain[0]).not.toHaveProperty('ly_precip');
  });
});
