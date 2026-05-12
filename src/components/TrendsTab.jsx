import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { toDateStr } from '../hooks/useWeather';

const RANGES = [
  { id: '24h', label: '24h' },
  { id: '7d',  label: '7 Day' },
  { id: '30d', label: '30 Day' },
];

const METRICS = [
  { id: 'temp',     label: 'Temperature', unit: '°F',    digits: 0, domain: ['auto','auto'] },
  { id: 'humidity', label: 'Humidity',    unit: '%',     digits: 0, domain: [0, 100] },
  { id: 'pressure', label: 'Pressure',    unit: ' inHg', digits: 2, domain: ['auto','auto'] },
  { id: 'precip',   label: 'Rainfall',    unit: '"',     digits: 2, domain: [0,'auto'] },
];

function fmtTimeTick(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const rounded = m >= 30 ? (h + 1) % 24 : h;
  if (rounded === 0)  return '12am';
  if (rounded < 12)   return `${rounded}am`;
  if (rounded === 12) return '12pm';
  return `${rounded - 12}pm`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Hourly history fields: tempAvg/humidityAvg/pressureMax (not temp/humidity/pressure)
function mergeHourly(obs = []) {
  return obs.map(o => ({
    time:     o.obsTimeLocal?.slice(11, 16) ?? '',
    temp:     o.imperial?.tempAvg     ?? null,
    humidity: o.humidityAvg           ?? null,
    pressure: o.imperial?.pressureMax ?? null,
    precip:   o.imperial?.precipTotal ?? null,
  }));
}

// Daily summary — one observation object → one chart row
function mergeDay(o) {
  if (!o) return null;
  return {
    time:     o.obsTimeLocal?.slice(5, 10) ?? '',
    temp:     o.imperial?.tempAvg     ?? null,
    humidity: o.humidityAvg           ?? null,
    pressure: o.imperial?.pressureMax ?? null,
    precip:   o.imperial?.precipTotal ?? null,
  };
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

function BarChart({ values, labels }) {
  const max = Math.max(...values, 0.01);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 70, margin: '10px 0 6px' }}>
      {values.map((v, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ fontSize: 8, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
            {v > 0 ? `${Number(v).toFixed(2)}"` : ''}
          </div>
          <div style={{
            width: '100%', borderRadius: '4px 4px 0 0',
            background: 'var(--bar)', opacity: 0.85,
            height: Math.max((v / max) * 50, v > 0 ? 4 : 1),
            minHeight: 1, transition: 'height 0.4s',
          }} />
          <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

function RainfallSummaryCard({ range, currentTotal, lyTotal, bars, labels }) {
  const delta = currentTotal != null && lyTotal != null ? currentTotal - lyTotal : null;
  const sign  = delta != null && delta >= 0 ? '+' : '';
  const deltaColor = delta == null ? 'var(--tm)'
    : delta >  0.01 ? 'var(--delta-up)'
    : delta < -0.01 ? 'var(--delta-dn)'
    : 'var(--tm)';
  const title = range === '24h' ? "Today's Rainfall"
              : range === '7d'  ? '7-Day Rainfall'
              :                   '30-Day Rainfall';
  return (
    <div className="y-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: bars ? 4 : 0 }}>
        <div className="y-label">{title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--tp)', fontWeight: 500 }}>
            {currentTotal != null ? `${currentTotal.toFixed(2)}"` : '—'}
          </span>
          {lyTotal != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tm)' }}>
              LY: {lyTotal.toFixed(2)}"
            </span>
          )}
          {delta != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: deltaColor }}>
              {sign}{delta.toFixed(2)}"
            </span>
          )}
        </div>
      </div>
      {bars && <BarChart values={bars} labels={labels} />}
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

function DeltaCell({ label, thisVal, lastVal, unit, digits = 0 }) {
  const factor = Math.pow(10, digits);
  const rThis  = thisVal != null ? Math.round(thisVal * factor) / factor : null;
  const rLast  = lastVal != null ? Math.round(lastVal * factor) / factor : null;
  const delta  = rThis != null && rLast != null ? rThis - rLast : null;
  const sign   = delta != null && delta >= 0 ? '+' : '';
  const color = delta == null ? 'var(--tm)' : delta > 0.05 ? 'var(--delta-up)' : delta < -0.05 ? 'var(--delta-dn)' : 'var(--tm)';
  return (
    <div style={{ textAlign: 'center', padding: '6px 4px' }}>
      <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--tp)', marginTop: 3, fontWeight: 500 }}>
        {thisVal != null ? `${Number(thisVal).toFixed(digits)}${unit}` : '—'}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tm)', marginTop: 1 }}>
        {lastVal != null ? `LY: ${Number(lastVal).toFixed(digits)}${unit}` : ''}
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

function yoyInsight({ currentTemp, todayPrecip, lyHourlyObs, lyDailyHigh, lyDailyPrecip, forecastHigh, todayHigh }) {
  const hour = new Date().getHours();
  const phase = dayPhase(hour);
  const lyObs = lyObsAtCurrentHour(lyHourlyObs);
  const lyHourTemp = lyObs?.imperial?.tempAvg ?? lyObs?.imperial?.tempHigh ?? null;
  const lyHourPrecip = lyObs?.imperial?.precipTotal ?? null;
  const dateStr = new Date().toLocaleDateString([], { month: 'long', day: 'numeric' });

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
    if (todayP >= 0.1 && lyP >= 0.1) precipClause = `${todayP.toFixed(2)}" of rain so far vs ${lyP.toFixed(2)}" last year at this time.`;
    else if (todayP >= 0.1) precipClause = `${todayP.toFixed(2)}" of rain already; last year was dry at this hour.`;
    else if (lyP >= 0.1) precipClause = `Dry so far, but last year had ${lyP.toFixed(2)}" by this time.`;

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
    if (todayP >= 0.1 && lyP >= 0.1) precipClause = `${todayP.toFixed(2)}" of rain so far vs ${lyP.toFixed(2)}" last year by now.`;
    else if (todayP >= 0.1) precipClause = `${todayP.toFixed(2)}" of rain already; last year was dry at this point.`;
    else if (lyP >= 0.1) precipClause = `Dry so far; last year had ${lyP.toFixed(2)}" by now.`;

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
    if (todayP >= 0.1 && lyP >= 0.1) precipClause = `${todayP.toFixed(2)}" of rain vs ${lyP.toFixed(2)}" last year by now.`;
    else if (todayP >= 0.1) precipClause = `${todayP.toFixed(2)}" of rain so far; last year was dry at this point.`;
    else if (lyP >= 0.1) precipClause = `Dry so far; last year had ${lyP.toFixed(2)}" by now.`;

  } else {
    const high = todayHigh ?? currentTemp;
    if (high == null || lyDailyHigh == null) return null;
    const dir = high >= lyDailyHigh ? 'Warmer' : 'Cooler';
    lead = `${dir} day than last year: peaked at ${Math.round(high)}° vs ${Math.round(lyDailyHigh)}° last ${dateStr}.`;
    const todayP = todayPrecip ?? 0;
    const lyP = lyDailyPrecip ?? 0;
    if (todayP >= 0.1 || lyP >= 0.1) {
      const rainDir = todayP >= lyP ? 'wetter' : 'drier';
      precipClause = `Also ${rainDir} — ${todayP.toFixed(2)}" vs ${lyP.toFixed(2)}" last year.`;
    }
  }

  if (!lead) return null;
  return precipClause ? `${lead} ${precipClause}` : lead;
}

