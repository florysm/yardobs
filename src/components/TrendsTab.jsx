import { useState, useEffect, useCallback } from 'react';
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

export default function TrendsTab({ stationId, fetchHistory, history, fetchHistoryDaily, historyDaily, chartColors }) {
  const [range,   setRange]   = useState('24h');
  const [metric,  setMetric]  = useState('temp');
  const [showYoY, setShowYoY] = useState(false);
  const [loading, setLoading] = useState(false);

  const today          = new Date();
  const todayKey       = toDateStr(today);
  const yesterdayKey   = toDateStr(addDays(today, -1));
  const lyKey          = toDateStr(addDays(today, -365));
  const lyYesterdayKey = toDateStr(addDays(today, -366));

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
      tasks = [ensureFetched(todayKey), ensureFetched(yesterdayKey)];
      if (showYoY) tasks.push(ensureFetched(lyKey), ensureFetched(lyYesterdayKey));
    } else {
      const count = range === '30d' ? 30 : 7;
      const keys = Array.from({ length: count }, (_, i) =>
        toDateStr(addDays(new Date(), -(count - 1 - i)))
      );
      tasks = keys.map(k => fetchHistoryDaily(k));
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [stationId, range, todayKey, yesterdayKey, lyKey, lyYesterdayKey, showYoY, ensureFetched, fetchHistoryDaily]);

  // Build chart data based on selected range
  let chartData;
  if (range === '24h') {
    const hourlyObs = [
      ...mergeHourly(history[yesterdayKey] ?? []),
      ...mergeHourly(history[todayKey]     ?? []),
    ].slice(-24);
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

  // 7-day rainfall bar — real data from historyDaily, day-of-week labels
  const rainBars   = last7Keys.map(key => (historyDaily[key] ?? [])[0]?.imperial?.precipTotal ?? 0);
  const rainLabels = last7Keys.map(key => {
    const d = new Date(`${key.slice(0,4)}-${key.slice(4,6)}-${key.slice(6,8)}T12:00:00`);
    return ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
  });

  return (
    <div>
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
                  background: '#fff', borderRadius: '50%',
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
                interval="preserveStartEnd" tickLine={false} />
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

      {/* 7-Day rainfall — only shown when Rainfall metric is active */}
      {metric === 'precip' && (
        <div className="y-card">
          <div className="y-label">7-Day Rainfall</div>
          <BarChart values={rainBars} labels={rainLabels} />
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        PWS Daily Summary · Historical API
      </div>
    </div>
  );
}
