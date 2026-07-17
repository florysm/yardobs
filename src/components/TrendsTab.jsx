import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { toDateStr, toISODate } from '../utils/dateUtils';
import { fmtTimeTick } from '../utils/format';
import { UNITS, convertTemp, convertPressure, convertPrecip, tempUnitLabel, formatPrecipTotal } from '../utils/units';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d',  label: '7 Day' },
  { id: '30d', label: '30 Day' },
];

const METRICS = [
  { id: 'temp',     label: 'Temperature', domain: ['auto','auto'] },
  { id: 'precip',   label: 'Rainfall',    domain: [0,'auto'] },
  { id: 'humidity', label: 'Humidity',    domain: [0, 100] },
  { id: 'pressure', label: 'Pressure',    domain: ['auto','auto'] },
];

function metricUnit(id, units) {
  if (id === 'temp')     return tempUnitLabel(units);
  if (id === 'precip')   return units === UNITS.METRIC ? ' mm' : '"';
  if (id === 'pressure') return units === UNITS.METRIC ? ' hPa' : ' inHg';
  return '%';
}

function metricDigits(id, units) {
  if (id === 'precip')   return units === UNITS.METRIC ? 1 : 2;
  if (id === 'pressure') return units === UNITS.METRIC ? 0 : 2;
  return 0;
}


function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Hourly history fields: tempAvg/humidityAvg/pressureMax (not temp/humidity/pressure)
// Converts to display units once here so all downstream chart/stat code (which
// has no unit concept of its own) just operates on already-correct numbers.
function mergeHourly(obs = [], units) {
  return obs.map(o => ({
    time:     o.obsTimeLocal?.slice(11, 16) ?? '',
    temp:     convertTemp(o.imperial?.tempAvg ?? null, units),
    humidity: o.humidityAvg           ?? null,
    pressure: convertPressure(o.imperial?.pressureMax ?? null, units),
    precip:   convertPrecip(o.imperial?.precipTotal ?? null, units),
  }));
}

// Daily summary — one observation object → one chart row
function mergeDay(o, units) {
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

function fixMidnightReset(arr) {
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

function stats(arr) {
  const vals = arr.filter(v => v != null);
  if (!vals.length) return { high: null, low: null, avg: null };
  const high = Math.max(...vals);
  const low  = Math.min(...vals);
  const avg  = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { high, low, avg };
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '8px 12px', fontSize: 12,
      color: 'var(--tp)', backdropFilter: 'blur(12px)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--tm)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value != null ? p.value : '—'}</strong>
        </div>
      ))}
    </div>
  );
};

function BarChart({ values, labels, lyValues = null, height = 70, units }) {
  const allVals = lyValues ? [...values, ...lyValues.filter(v => v != null)] : values;
  const max = Math.max(...allVals, 0.01);
  const barAreaH = height - 30;
  const scaleH = v => Math.max((v / max) * barAreaH, v > 0 ? 4 : 1);
  const digits = units === UNITS.METRIC ? 1 : 2;
  const unit   = units === UNITS.METRIC ? 'mm' : '"';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height, margin: '10px 0 6px' }}>
      {values.map((v, i) => {
        const ly = lyValues ? lyValues[i] : null;
        const curH = scaleH(v);
        const lyH  = ly != null && ly > 0 ? Math.max((ly / max) * barAreaH, 2) : 0;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width: '100%' }}>
              {/* Current year */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', lineHeight: 1, color: 'var(--accent)', visibility: v > 0 ? 'visible' : 'hidden' }}>
                  {v.toFixed(digits)}{unit}
                </div>
                <div style={{
                  width: '100%', height: curH,
                  background: 'var(--bar)', opacity: 0.85,
                  borderRadius: '3px 3px 0 0', transition: 'height 0.4s',
                }} />
              </div>
              {/* Last year */}
              {ly != null && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ fontSize: 7, fontFamily: 'var(--font-mono)', lineHeight: 1, color: 'var(--yoy)', visibility: ly > 0 ? 'visible' : 'hidden' }}>
                    {(ly ?? 0).toFixed(digits)}{unit}
                  </div>
                  <div style={{
                    width: '100%', height: lyH || 1,
                    background: 'var(--yoy)', opacity: 0.55,
                    borderRadius: '3px 3px 0 0',
                  }} />
                </div>
              )}
            </div>
            <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>{labels[i]}</div>
          </div>
        );
      })}
    </div>
  );
}

