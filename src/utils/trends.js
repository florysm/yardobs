// Pure data builders for the Trends tab: date keys, chart rows, rain totals.
// History arrives raw imperial from TWC; rows are converted to display units
// once here so the chart and stat code has no unit logic of its own.
import { toDateStr, toISODate, addDays, lastYearKey } from './dateUtils';
import { convertTemp, convertPressure, convertPrecip } from './units';

export const RANGE_DAYS = { '7d': 7, '30d': 30 };

// The last `count` local days as YYYYMMDD keys, oldest first, ending today.
export function trailingDayKeys(count, today = new Date()) {
  return Array.from({ length: count }, (_, i) => toDateStr(addDays(today, -(count - 1 - i))));
}

// YYYYMMDD → Date at local noon (noon keeps it on the right day in any zone).
export function parseDateKey(key) {
  return new Date(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}T12:00:00`);
}

// Each day's same calendar day last year (see sameDayLastYear).
export function lastYearKeys(keys) {
  return keys.map(k => lastYearKey(parseDateKey(k)));
}

export function weekdayLabel(key) {
  return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][parseDateKey(key).getDay()];
}

// A day's rain total (raw inches) from the daily-summary cache, or null.
export function dayPrecip(historyDaily, key) {
  return (historyDaily[key] ?? [])[0]?.imperial?.precipTotal ?? null;
}

// Total rain (raw inches) over `keys`; days with no data count as 0.
export function sumPrecip(historyDaily, keys) {
  return keys.reduce((sum, k) => sum + (dayPrecip(historyDaily, k) ?? 0), 0);
}

// The 30-day bar chart's four groups: three weeks and a final 9 days.
const WEEK_GROUPS = [[0, 7], [7, 14], [14, 21], [21, 30]];

export function weeklyGroups(keys) {
  const fmtMD = k => { const d = parseDateKey(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
  return WEEK_GROUPS.map(([s, e]) => ({
    keys: keys.slice(s, e),
    label: `${fmtMD(keys[s])}–${fmtMD(keys[e - 1])}`,
  }));
}

// Hourly history fields: tempAvg/humidityAvg/pressureMax (not temp/humidity/pressure).
export function mergeHourly(obs = [], units) {
  return obs.map(o => ({
    time:     o.obsTimeLocal?.slice(11, 16) ?? '',
    date:     o.obsTimeLocal?.slice(0, 10) ?? '',  // YYYY-MM-DD, for YoY hour matching
    hour:     o.obsTimeLocal?.slice(11, 13) ?? '',
    temp:     convertTemp(o.imperial?.tempAvg ?? null, units),
    humidity: o.humidityAvg           ?? null,
    pressure: convertPressure(o.imperial?.pressureMax ?? null, units),
    precip:   convertPrecip(o.imperial?.precipTotal ?? null, units),
  }));
}

// Last year's average temperature (raw °F) for `hour` (0–23) from a day of
// hourly history, or null. Hours come from obsTimeLocal, as in mergeHourly, so
// this is the same hour the Trends 24h chart pairs with.
export function tempAtHour(obs, hour) {
  const hh = String(hour).padStart(2, '0');
  const o = (obs ?? []).find(x => x.obsTimeLocal?.slice(11, 13) === hh);
  return o?.imperial?.tempAvg ?? null;
}

// Daily summary — one observation object → one chart row.
export function mergeDay(o, units) {
  if (!o) return null;
  return {
    time:     o.obsTimeLocal?.slice(5, 10) ?? '',
    temp:     convertTemp(o.imperial?.tempAvg ?? null, units),
    tempHigh: convertTemp(o.imperial?.tempHigh ?? null, units),
    tempLow:  convertTemp(o.imperial?.tempLow ?? null, units),
    humidity: o.humidityAvg           ?? null,
    pressure: convertPressure(o.imperial?.pressureMax ?? null, units),
    precip:   convertPrecip(o.imperial?.precipTotal ?? null, units),
  };
}

// The station's running rain total resets at midnight; carry the pre-reset
// total forward so a rolling 24h line doesn't drop to zero mid-chart.
export function fixMidnightReset(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].precip != null && arr[i - 1].precip != null && arr[i].precip < arr[i - 1].precip) {
      const offset = arr[i - 1].precip;
      return arr.map((row, j) =>
        j >= i ? { ...row, precip: row.precip != null ? row.precip + offset : null } : row
      );
    }
  }
  return arr;
}

export function stats(arr) {
  const vals = arr.filter(v => v != null);
  if (!vals.length) return { high: null, low: null, avg: null };
  return {
    high: Math.max(...vals),
    low:  Math.min(...vals),
    avg:  vals.reduce((a, b) => a + b, 0) / vals.length,
  };
}

// High/low/rain for a day of hourly observations (raw imperial).
export function summarize(obs = []) {
  if (!obs?.length) return null;
  const highs   = obs.map(o => o.imperial?.tempHigh).filter(v => v != null);
  const lows    = obs.map(o => o.imperial?.tempLow).filter(v => v != null);
  const precips = obs.map(o => o.imperial?.precipTotal).filter(v => v != null);
  return {
    tempHigh:    highs.length   ? Math.max(...highs)  : null,
    tempLow:     lows.length    ? Math.min(...lows)   : null,
    precipTotal: precips.length ? Math.max(...precips) : null,
  };
}

// The two last-year days the rolling 24h chart can span.
export function hourlyLastYearKeys(today = new Date()) {
  return { today: lastYearKey(today), yesterday: lastYearKey(addDays(today, -1)) };
}

// Rolling-24h rows. The window spans yesterday and today, so each row is
// matched to the same day-a-year-ago and the same hour — pairing by array
// position would offset the two lines by the current hour.
export function buildHourlyRows({ historyRecent, history, metric, units, today = new Date() }) {
  const rows = fixMidnightReset(mergeHourly(historyRecent, units).slice(-24));
  const ly = hourlyLastYearKeys(today);
  const byHour = obs => Object.fromEntries(mergeHourly(obs ?? [], units).map(r => [r.hour, r]));
  const lyByDate = {
    [toISODate(today)]:              byHour(history[ly.today]),
    [toISODate(addDays(today, -1))]: byHour(history[ly.yesterday]),
  };
  return rows.map(row => ({
    ...row,
    [`ly_${metric}`]: lyByDate[row.date]?.[row.hour]?.[metric] ?? null,
  }));
}

// 7- and 30-day rows from daily summaries. Days with no summary are dropped;
// with showYoY each row carries the same calendar day last year (high and low
// for temperature, the metric itself otherwise).
export function buildDailyRows({ historyDaily, keys, lyKeys, metric, showYoY, units }) {
  return keys.map((key, i) => {
    const row = mergeDay((historyDaily[key] ?? [])[0], units);
    if (!row) return null;
    if (showYoY) {
      const lyRow = mergeDay((historyDaily[lyKeys[i]] ?? [])[0], units);
      if (metric === 'temp') {
        row.ly_tempHigh = lyRow?.tempHigh ?? null;
        row.ly_tempLow  = lyRow?.tempLow  ?? null;
      } else {
        row[`ly_${metric}`] = lyRow?.[metric] ?? null;
      }
    }
    return row;
  }).filter(Boolean);
}

// Today's rain so far (raw inches) from the rolling hourly history, or null.
export function todayPrecipFromRecent(historyRecent, today = new Date()) {
  const iso = toISODate(today);
  const todayObs = (historyRecent ?? []).filter(o => o.obsTimeLocal?.startsWith(iso));
  return todayObs.length ? Math.max(...todayObs.map(o => o.imperial?.precipTotal ?? 0)) : null;
}
