import ActivityScoreCard from './ActivityScoreCard';

function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

function aqiLabel(aqi) {
  if (aqi == null) return null;
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
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

export default function NowTab({ current, isLoading, stationId, hourlyForecast }) {
  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0,1,2,3].map(i => (
          <div key={i} className="y-metric" style={{ height: 96, opacity: 0.4, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Activity score card */}
      <ActivityScoreCard current={current} hourlyForecast={hourlyForecast} />

      {/* 4-metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <MetricCard icon="🌡️" label="Dew Point" value={fmt(current?.dewPoint)} unit="°F" />
        <MetricCard icon="💨" label="Wind Gust" value={fmt(current?.windGust)} unit=" mph" trend={current?.windGust != null ? beaufort(current.windGust) : undefined} />
        <MetricCard icon="🌬️" label="Air Quality" value={fmt(current?.aqi)} unit=" AQI" trend={aqiLabel(current?.aqi)} />
        <MetricCard icon="🌧️" label="Rain Rate" value={fmt(current?.precipRate, 2)} unit='"' />
      </div>

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
