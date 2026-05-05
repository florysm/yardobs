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
  const temps   = obs.map(o => o.imperial?.temp).filter(v => v != null);
  const precips = obs.map(o => o.imperial?.precipTotal).filter(v => v != null);
  return {
    tempHigh:     temps.length   ? Math.max(...temps)   : null,
    tempLow:      temps.length   ? Math.min(...temps)   : null,
    precipTotal:  precips.length ? Math.max(...precips) : null,
  };
}

function DeltaCell({ label, thisVal, lastVal, unit, digits = 0 }) {
  const delta = thisVal != null && lastVal != null ? thisVal - lastVal : null;
  const sign  = delta != null && delta >= 0 ? '+' : '';
  const color = delta == null ? 'var(--tm)' : delta > 0.05 ? '#22c55e' : delta < -0.05 ? '#ef4444' : 'var(--tm)';
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

function yoyNote(todaySum, lySum, date) {
  if (!todaySum || !lySum) return null;
  const dateStr = date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  const tempDelta = todaySum.tempHigh != null && lySum.tempHigh != null ? todaySum.tempHigh - lySum.tempHigh : null;
  const rainDelta = todaySum.precipTotal != null && lySum.precipTotal != null ? todaySum.precipTotal - lySum.precipTotal : null;
  const parts = [];
  if (tempDelta != null) parts.push(tempDelta > 0 ? 'warmer' : 'cooler');
  if (rainDelta != null) parts.push(rainDelta > 0 ? 'wetter' : 'drier');
  if (!parts.length) return null;
  return `${dateStr} was ${parts.join(' and ')} than a year ago.`;
}

export default function NowTab({ current, isLoading, stationId, fetchHistory, history }) {
  const fetched = useRef(false);
  const [yoy, setYoy] = useState({ today: null, lastYear: null });

  useEffect(() => {
    if (fetched.current || !stationId) return;
    fetched.current = true;
    const todayKey = toDateStr(new Date());
    const lyDate = new Date(); lyDate.setFullYear(lyDate.getFullYear() - 1);
    const lyKey = toDateStr(lyDate);
    Promise.all([fetchHistory(todayKey), fetchHistory(lyKey)])
      .then(([t, l]) => setYoy({ today: summarize(t), lastYear: summarize(l) }));
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

  const todaySum  = yoy.today;
  const lySum     = yoy.lastYear;
  const note      = yoyNote(todaySum, lySum, new Date());
  const hasYoy    = todaySum || lySum;

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <DeltaCell label="High"    thisVal={todaySum?.tempHigh}    lastVal={lySum?.tempHigh}    unit="°F" />
            <DeltaCell label="Low"     thisVal={todaySum?.tempLow}     lastVal={lySum?.tempLow}     unit="°F" />
            <DeltaCell label="Rainfall" thisVal={todaySum?.precipTotal} lastVal={lySum?.precipTotal} unit='"' digits={2} />
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