function RainfallSummaryCard({ range, currentTotal, lyTotal, units }) {
  const delta = currentTotal != null && lyTotal != null ? currentTotal - lyTotal : null;
  const sign  = delta != null && delta >= 0 ? '+' : '';
  const deltaColor = delta == null ? 'var(--tm)'
    : delta >  0.01 ? 'var(--delta-up)'
    : delta < -0.01 ? 'var(--delta-dn)'
    : 'var(--tm)';
  const title = range === '24h' ? "Today's Rainfall"
              : range === '7d'  ? '7-Day Rainfall'
              :                   '30-Day Rainfall';
  const digits = units === UNITS.METRIC ? 1 : 2;
  const unit   = units === UNITS.METRIC ? ' mm' : '"';
  return (
    <div className="y-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="y-label">{title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--tp)', fontWeight: 500 }}>
            {currentTotal != null ? `${currentTotal.toFixed(digits)}${unit}` : '—'}
          </span>
          {lyTotal != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tm)' }}>
              LY: {lyTotal.toFixed(digits)}{unit}
            </span>
          )}
          {delta != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: deltaColor }}>
              {sign}{delta.toFixed(digits)}{unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function summarize(obs = []) {
  if (!obs.length) return null;
  const highs   = obs.map(o => o.imperial?.tempHigh).filter(v => v != null);
  const lows    = obs.map(o => o.imperial?.tempLow).filter(v => v != null);
  const precips = obs.map(o => o.imperial?.precipTotal).filter(v => v != null);
  return {
    tempHigh:    highs.length   ? Math.max(...highs)   : null,
    tempLow:     lows.length    ? Math.min(...lows)     : null,
    precipTotal: precips.length ? Math.max(...precips)  : null,
  };
}

// thisVal/lastVal are always raw imperial (from `current`/summarize()); this
// component converts to display units itself so callers don't need to.
function DeltaCell({ label, thisVal, lastVal, kind, units }) {
  const convert = kind === 'precip' ? convertPrecip : convertTemp;
  const digits  = kind === 'precip' ? (units === UNITS.METRIC ? 1 : 2) : 0;
  const unit    = kind === 'precip' ? (units === UNITS.METRIC ? ' mm' : '"') : tempUnitLabel(units);
  const cThis   = convert(thisVal, units);
  const cLast   = convert(lastVal, units);
  const factor = Math.pow(10, digits);
  const rThis  = cThis != null ? Math.round(cThis * factor) / factor : null;
  const rLast  = cLast != null ? Math.round(cLast * factor) / factor : null;
  const delta  = rThis != null && rLast != null ? rThis - rLast : null;
  const sign   = delta != null && delta >= 0 ? '+' : '';
  const color = delta == null ? 'var(--tm)' : delta > 0.05 ? 'var(--delta-up)' : delta < -0.05 ? 'var(--delta-dn)' : 'var(--tm)';
  return (
    <div style={{ textAlign: 'center', padding: '6px 4px' }}>
      <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--tp)', marginTop: 3, fontWeight: 500 }}>
        {cThis != null ? `${cThis.toFixed(digits)}${unit}` : '—'}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tm)', marginTop: 1 }}>
        {cLast != null ? `LY: ${cLast.toFixed(digits)}${unit}` : ''}
      </div>
      {delta != null && (
        <div style={{ fontSize: 11, marginTop: 3, fontWeight: 500, color }}>{sign}{Number(delta).toFixed(digits)}{unit}</div>
      )}
    </div>
  );
}

function dayPhase(hour) {
  if (hour < 10) return 'morning';
  if (hour < 14) return 'midday';
  if (hour < 19) return 'afternoon';
  return 'evening';
}

