import ActivityScoreCard from './ActivityScoreCard';
import MetricCard from './MetricCard';
import { fmt } from '../utils/format';

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


export default function NowTab({ current, isLoading, stationId, hourlyForecast, onError }) {
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
      <ActivityScoreCard current={current} hourlyForecast={hourlyForecast} onError={onError} />

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
