import { useEffect, useRef, useState } from 'react';
import { toDateStr } from '../hooks/useWeather';

function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

function beaufort(mph) {
  if (mph == null) return '—';
  const thresholds = [1,4,8,13,19,25,32,39,47,55,64,73];
  const names = ['Calm','Light Air','Light Breeze','Gentle Breeze','Moderate Breeze',
    'Fresh Breeze','Strong Breeze','Near Gale','Gale','Severe Gale','Storm','Violent Storm','Hurricane'];
  const scale = thresholds.findIndex(v => mph < v);
  const n = scale === -1 ? 12 : scale;
  return `${n} · ${names[n]}`;
}

function degreesToCompass(deg) {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// SVG compass matching the prototype exactly
function WindCompass({ degrees, speed, gust }) {
  const deg = degrees ?? 225; // SW default for demo
  const rad = deg * (Math.PI / 180);
  const endX = 45 + 26 * Math.sin(rad);
  const endY = 45 - 26 * Math.cos(rad);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 20, padding: '8px 0' }}>
      <svg width="90" height="90" viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
        <circle cx="45" cy="45" r="40" fill="none" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx="45" cy="45" r="32" fill="var(--glass)" />
        <text x="45" y="12" textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="monospace" fontWeight="bold">N</text>
        <text x="45" y="84" textAnchor="middle" fontSize="9" fill="var(--tm)"     fontFamily="monospace">S</text>
        <text x="82" y="49" textAnchor="middle" fontSize="9" fill="var(--tm)"     fontFamily="monospace">E</text>
        <text x="8"  y="49" textAnchor="middle" fontSize="9" fill="var(--tm)"     fontFamily="monospace">W</text>
        {degrees != null && (
          <>
            <line x1="45" y1="45" x2={endX} y2={endY}
              stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
            <polygon
              points={`${endX},${endY} ${endX - 5*Math.cos(rad) - 3*Math.sin(rad)},${endY + 5*Math.sin(rad) - 3*Math.cos(rad)} ${endX - 5*Math.cos(rad) + 3*Math.sin(rad)},${endY + 5*Math.sin(rad) + 3*Math.cos(rad)}`}
              fill="var(--accent)"
            />
            <circle cx="45" cy="45" r="3" fill="var(--accent)" />
          </>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          ['Direction', degreesToCompass(degrees)],
          ['Speed',     speed != null ? `${fmt(speed)} mph` : '—'],
          ['Gust',      gust  != null ? `${fmt(gust)} mph`  : '—'],
          ['Beaufort',  beaufort(speed)],
        ].map(([label, val]) => (
          <div key={label} style={{ fontSize: 12, color: 'var(--ts)' }}>
            {label}: <strong style={{ color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>{val}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, unit, trend }) {
  return (
    <div className="y-metric">
      <div style={{ fontSize: 18, marginBottom: 6 }} aria-hidden="true">{icon}</div>
      <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--tp)', marginTop: 2 }}>
        {value}<span style={{ fontSize: 11, color: 'var(--tm)' }}>{unit}</span>
      </div>
      {trend && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 4 }}>{trend}</div>}
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

export default function NowTab({ current, isLoading, stationId, fetchHistory, history, forecast }) {
  const fetched = useRef(false);
  const [yoy, setYoy] = useState({ today: null, lastYear: null, lyRaw: [] });

  useEffect(() => {
    if (fetched.current || !stationId) return;
    fetched.current = true;
    const todayKey = toDateStr(new Date());
    const lyDate = new Date(); lyDate.setFullYear(lyDate.getFullYear() - 1);
    const lyKey = toDateStr(lyDate);
    Promise.all([fetchHistory(todayKey), fetchHistory(lyKey)])
      .then(([t, l]) => setYoy({ today: summarize(t), lastYear: summarize(l), lyRaw: l ?? [] }));
  }, [stationId, fetchHistory]);

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0,1,2,3].map(i => (
          <div key={i} className="y-metric" style={{ height: 96, opacity: 0.4, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  const todaySum     = yoy.today;
  const lySum        = yoy.lastYear;
  const lyCurrentObs = lyObsAtCurrentHour(yoy.lyRaw);
  const lyCurrentTemp = lyCurrentObs?.imperial?.tempAvg ?? lyCurrentObs?.imperial?.tempHigh ?? null;
  const note      = yoyInsight({
    currentTemp:   current?.temp,
    todayPrecip:   current?.precipTotal,
    lyHourlyObs:   yoy.lyRaw,
    lyDailyHigh:   lySum?.tempHigh,
    lyDailyPrecip: lySum?.precipTotal,
    forecastHigh:  forecast?.temperatureMax?.[0],
    todayHigh:     todaySum?.tempHigh,
  });
  const hasYoy    = todaySum || lySum;

  const forecastHighToday = forecast?.temperatureMax?.[0] ?? null;
  const observedHighToday = todaySum?.tempHigh ?? null;
  const highVals = [observedHighToday, forecastHighToday].filter(v => v != null);
  const todayDisplayHigh = highVals.length ? Math.max(...highVals) : null;

  return (
    <div>
      {/* 4-metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <MetricCard icon="🌡️" label="Dew Point"   value={fmt(current?.dewPoint)} unit="°F" />
        <MetricCard icon="💨" label="Wind Gust"   value={fmt(current?.windGust)} unit=" mph" trend={current?.windDir != null ? `${degreesToCompass(current.windDir)} · variable` : undefined} />
        <MetricCard icon="☀️" label="UV Index"    value={fmt(current?.uv)}       unit=" idx" />
        <MetricCard icon="🌧️" label="Rain Rate"   value={fmt(current?.precipRate, 2)} unit='"' trend={current?.precipTotal != null ? `${fmt(current.precipTotal, 2)}" today` : undefined} />
      </div>

      {/* YoY card */}
      {hasYoy && (
        <div className="y-card">
          <div className="y-label">Today vs. One Year Ago</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            <DeltaCell label="Current"  thisVal={current?.temp}         lastVal={lyCurrentTemp}      unit="°F" />
            <DeltaCell label="High"     thisVal={todayDisplayHigh}      lastVal={lySum?.tempHigh}    unit="°F" />
            <DeltaCell label="Low"      thisVal={todaySum?.tempLow}     lastVal={lySum?.tempLow}     unit="°F" />
            <DeltaCell label="Rainfall" thisVal={current?.precipTotal}  lastVal={lySum?.precipTotal} unit='"'  digits={2} />
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

      {/* Wind compass card */}
      <div className="y-card">
        <div className="y-label">Wind Direction</div>
        <WindCompass degrees={current?.windDir} speed={current?.windSpeed} gust={current?.windGust} />
      </div>

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        {stationId} · PWS Observations API
      </div>
    </div>
  );
}
