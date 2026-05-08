import { useState, useRef } from 'react';

const ICONS = {
  0:'🌪️',1:'🌀',2:'🌀',3:'⛈️',4:'⛈️',5:'🌨️',6:'🌧️',7:'🌧️',8:'🌧️',
  9:'🌦️',10:'🌧️',11:'🌧️',12:'🌧️',13:'🌨️',14:'🌨️',15:'🌨️',16:'❄️',
  17:'🌨️',18:'🌧️',19:'🌫️',20:'🌫️',21:'🌫️',22:'💨',23:'💨',24:'💨',
  25:'🥶',26:'☁️',27:'☁️',28:'☁️',29:'🌙',30:'⛅',31:'🌙',32:'☀️',
  33:'🌙',34:'🌤️',35:'🌧️',36:'🌡️',37:'⛈️',38:'⛈️',39:'🌦️',40:'🌧️',
  41:'🌨️',42:'❄️',43:'🌨️',44:'❓',45:'🌦️',46:'🌨️',47:'⛈️',
};

const LABELS = {
  0:'Tornado',1:'Tropical Storm',2:'Hurricane',3:'Severe T-Storms',4:'Thunderstorms',
  5:'Rain & Snow',6:'Rain & Sleet',7:'Wintry Mix',8:'Freezing Drizzle',9:'Drizzle',
  10:'Freezing Rain',11:'Showers',12:'Rain',13:'Flurries',14:'Snow Showers',
  15:'Blowing Snow',16:'Snow',17:'Hail',18:'Sleet',19:'Dust',20:'Foggy',
  21:'Haze',22:'Smoke',23:'Breezy',24:'Windy',25:'Frigid',26:'Cloudy',
  27:'Mostly Cloudy',28:'Mostly Cloudy',29:'Partly Cloudy',30:'Partly Cloudy',
  31:'Clear',32:'Sunny',33:'Fair',34:'Fair',35:'Rain & Hail',36:'Hot',
  37:'Isolated T-Storms',38:'Scattered T-Storms',39:'Scattered Showers',
  40:'Heavy Rain',41:'Scattered Snow',42:'Heavy Snow',43:'Blizzard',
  44:'N/A',45:'Scattered Showers',46:'Scattered Snow',47:'Scattered T-Storms',
};

function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

function degreesToCompass(deg) {
  if (deg == null) return '';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

export default function HeroCard({ current, isLoading, onLongPress }) {
  const [showHint, setShowHint] = useState(false);
  const timers = useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const handlePointerDown = () => {
    const t1 = setTimeout(() => setShowHint(true), 200);
    const t2 = setTimeout(() => { setShowHint(false); onLongPress?.(); }, 700);
    timers.current = [t1, t2];
  };
  const handlePointerUp = () => {
    clearTimers();
    setTimeout(() => setShowHint(false), 300);
  };

  function deriveFromSensors(obs) {
    const precip = obs.precipRate ?? 0;
    if (precip > 0.1)  return { icon: '🌧️', label: 'Heavy Rain' };
    if (precip > 0)    return { icon: '🌦️', label: 'Light Rain' };
    if (!obs.isDay)    return { icon: '🌙',  label: 'Clear' };
    if ((obs.uv ?? 0) >= 6)                        return { icon: '☀️', label: 'Sunny' };
    if (obs.solar != null && obs.solar < 150)       return { icon: '☁️', label: 'Cloudy' };
    return { icon: '🌤️', label: 'Partly Cloudy' };
  }

  const derived = current
    ? (current.iconCode != null
        ? { icon: ICONS[current.iconCode] ?? '🌡️', label: LABELS[current.iconCode] ?? 'Clear' }
        : deriveFromSensors(current))
    : null;

  const icon      = derived?.icon  ?? '🌡️';
  const condition = derived?.label ?? 'Loading…';

  const windLabel = current
    ? `${fmt(current.windSpeed)} mph ${degreesToCompass(current.windDir)}`
    : '—';

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        margin: '0 16px',
        borderRadius: 24,
        background: 'var(--hero)',
        padding: '26px 24px 22px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'default',
        userSelect: 'none',
        transition: 'background var(--tr)',
      }}
    >
      {/* Long-press hint */}
      <div style={{
        position: 'absolute', bottom: 74, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--overlay-bg)', color: 'var(--overlay-text)',
        fontSize: 10, padding: '4px 10px', borderRadius: 50, whiteSpace: 'nowrap',
        opacity: showHint ? 1 : 0, transition: 'opacity 0.4s', letterSpacing: '0.3px',
        pointerEvents: 'none',
      }}>
        Hold to preview themes
      </div>

      {/* Top row: label + icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ts)', fontWeight: 500 }}>
            Current Conditions
          </div>
          <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 3, fontWeight: 300 }}>
            {condition}
          </div>
        </div>
        <span style={{ fontSize: 58, lineHeight: 1, opacity: 0.92 }} aria-hidden="true">
          {isLoading ? '…' : icon}
        </span>
      </div>

      {/* Temperature */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 84,
            fontWeight: 600,
            letterSpacing: '-5px',
            color: 'var(--tp)',
            lineHeight: 1,
          }}>
            {isLoading ? '—' : fmt(current?.temp)}
            <span style={{ fontSize: 26, fontWeight: 400, opacity: 0.55, letterSpacing: 0, verticalAlign: 'super' }}>°F</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 4, fontWeight: 300 }}>
          Feels like {fmt(current?.feelsLike)}° · Humidity {fmt(current?.humidity)}%
        </div>
      </div>

      {/* 3-stat footer strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 1,
        borderRadius: 14, overflow: 'hidden',
      }}>
        {[
          { label: 'Wind',     val: windLabel },
          { label: 'Pressure', val: current ? `${fmt(current.pressure, 2)}"` : '—' },
          { label: 'Precip',   val: current ? `${fmt(current.precipTotal, 2)}"` : '—' },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: 'var(--glass)', padding: '10px 8px', textAlign: 'center', backdropFilter: 'blur(8px)' }}>
            <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--tm)' }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tp)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
