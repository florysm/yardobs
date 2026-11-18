import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fmtTimeTick } from '../utils/format';
import {
  UNITS, convertTemp, convertPrecip, tempUnitLabel, precipDigits, precipUnitLabel, formatPrecipValue,
} from '../utils/units';
import { todayHigh } from '../utils/weatherCalc';
import { yoyInsight, lyObsAtHour } from '../utils/yoyInsight';
import {
  stats, buildHourlyRows, buildDailyRows, dayPrecip, sumPrecip, weeklyGroups, weekdayLabel,
  todayPrecipFromRecent,
} from '../utils/trends';
import { useTrendsData } from '../hooks/useTrendsData';

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
  if (id === 'precip')   return precipUnitLabel(units);
  if (id === 'pressure') return units === UNITS.METRIC ? ' hPa' : ' inHg';
  return '%';
}

function metricDigits(id, units) {
  if (id === 'precip')   return precipDigits(units);
  if (id === 'pressure') return units === UNITS.METRIC ? 0 : 2;
  return 0;
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
  const label = v => formatPrecipValue(v, units, { spaced: false });

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
                  {label(v)}
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
                    {label(ly ?? 0)}
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
  return (
    <div className="y-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="y-label">{title}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--tp)', fontWeight: 500 }}>
            {formatPrecipValue(currentTotal, units)}
          </span>
          {lyTotal != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tm)' }}>
              LY: {formatPrecipValue(lyTotal, units)}
            </span>
          )}
          {delta != null && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500, color: deltaColor }}>
              {sign}{formatPrecipValue(delta, units)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// thisVal/lastVal are always raw imperial (from `current`/summarize()); this
// component converts to display units itself so callers don't need to.
function DeltaCell({ label, thisVal, lastVal, kind, units }) {
  const convert = kind === 'precip' ? convertPrecip : convertTemp;
  const digits  = kind === 'precip' ? precipDigits(units) : 0;
  const unit    = kind === 'precip' ? precipUnitLabel(units) : tempUnitLabel(units);
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

export default function TrendsTab({ stationId, current, forecast, fetchHistory, history, fetchHistoryRecent, historyRecent, fetchHistoryDaily, historyDaily, chartColors, units }) {
  const [range,   setRange]   = useState('24h');
  const [metric,  setMetric]  = useState('temp');
  const [showYoY, setShowYoY] = useState(false);

  useEffect(() => { setShowYoY(false); }, [metric, range]);

  const { loading, yoy, keys } = useTrendsData({
    stationId, range, metric, showYoY, fetchHistory, fetchHistoryRecent, fetchHistoryDaily,
  });
  const { today, rangeKeys, lyRangeKeys, last7, lyRainKeys } = keys;

  const chartData = range === '24h'
    ? buildHourlyRows({ historyRecent, history, metric, units, today })
    : buildDailyRows({ historyDaily, keys: rangeKeys, lyKeys: lyRangeKeys, metric, showYoY, units });

  const metaCurrent = METRICS.find(m => m.id === metric) ?? METRICS[0];
  const { domain } = metaCurrent;
  const digits = metricDigits(metric, units);
  const unit   = metricUnit(metric, units);

  const metricVals = chartData.map(r => r[metric]).filter(v => v != null);
  const showTempBand = metric === 'temp' && range !== '24h';
  const { high, low, avg } = showTempBand
    ? {
        high: stats(chartData.map(r => r.tempHigh)).high,
        low:  stats(chartData.map(r => r.tempLow)).low,
        avg:  stats(metricVals).avg,
      }
    : stats(metricVals);

  // Rainfall: period total and last year's, plus the bar charts (display units).
  const isPrecip = metric === 'precip';
  const toDisplay = raw => convertPrecip(raw, units);
  const currentPrecipTotal = isPrecip
    ? toDisplay(range === '24h' ? todayPrecipFromRecent(historyRecent, today) : sumPrecip(historyDaily, rangeKeys))
    : null;
  const lyPrecipLoaded = isPrecip && lyRainKeys.every(k => historyDaily[k] !== undefined);
  const lyPrecipTotal  = lyPrecipLoaded ? toDisplay(sumPrecip(historyDaily, lyRainKeys)) : null;

  const rainBars   = last7.map(k => toDisplay(dayPrecip(historyDaily, k) ?? 0));
  const rainLabels = last7.map(weekdayLabel);
  const weeks      = range === '30d' ? weeklyGroups(rangeKeys) : [];
  const weeklyRainBars   = weeks.map(g => toDisplay(sumPrecip(historyDaily, g.keys)));
  const weeklyRainLabels = weeks.map(g => g.label);

  const showLyBars = showYoY && isPrecip;
  const lyRainBars = showLyBars && range === '7d' && lyPrecipLoaded
    ? lyRainKeys.map(k => toDisplay(dayPrecip(historyDaily, k)))
    : null;
  const weeklyLyRainBars = showLyBars && range === '30d'
    ? weeklyGroups(lyRangeKeys).map(g => toDisplay(sumPrecip(historyDaily, g.keys)))
    : null;

  // "Today vs. One Year Ago" card.
  const now           = new Date();
  const todaySum      = yoy.today;
  const lySum         = yoy.lastYear;
  const lyCurrentObs  = lyObsAtHour(yoy.lyRaw, now.getHours());
  const lyCurrentTemp = lyCurrentObs?.imperial?.tempAvg ?? lyCurrentObs?.imperial?.tempHigh ?? null;
  const forecastHighToday = forecast?.[0]?.tempMax ?? null;
  const todayDisplayHigh  = todayHigh(forecastHighToday, todaySum?.tempHigh, current?.temp);
  const note = yoyInsight({
    currentTemp:   current?.temp,
    todayPrecip:   current?.precipTotal,
    lyHourlyObs:   yoy.lyRaw,
    lyDailyHigh:   lySum?.tempHigh,
    lyDailyPrecip: lySum?.precipTotal,
    forecastHigh:  forecastHighToday,
    todayHigh:     todaySum?.tempHigh,
    units,
    now,
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
              {/* Multi-line groups are keyed arrays, never <>…</> fragments: Recharts 2
                  finds its children with react-is@18, whose isFragment() can't recognise
                  React 19 elements, so Lines wrapped in a fragment are silently dropped. */}
              {showYoY && showTempBand ? [
                <Line key="ly_tempHigh" type="monotone" dataKey="ly_tempHigh" name="Last yr high"
                  stroke={chartColors.tempHigh} strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false} connectNulls />,
                <Line key="ly_tempLow" type="monotone" dataKey="ly_tempLow" name="Last yr low"
                  stroke={chartColors.tempLow} strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false} connectNulls />,
              ] : showYoY ? (
                <Line type="monotone" dataKey={`ly_${metric}`} name="Last year"
                  stroke={chartColors.yoy} strokeWidth={1.5} strokeDasharray="6 3"
                  dot={false} connectNulls />
              ) : null}
              {metric === 'temp' && range !== '24h' ? [
                <Line key="tempHigh" type="monotone" dataKey="tempHigh" name="High"
                  stroke={chartColors.tempHigh} strokeWidth={2}
                  dot={false} connectNulls />,
                <Line key="tempLow" type="monotone" dataKey="tempLow" name="Low"
                  stroke={chartColors.tempLow} strokeWidth={2}
                  dot={false} connectNulls />,
              ] : (
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
