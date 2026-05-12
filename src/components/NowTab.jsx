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

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        {stationId} · PWS Observations API
      </div>
    </div>
  );
}