export default function TrendsTab({ stationId, current, forecast, fetchHistory, history, fetchHistoryRecent, historyRecent, fetchHistoryDaily, historyDaily, chartColors }) {
  const [range,   setRange]   = useState('24h');
  const [metric,  setMetric]  = useState('temp');
  const [showYoY, setShowYoY] = useState(false);
  const [loading, setLoading] = useState(false);

  const yoyFetched = useRef(false);
  const [yoy, setYoy] = useState({ today: null, lastYear: null, lyRaw: [] });

  useEffect(() => {
    if (yoyFetched.current || !stationId) return;
    yoyFetched.current = true;
    const todayKey = toDateStr(new Date());
    const lyDate = new Date(); lyDate.setFullYear(lyDate.getFullYear() - 1);
    const lyKey = toDateStr(lyDate);
    Promise.all([fetchHistory(todayKey), fetchHistory(lyKey)])
      .then(([t, l]) => setYoy({ today: summarize(t), lastYear: summarize(l), lyRaw: l ?? [] }));
  }, [stationId, fetchHistory]);

  const today          = new Date();
  const lyKey          = toDateStr(addDays(today, -365));
  const lyYesterdayKey = toDateStr(addDays(today, -366));

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
    const hourlyObs = mergeHourly(historyRecent).slice(-24);
    const lyObs = [
      ...mergeHourly(history[lyYesterdayKey] ?? []),
      ...mergeHourly(history[lyKey]          ?? []),
    ].slice(-24);
    chartData = hourlyObs.map((row, i) => ({
      ...row,
      [`ly_${metric}`]: lyObs[i]?.[metric] ?? null,
    }));
  } else {
    const count = range === '30d' ? 30 : 7;
    const keys  = Array.from({ length: count }, (_, i) =>
      toDateStr(addDays(today, -(count - 1 - i)))
    );
    chartData = keys
      .map(key => mergeDay((historyDaily[key] ?? [])[0]))
      .filter(Boolean);
  }

  const metaCurrent = METRICS.find(m => m.id === metric) ?? METRICS[0];
  const { digits, unit, domain } = metaCurrent;

  const metricVals = chartData.map(r => r[metric]).filter(v => v != null);
  const { high, low, avg } = stats(metricVals);

  // Rainfall comparison card — current period total and LY equivalent
  const currentPrecipTotal = (() => {
    if (metric !== 'precip') return null;
    if (range === '24h') {
      const todayISO = today.toISOString().split('T')[0];
      const todayObs = historyRecent.filter(o => o.obsTimeLocal?.startsWith(todayISO));
      return todayObs.length ? Math.max(...todayObs.map(o => o.imperial?.precipTotal ?? 0)) : null;
    }
    const count = range === '30d' ? 30 : 7;
    const keys = Array.from({ length: count }, (_, i) => toDateStr(addDays(today, -(count - 1 - i))));
    return keys.reduce((sum, k) => sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0);
  })();
  const lyPrecipLoaded = metric === 'precip' && lyRainKeys.every(k => historyDaily[k] !== undefined);
  const lyPrecipTotal  = lyPrecipLoaded
    ? lyRainKeys.reduce((sum, k) => sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0)
    : null;

  // 30-day weekly bar groups (4 bars with MM/DD–MM/DD date-range labels)
  const [weeklyRainBars, weeklyRainLabels] = range === '30d' ? (() => {
    const keys30 = Array.from({ length: 30 }, (_, i) => toDateStr(addDays(today, -(29 - i))));
    const parseKey = k => new Date(`${k.slice(0,4)}-${k.slice(4,6)}-${k.slice(6,8)}T12:00:00`);
    const fmtMD = d => `${d.getMonth() + 1}/${d.getDate()}`;
    const groups = [[0, 7], [7, 14], [14, 21], [21, 30]];
    return [
      groups.map(([s, e]) =>
        keys30.slice(s, e).reduce((sum, k) =>
          sum + ((historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0), 0)
      ),
      groups.map(([s, e]) =>
        `${fmtMD(parseKey(keys30[s]))}–${fmtMD(parseKey(keys30[e - 1]))}`
      ),
    ];
  })() : [null, []];

  // 7-day rainfall bar — real data from historyDaily, day-of-week labels
  const rainBars   = last7Keys.map(key => (historyDaily[key] ?? [])[0]?.imperial?.precipTotal ?? 0);
  const rainLabels = last7Keys.map(key => {
    const d = new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T12:00:00`);
    return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
  });

  const todaySum      = yoy.today;
  const lySum         = yoy.lastYear;
  const lyCurrentObs  = lyObsAtCurrentHour(yoy.lyRaw);
  const lyCurrentTemp = lyCurrentObs?.imperial?.tempAvg ?? lyCurrentObs?.imperial?.tempHigh ?? null;
  const forecastHighToday  = forecast?.temperatureMax?.[0] ?? null;
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
  });
  const hasYoy = todaySum || lySum;

  return (
    <div>
      {/* YoY comparison card */}
      {hasYoy && (
        <div className="y-card" style={{ marginBottom: 12 }}>
          <div className="y-label">Today vs. One Year Ago</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <DeltaCell label="Current"  thisVal={current?.temp}        lastVal={lyCurrentTemp}      unit="°F" />
            <DeltaCell label="High"     thisVal={todayDisplayHigh}     lastVal={lySum?.tempHigh}    unit="°F" />
            <DeltaCell label="Low"      thisVal={todaySum?.tempLow}    lastVal={lySum?.tempLow}     unit="°F" />
            <DeltaCell label="Rainfall" thisVal={current?.precipTotal} lastVal={lySum?.precipTotal} unit='"'  digits={2} />
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
          {/* YoY toggle only makes sense for 24h (single-day comparison) */}
          {range === '24h' && (
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
          )}
        </div>

        {showYoY && range === '24h' && (
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
        )}

        {loading ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tm)', fontSize: 12 }}>
            Loading…
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tm)', fontSize: 12 }}>
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={`${chartColors.accent}22`} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: chartColors.accent, fontFamily: 'monospace' }}
                interval="preserveStartEnd" tickLine={false} tickFormatter={range === '24h' ? fmtTimeTick : undefined} />
              <YAxis domain={domain} tick={{ fontSize: 9, fill: chartColors.accent, fontFamily: 'monospace' }}
                tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {showYoY && range === '24h' && (
                <Line type="monotone" dataKey={`ly_${metric}`} name="Last year"
                  stroke={chartColors.yoy} strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false} connectNulls />
              )}
              <Line type="monotone" dataKey={metric} name="This year"
                stroke={chartColors.accent} strokeWidth={2}
                dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'High', val: high },
          { label: 'Low',  val: low  },
          { label: 'Avg',  val: avg  },
        ].map(({ label, val }) => (
          <div key={label} className="y-stat">
            <div style={{ fontSize: 9, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {val != null ? `${val.toFixed(digits)}${unit}` : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Rainfall summary card — range-aware, with LY comparison */}
      {metric === 'precip' && (
        <RainfallSummaryCard
          range={range}
          currentTotal={currentPrecipTotal}
          lyTotal={lyPrecipTotal}
          bars={range === '7d' ? rainBars : range === '30d' ? weeklyRainBars : null}
          labels={range === '7d' ? rainLabels : range === '30d' ? weeklyRainLabels : null}
        />
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        PWS Daily Summary · Historical API
      </div>
    </div>
  );
}