function lyObsAtCurrentHour(lyHourlyObs) {
  if (!lyHourlyObs?.length) return null;
  const h = new Date().getHours();
  return lyHourlyObs.reduce((best, obs) => {
    const obsHour = parseInt((obs.obsTimeLocal ?? '').split(' ')[1]?.split(':')[0] ?? '-1', 10);
    const bestHour = parseInt((best.obsTimeLocal ?? '').split(' ')[1]?.split(':')[0] ?? '-1', 10);
    return Math.abs(obsHour - h) < Math.abs(bestHour - h) ? obs : best;
  }, lyHourlyObs[0]);
}

function yoyInsight({ currentTemp, todayPrecip, lyHourlyObs, lyDailyHigh, lyDailyPrecip, forecastHigh, todayHigh, units }) {
  const hour = new Date().getHours();
  const phase = dayPhase(hour);
  const lyObs = lyObsAtCurrentHour(lyHourlyObs);
  const lyHourPrecip = lyObs?.imperial?.precipTotal ?? null;
  const dateStr = new Date().toLocaleDateString([], { month: 'long', day: 'numeric' });

  // Temperature: converting each raw-imperial input once up front is safe —
  // an affine F→C transform preserves ordering and (after independent
  // rounding) differences, so all the comparison/diff logic below is unchanged.
  // Precipitation thresholds (0.01"/0.1") are inches-specific and must stay
  // raw imperial for the comparisons; only display uses formatPrecipTotal().
  currentTemp  = convertTemp(currentTemp, units);
  lyDailyHigh  = convertTemp(lyDailyHigh, units);
  forecastHigh = convertTemp(forecastHigh, units);
  todayHigh    = convertTemp(todayHigh, units);
  const lyHourTemp = convertTemp(lyObs?.imperial?.tempAvg ?? lyObs?.imperial?.tempHigh ?? null, units);

  let lead = null;
  let precipClause = null;

  if (phase === 'morning') {
    if (currentTemp == null || lyHourTemp == null) return null;
    const roundedDiff = Math.round(currentTemp) - Math.round(lyHourTemp);
    if (roundedDiff === 0) {
      lead = `Temperature is consistent with last ${dateStr} at this hour — ${Math.round(currentTemp)}° now.`;
    } else {
      const dir = roundedDiff > 0 ? 'Warmer' : 'Cooler';
      lead = `${dir} start than last ${dateStr} — ${Math.round(currentTemp)}° now vs ${Math.round(lyHourTemp)}° at this time last year.`;
    }
    const todayP = todayPrecip ?? 0;
    const lyP = lyHourPrecip ?? 0;
    if (todayP >= 0.01 && lyP >= 0.1) precipClause = `${formatPrecipTotal(todayP, units)} of rain so far vs ${formatPrecipTotal(lyP, units)} last year at this time.`;
    else if (todayP >= 0.01) precipClause = `${formatPrecipTotal(todayP, units)} of rain already; last year was dry at this hour.`;
    else if (lyP >= 0.1) precipClause = `Dry so far, but last year had ${formatPrecipTotal(lyP, units)} by this time.`;

  } else if (phase === 'midday') {
    if (currentTemp == null || lyHourTemp == null) return null;
    const absDiff = Math.abs(Math.round(currentTemp) - Math.round(lyHourTemp));
    const dir = currentTemp >= lyHourTemp ? 'above' : 'below';
    if (absDiff === 0) {
      if (forecastHigh != null && lyDailyHigh != null) {
        const fDir = forecastHigh >= lyDailyHigh ? 'top' : 'fall short of';
        lead = `Temperature is currently consistent with last year, but today's forecast high of ${Math.round(forecastHigh)}° would ${fDir} last year's ${Math.round(lyDailyHigh)}°.`;
      } else {
        lead = `Temperature is currently consistent with last year.`;
      }
    } else if (forecastHigh != null && lyDailyHigh != null) {
      const fDir = forecastHigh >= lyDailyHigh ? 'top' : 'fall short of';
      const sameDirection = (dir === 'above' && forecastHigh >= lyDailyHigh) || (dir === 'below' && forecastHigh < lyDailyHigh);
      const conj = sameDirection ? 'and' : 'but';
      lead = `Running ${absDiff}° ${dir} last year right now, ${conj} today's forecast high of ${Math.round(forecastHigh)}° would ${fDir} last year's ${Math.round(lyDailyHigh)}°.`;
    } else if (lyDailyHigh != null) {
      lead = `Running ${absDiff}° ${dir} last year at this hour vs a ${Math.round(lyDailyHigh)}° high last ${dateStr}.`;
    } else {
      lead = `Running ${absDiff}° ${dir} last year at this hour.`;
    }
    const todayP = todayPrecip ?? 0;
    const lyP = lyHourPrecip ?? 0;
    if (todayP >= 0.01 && lyP >= 0.1) precipClause = `${formatPrecipTotal(todayP, units)} of rain so far vs ${formatPrecipTotal(lyP, units)} last year by now.`;
    else if (todayP >= 0.01) precipClause = `${formatPrecipTotal(todayP, units)} of rain already; last year was dry at this point.`;
    else if (lyP >= 0.1) precipClause = `Dry so far; last year had ${formatPrecipTotal(lyP, units)} by now.`;

  } else if (phase === 'afternoon') {
    if (currentTemp == null) return null;
    if (lyDailyHigh != null && currentTemp > lyDailyHigh) {
      lead = `Already warmer than last year's high of ${Math.round(lyDailyHigh)}° — currently ${Math.round(currentTemp)}° and still climbing.`;
    } else if (lyHourTemp != null) {
      const roundedDiff = Math.round(currentTemp) - Math.round(lyHourTemp);
      if (roundedDiff === 0) {
        lead = `Temperature is consistent with last ${dateStr} at this hour — ${Math.round(currentTemp)}° now.`;
      } else {
        const dir = roundedDiff > 0 ? 'Warmer' : 'Cooler';
        lead = `${dir} afternoon than last ${dateStr} — ${Math.round(currentTemp)}° now vs ${Math.round(lyHourTemp)}° at this time last year.`;
      }
    } else if (lyDailyHigh != null) {
      const roundedDiff = Math.round(currentTemp) - Math.round(lyDailyHigh);
      if (roundedDiff === 0) {
        lead = `Temperature matching last year's high of ${Math.round(lyDailyHigh)}° — currently ${Math.round(currentTemp)}°.`;
      } else {
        const dir = roundedDiff > 0 ? 'Warmer' : 'Cooler';
        lead = `${dir} afternoon than last ${dateStr} — currently ${Math.round(currentTemp)}° vs last year's high of ${Math.round(lyDailyHigh)}°.`;
      }
    } else {
      return null;
    }
    const todayP = todayPrecip ?? 0;
    const lyP = lyHourPrecip ?? lyDailyPrecip ?? 0;
    if (todayP >= 0.01 && lyP >= 0.1) precipClause = `${formatPrecipTotal(todayP, units)} of rain vs ${formatPrecipTotal(lyP, units)} last year by now.`;
    else if (todayP >= 0.01) precipClause = `${formatPrecipTotal(todayP, units)} of rain so far; last year was dry at this point.`;
    else if (lyP >= 0.1) precipClause = `Dry so far; last year had ${formatPrecipTotal(lyP, units)} by now.`;

  } else {
    const high = todayHigh ?? currentTemp;
    if (high == null || lyDailyHigh == null) return null;
    const dir = high >= lyDailyHigh ? 'Warmer' : 'Cooler';
    lead = `${dir} day than last year: peaked at ${Math.round(high)}° vs ${Math.round(lyDailyHigh)}° last ${dateStr}.`;
    const todayP = todayPrecip ?? 0;
    const lyP = lyDailyPrecip ?? 0;
    if (todayP >= 0.1 || lyP >= 0.1) {
      const rainDir = todayP >= lyP ? 'wetter' : 'drier';
      precipClause = `Also ${rainDir} — ${formatPrecipTotal(todayP, units)} vs ${formatPrecipTotal(lyP, units)} last year.`;
    }
  }

  if (!lead) return null;
  return precipClause ? `${lead} ${precipClause}` : lead;
}

