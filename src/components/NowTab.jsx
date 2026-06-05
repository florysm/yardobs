import ActivityScoreCard from './ActivityScoreCard';
import MetricCard from './MetricCard';
import { fmt, aqiCategory } from '../utils/format';

function beaufort(mph) {
  if (mph == null) return '—';
  const thresholds = [1,4,8,13,19,25,32,39,47,55,64,73];
  const names = ['Calm','Light Air','Light Breeze','Gentle Breeze','Moderate Breeze',
    'Fresh Breeze','Strong Breeze','Near Gale','Gale','Severe Gale','Storm','Violent Storm','Hurricane'];
  const scale = thresholds.findIndex(v => mph < v);
  const n = scale === -1 ? 12 : scale;
  return `${n} · ${names[n]}`;
}


export default function NowTab({ current, isLoading, error, stationId, hourlyForecast, onError, defaultActivity }) {
  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[0,1,2,3].map(i => (
          <div key={i} className="y-metric" style={{ height: 96, opacity: 0.4, animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    );
  }

  if (!current && error) {
    return (
      <div className="y-card" style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--ts)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tp)', marginBottom: 4 }}>Unable to load weather data</div>
        <div style={{ fontSize: 12 }}>{error}</div>
      </div>
    );
  }

  const isPreview = current?.sourceType === 'forecast_model';

  return (
    <div>
      {/* Activity score card */}
      <ActivityScoreCard current={current} hourlyForecast={hourlyForecast} onError={onError} defaultActivity={defaultActivity} />

      {/* 4-metric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <MetricCard icon="🌡️" label="Dew Point" value={fmt(current?.dewPoint)} unit="°F" />
        <MetricCard icon="💨" label="Wind Gust" value={fmt(current?.windGust)} unit=" mph" trend={current?.windGust != null ? beaufort(current.windGust) : undefined} />
        <MetricCard icon="🌬️" label="Air Quality" value={fmt(current?.aqi)} unit=" AQI" trend={aqiCategory(current?.aqi)} />
        <MetricCard
          icon="🌧️"
          label="Rain Rate"
          value={isPreview ? '—' : fmt(current?.precipRate, 2)}
          unit={isPreview ? '' : '"'}
          trend={isPreview ? 'Not available' : undefined}
        />
      </div>

      {/* Preview mode educational hint */}
      {isPreview && (
        <div style={{
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--ts)',
          padding: '6px 0 2px',
          lineHeight: 1.5,
          letterSpacing: '0.2px',
        }}>
          Forecast data · rainfall, solar &amp; station readings require a weather station
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        {isPreview
          ? `${current?.neighborhood ?? 'Forecast'} · Open-Meteo`
          : `${stationId} · PWS Observations API`}
      </div>
    </div>
  );
}