export default function TrendsTab({ stationId, current, forecast, fetchHistory, history, fetchHistoryRecent, historyRecent, fetchHistoryDaily, historyDaily, chartColors, units }) {
  const [range,   setRange]   = useState('24h');
  const [metric,  setMetric]  = useState('temp');
  const [showYoY, setShowYoY] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setShowYoY(false); }, [metric, range]);

  const yoyFetched = useRef(false);
  const [yoy, setYoy] = useState({ today: null, lastYear: null, lyRaw: [] });

  useEffect(() => {
    if (yoyFetched.current || !stationId) return;
    yoyFetched.current = true;
    const todayKey = toDateStr(new Date());
    const now = new Date();
    const lyDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    // Feb 29 in a non-leap year rolls to Mar 1 — clamp back to Feb 28 instead
    if (lyDate.getMonth() !== now.getMonth()) lyDate.setDate(0);
    const lyKey = toDateStr(lyDate);
    Promise.all([fetchHistory(todayKey), fetchHistory(lyKey)])
      .then(([t, l]) => setYoy({ today: summarize(t), lastYear: summarize(l), lyRaw: l ?? [] }));
  }, [stationId, fetchHistory]);

  const today          = new Date();
  const lyKey          = toDateStr(addDays(today, -365));
  const lyYesterdayKey = toDateStr(addDays(today, -366));
  const lyDailyKeys    = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(today, -(6 - i) - 365)));

  const lyRainKeys = range === '24h'
    ? [lyKey]
    : Array.from(
        { length: range === '30d' ? 30 : 7 },
        (_, i) => toDateStr(addDays(today, -((range === '30d' ? 29 : 6) - i) - 365))
      );

  // Last 7 date keys for the rainfall bar chart (always kept fresh)
  const last7Keys = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(today, -(6 - i))));

  const ensureFetched = useCallback(async (key) => {
    if (!history[key]) await fetchHistory(key);
  }, [history, fetchHistory]);

  // Prefetch last 7 daily summaries on mount for the rainfall bar
  useEffect(() => {
    if (!stationId) return;
    last7Keys.forEach(k => fetchHistoryDaily(k));
  // fetchHistoryDaily is stable (only depends on stationId via ref cache)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, fetchHistoryDaily]);

  // Range-aware data fetching
  useEffect(() => {
    if (!stationId) return;
    setLoading(true);
    let tasks;
    if (range === '24h') {
      tasks = [fetchHistoryRecent()];
      if (showYoY) tasks.push(ensureFetched(lyKey), ensureFetched(lyYesterdayKey));
    } else {
      const count = range === '30d' ? 30 : 7;
      const keys = Array.from({ length: count }, (_, i) =>
        toDateStr(addDays(new Date(), -(count - 1 - i)))
      );
      tasks = keys.map(k => fetchHistoryDaily(k));
      if (showYoY && range === '7d') {
        tasks.push(...lyDailyKeys.map(k => fetchHistoryDaily(k)));
      }
      if (showYoY && range === '30d') {
        tasks.push(...lyRainKeys.map(k => fetchHistoryDaily(k)));
      }
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [stationId, range, lyKey, lyYesterdayKey, showYoY, ensureFetched, fetchHistoryRecent, fetchHistoryDaily]);

  // Lazily fetch LY daily data for the rainfall comparison card
  useEffect(() => {
    if (metric !== 'precip' || !stationId) return;
    lyRainKeys.forEach(k => fetchHistoryDaily(k));
  // lyRainKeys omitted: strings are stable day-to-day; fetchHistoryDaily dedupes via ref cache
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, metric, range, fetchHistoryDaily]);

  // Build chart data based on selected range
  let chartData;
  if (range === '24h') {
    const hourlyObs = fixMidnightReset(mergeHourly(historyRecent, units).slice(-24));
    const lyObs = [
      ...mergeHourly(history[lyYesterdayKey] ?? [], units),
      ...mergeHourly(history[lyKey]          ?? [], units),
    ].slice(-24);
    chartData = hourlyObs.map((row, i) => ({
      ...row,
      [`ly_${metric}`]: lyObs[i]?.[metric] ?? null,
    }));
  } else if (range === '7d') {
    const keys = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(today, -(6 - i))));
    chartData = keys.map((key, i) => {
      const row = mergeDay((historyDaily[key] ?? [])[0], units);
      if (!row) return null;
      if (showYoY) {
        const lyRow = mergeDay((historyDaily[lyDailyKeys[i]] ?? [])[0], units);
        if (metric === 'temp') {
          row.ly_tempHigh = lyRow?.tempHigh ?? null;
          row.ly_tempLow  = lyRow?.tempLow  ?? null;
        } else {
          row[`ly_${metric}`] = lyRow?.[metric] ?? null;
        }
      }
      return row;
    }).filter(Boolean);
  } else {
    const keys = Array.from({ length: 30 }, (_, i) => toDateStr(addDays(today, -(29 - i))));
    chartData = keys.map((key, i) => {
      const row = mergeDay((historyDaily[key] ?? [])[0], units);
      if (!row) return null;
      if (showYoY) {
        const lyRow = mergeDay((historyDaily[lyRainKeys[i]] ?? [])[0], units);
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

  const metaCurrent = METRICS.find(m => m.id === metric) ?? METRICS[0];
  const { domain } = metaCurrent;
  const digits = metricDigits(metric, units);
  const unit   = metricUnit(metric, units);

  const metricVals = chartData.map(r => r[metric]).filter(v => v != null);
  const showTempBand = metric === 'temp' && range !== '24h';
  const { high, low, avg } = showTempBand
    ? {
        high: stats(chartData.map(r => r.tempHigh).filter(v => v != null)).high,
        low:  stats(chartData.map(r => r.tempLow).filter(v => v != null)).low,
        avg:  stats(metricVals).avg,
      }
    : stats(metricVals);

  // Rainfall comparison card — current period total and LY equivalent
  const currentPrecipTotal = (() => {
    if (metric !== 'precip') return null;
    if (range === '24h') {
      const todayISO = toISODate(today);
      const todayObs = historyRecent.filter(o => o.obsTimeLocal?.startsWith(todayISO));
      const raw = todayObs.length ? Math.max(...todayObs.map(o => o.imperial?.precipTotal ?? 0)) : null;
      return convertPrecip(raw, units);
    }
    const count = range === '30d' ? 30 : 7;
    const keys = Array.from({ length: count }, (_, i) => toDateStr(addDays(today, -(count - 1 - i))));
    const raw = keys.reduce((sum, k) => sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0);
    return convertPrecip(raw, units);
  })();
  const lyPrecipLoaded = metric === 'precip' && lyRainKeys.every(k => historyDaily[k] !== undefined);
  const lyPrecipTotal  = lyPrecipLoaded
    ? convertPrecip(lyRainKeys.reduce((sum, k) => sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0), units)
    : null;

  // 30-day weekly bar groups (4 bars with MM/DD–MM/DD date-range labels)
  const [weeklyRainBars, weeklyRainLabels] = range === '30d' ? (() => {
    const keys30 = Array.from({ length: 30 }, (_, i) => toDateStr(addDays(today, -(29 - i))));
    const parseKey = k => new Date(`${k.slice(0,4)}-${k.slice(4,6)}-${k.slice(6,8)}T12:00:00`);
    const fmtMD = d => `${d.getMonth() + 1}/${d.getDate()}`;
    const groups = [[0, 7], [7, 14], [14, 21], [21, 30]];
    return [
      groups.map(([s, e]) =>
        convertPrecip(keys30.slice(s, e).reduce((sum, k) =>
          sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0), units)
      ),
      groups.map(([s, e]) =>
        `${fmtMD(parseKey(keys30[s]))}–${fmtMD(parseKey(keys30[e - 1]))}`
      ),
    ];
  })() : [null, []];

  // 7-day rainfall bar — real data from historyDaily, day-of-week labels
  const rainBars   = last7Keys.map(key => convertPrecip((historyDaily[key] ?? [])[0]?.imperial?.precipTotal ?? 0, units));
  const rainLabels = last7Keys.map(key => {
    const d = new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T12:00:00`);
    return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
  });

  const lyRainBars = showYoY && metric === 'precip' && range === '7d' && lyPrecipLoaded
    ? lyRainKeys.map(k => convertPrecip((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? null, units))
    : null;
  const weeklyLyRainBars = showYoY && metric === 'precip' && range === '30d' ? (() => {
    const groups = [[0, 7], [7, 14], [14, 21], [21, 30]];
    return groups.map(([s, e]) =>
      convertPrecip(lyRainKeys.slice(s, e).reduce((sum, k) =>
        sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0), units)
    );
  })() : null;

  const todaySum      = yoy.today;
  const lySum         = yoy.lastYear;
  const lyCurrentObs  = lyObsAtCurrentHour(yoy.lyRaw);
  const lyCurrentTemp = lyCurrentObs?.imperial?.tempAvg ?? lyCurrentObs?.imperial?.tempHigh ?? null;
  const forecastHighToday  = forecast?.[0]?.tempMax ?? null;
  const observedHighToday  = todaySum?.tempHigh ?? null;
  const highVals           = [observedHighToday, forecastHighToday].filter(v => v != null);
  const todayDisplayHigh   = highVals.length ? Math.max(...highVals) : null;
  const note = yoyInsight({
    currentTemp:   current?.temp,
    todayPrecip:   current?.precipTotal,
    lyHourlyObs:   yoy.lyRaw,
    lyDailyHigh:   lySum?.tempHigh,
    lyDailyPrecip: lySum?.precipTotal,
    forecastHigh:  forecastHighToday,
    todayHigh:     todaySum?.tempHigh,
    units,
  });
  const hasYoy = todaySum || lySum;

  return (
    <div>
      {/* YoY comparison card */}
      {hasYoy && (
        <div className="y-card" style={{ marginBottom: 12 }}>
          <div className="y-label">Today vs. One Year Ago</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <DeltaCell label="Current"  thisVal={current?.temp}        lastVal={lyCurrentTemp}      kind="temp"   units={units} />
            <DeltaCell label="High"     thisVal={todayDisplayHigh}     lastVal={lySum?.tempHigh}    kind="temp"   units={units} />
            <DeltaCell label="Low"      thisVal={todaySum?.tempLow}    lastVal={lySum?.tempLow}     kind="temp"   units={units} />
            <DeltaCell label="Rainfall" thisVal={current?.precipTotal} lastVal={lySum?.precipTotal} kind="precip" units={units} />
          </div>
          {note && (
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--ts)', fontStyle: 'italic',
              fontFamily: 'var(--font-display)',
            }}>
              "{note}"
            </div>
          )}
        </div>
      )}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 12, marginTop: 4 }}>
        Historical Trends
      </div>

      {/* Range pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {RANGES.map(r => (
          <button key={r.id} className={`y-pill${range === r.id ? ' active' : ''}`} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Metric selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {METRICS.map(m => (
          <button key={m.id} className={`y-msel${metric === m.id ? ' active' : ''}`} onClick={() => setMetric(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Main chart card */}
      <div className="y-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--tm)', fontWeight: 500 }}>
            {metaCurrent.label} · {RANGES.find(r => r.id === range)?.label}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--ts)', cursor: 'pointer' }}>
            <span>vs last year</span>
            <span style={{ position: 'relative', width: 34, height: 19, display: 'inline-block' }}>
              <input type="checkbox" checked={showYoY} onChange={e => setShowYoY(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
              <span style={{
                position: 'absolute', inset: 0,
                background: showYoY ? 'var(--accent)' : 'var(--border)',
                borderRadius: 50, transition: 'background 0.3s',
              }} />
              <span style={{
                position: 'absolute', top: 3, left: 3, width: 13, height: 13,
                background: 'var(--bg)', borderRadius: '50%',
                transform: showYoY ? 'translateX(15px)' : 'translateX(0)',
                transition: 'transform 0.3s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </span>
          </label>
        </div>

        {showTempBand ? (
          <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--tm)', marginBottom: 8, flexWrap: 'wrap' }}>
            <span>
              <span style={{ display: 'inline-block', width: 18, height: 2, verticalAlign: 'middle', marginRight: 4, borderRadius: 1, background: chartColors.tempHigh }} />
              High
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 18, height: 2, verticalAlign: 'middle', marginRight: 4, borderRadius: 1, background: chartColors.tempLow }} />
              Low
            </span>
            {showYoY && (
              <>
                <span>
                  <span style={{ display: 'inline-block', width: 18, verticalAlign: 'middle', marginRight: 4, borderTop: `2px dashed ${chartColors.tempHigh}` }} />
                  Last yr high
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 18, verticalAlign: 'middle', marginRight: 4, borderTop: `2px dashed ${chartColors.tempLow}` }} />
                  Last yr low
                </span>
              </>
            )}
          </div>
        ) : showYoY && metric !== 'precip' ? (
          <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--tm)', marginBottom: 8 }}>
            <span>
              <span style={{ display: 'inline-block', width: 18, height: 2, verticalAlign: 'middle', marginRight: 4, borderRadius: 1, background: chartColors.accent }} />
              This year
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 18, verticalAlign: 'middle', marginRight: 4, borderTop: `2px dashed ${chartColors.yoy}` }} />
              Last year
            </span>
          </div>
        ) : showYoY && metric === 'precip' ? (
          <div style={{ display: 'flex', gap: 14, fontSize: 10, color: 'var(--tm)', marginBottom: 8 }}>
            <span>
              <span style={{ display: 'inline-block', width: 10, height: 10, verticalAlign: 'middle', marginRight: 4, borderRadius: 2, background: chartColors.accent, opacity: 0.85 }} />
              This year
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 14, height: 10, verticalAlign: 'middle', marginRight: 4, borderRadius: 2, background: chartColors.yoy, opacity: 0.3 }} />
              Last year
            </span>
          </div>
        ) : null}

        {loading ? (
          <div style={{
            height: 160, borderRadius: 12,
            background: 'var(--border)',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        ) : chartData.length === 0 ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tm)', fontSize: 12 }}>
            No data available
          </div>
        ) : metric === 'precip' && range !== '24h' ? (
          <BarChart
            values={range === '7d' ? rainBars : weeklyRainBars}
            labels={range === '7d' ? rainLabels : weeklyRainLabels}
            lyValues={range === '7d' ? lyRainBars : weeklyLyRainBars}
            height={160}
            units={units}
          />
        ) : (
          <ResponsiveContainer width="100%" height={160} role="img" aria-label={`${metaCurrent.label} chart for the past ${RANGES.find(r => r.id === range)?.label}`}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={`${chartColors.accent}22`} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: chartColors.accent, fontFamily: 'monospace' }}
                interval="preserveStartEnd" tickLine={false} tickFormatter={range === '24h' ? fmtTimeTick : undefined} />
              <YAxis domain={domain} tick={{ fontSize: 9, fill: chartColors.accent, fontFamily: 'monospace' }}
                tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {showYoY && showTempBand ? (
                <>
                  <Line type="monotone" dataKey="ly_tempHigh" name="Last yr high"
                    stroke={chartColors.tempHigh} strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls />
                  <Line type="monotone" dataKey="ly_tempLow" name="Last yr low"
                    stroke={chartColors.tempLow} strokeWidth={1.5} strokeDasharray="6 3"
                    dot={false} connectNulls />
                </>
              ) : showYoY ? (
                <Line type="monotone" dataKey={`ly_${metric}`} name="Last year"
                  stroke={chartColors.yoy} strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false} connectNulls />
              ) : null}
              {metric === 'temp' && range !== '24h' ? (
                <>
                  <Line type="monotone" dataKey="tempHigh" name="High"
                    stroke={chartColors.tempHigh} strokeWidth={2}
                    dot={false} connectNulls />
                  <Line type="monotone" dataKey="tempLow" name="Low"
                    stroke={chartColors.tempLow} strokeWidth={2}
                    dot={false} connectNulls />
                </>
              ) : (
                <Line type="monotone" dataKey={metric} name={range === '24h' ? 'This year' : metaCurrent.label}
                  stroke={chartColors.accent} strokeWidth={2}
                  dot={false} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats row */}
      {metric !== 'precip' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {[{ label: 'High', val: high }, { label: 'Low', val: low }, { label: 'Avg', val: avg }].map(({ label, val }) => (
            <div key={label} className="y-stat">
              <div style={{ fontSize: 9, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {val != null ? `${val.toFixed(digits)}${unit}` : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rainfall summary card — range-aware, with LY comparison */}
      {metric === 'precip' && (
        <RainfallSummaryCard
          range={range}
          currentTotal={currentPrecipTotal}
          lyTotal={lyPrecipTotal}
          units={units}
        />
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        PWS Daily Summary · Historical API
      </div>
    </div>
  );
}
