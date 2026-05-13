import { useState, useRef, useEffect } from 'react';

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

// ── Tabler-style SVG icon primitives for signal tags ─────────────────────────

function TIcon({ children }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const TAG_ICONS = {
  thermometer: (
    <TIcon>
      <path d="M10 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5"/>
    </TIcon>
  ),
  wind: (
    <TIcon>
      <path d="M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24"/>
      <path d="M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24"/>
      <path d="M4 16h5.5a2.5 2.5 0 1 0 -2.34 3.24"/>
    </TIcon>
  ),
  droplet: (
    <TIcon>
      <path d="M6.8 11a6 6 0 1 0 10.396 0l-5.197 -8l-5.2 8z"/>
    </TIcon>
  ),
  umbrella: (
    <TIcon>
      <path d="M4 12a8 8 0 0 1 16 0z"/>
      <path d="M12 12v6a2 2 0 0 0 4 0"/>
    </TIcon>
  ),
  snowflake: (
    <TIcon>
      <line x1="12" y1="3" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <path d="M5.636 5.636l12.728 12.728"/>
      <path d="M5.636 18.364l12.728 -12.728"/>
      <path d="M8 3l4 3l4 -3"/>
      <path d="M8 21l4 -3l4 3"/>
      <path d="M3 8l3 4l-3 4"/>
      <path d="M21 8l-3 4l3 4"/>
    </TIcon>
  ),
  flame: (
    <TIcon>
      <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -.47 -3.11 -1.5 -4.5c-1.63 2.5 -2.5 2 -3.5 0"/>
    </TIcon>
  ),
  sun: (
    <TIcon>
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="3" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="21"/>
      <line x1="3" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="21" y2="12"/>
      <line x1="5.64" y1="5.64" x2="7.05" y2="7.05"/>
      <line x1="16.95" y1="16.95" x2="18.36" y2="18.36"/>
      <line x1="5.64" y1="18.36" x2="7.05" y2="16.95"/>
      <line x1="16.95" y1="7.05" x2="18.36" y2="5.64"/>
    </TIcon>
  ),
  'alert-triangle': (
    <TIcon>
      <path d="M10.24 3.957l-8.422 14.06a1.989 1.989 0 0 0 1.7 2.983h16.845a1.989 1.989 0 0 0 1.7 -2.983l-8.423 -14.06a1.989 1.989 0 0 0 -3.4 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </TIcon>
  ),
  'trending-up': (
    <TIcon>
      <polyline points="3 17 9 11 13 15 21 7"/>
      <polyline points="14 7 21 7 21 14"/>
    </TIcon>
  ),
  'trending-down': (
    <TIcon>
      <polyline points="3 7 9 13 13 9 21 17"/>
      <polyline points="14 17 21 17 21 10"/>
    </TIcon>
  ),
  'circle-check': (
    <TIcon>
      <circle cx="12" cy="12" r="9"/>
      <path d="M9 12l2 2l4 -4"/>
    </TIcon>
  ),
  cloud: (
    <TIcon>
      <path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 .99c1.488 1.182 2.162 3.049 1.77 4.867c1.596 .417 2.853 1.747 3.154 3.466s-.433 3.462 -1.872 4.315"/>
    </TIcon>
  ),
  leaf: (
    <TIcon>
      <path d="M5 21c.5 -4.5 2.5 -8.5 7 -10c0 0 4 -3 7 -1c0 6 -3.5 9 -7 10c0 0 1.5 1 4 0"/>
      <path d="M3 21l2 -2"/>
    </TIcon>
  ),
  gauge: (
    <TIcon>
      <circle cx="12" cy="12" r="9"/>
      <line x1="12" y1="3" x2="12" y2="5"/>
      <line x1="3" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="21" y2="12"/>
      <line x1="12" y1="12" x2="16" y2="8.5"/>
    </TIcon>
  ),
};

// ── Signal tag component ──────────────────────────────────────────────────────

const TAG_STYLES = {
  positive: { bg: 'rgba(22,163,74,0.18)',    text: '#16a34a', border: 'rgba(22,163,74,0.35)'    },
  caution:  { bg: 'rgba(217,119,6,0.18)',    text: '#d97706', border: 'rgba(217,119,6,0.35)'    },
  neutral:  { bg: 'rgba(255,255,255,0.1)',   text: 'rgba(255,255,255,0.75)', border: 'rgba(255,255,255,0.22)' },
};

function SignalTag({ label, type, icon }) {
  const s = TAG_STYLES[type] ?? TAG_STYLES.neutral;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 50,
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    }}>
      {TAG_ICONS[icon] ?? TAG_ICONS['circle-check']}
      {label}
    </div>
  );
}

// ── Insight view ──────────────────────────────────────────────────────────────


function InsightView({ insight, isLoading, toggle }) {
  const eyebrow = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div>
        <div style={{
          fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.7)', fontWeight: 500,
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        }}>
          Your backyard today
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
          <div className="live-dot" style={{ background: 'rgba(255,255,255,0.45)' }} />
          AI
        </div>
      </div>
      {toggle}
    </div>
  );

  if (isLoading) {
    return (
      <>
        {eyebrow}
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.28)', fontStyle: 'italic', lineHeight: 1.65, marginBottom: 16, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
          Analyzing your station data…
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[88, 106, 96].map((w, i) => (
            <div key={i} style={{
              height: 24, width: w, borderRadius: 50,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
            }} />
          ))}
        </div>
        <div style={{ height: 11, background: 'rgba(255,255,255,0.06)', borderRadius: 4, width: 190 }} />
      </>
    );
  }

  const hasContent = insight?.narrative || insight?.tags?.length;

  return (
    <>
      {eyebrow}
      {hasContent ? (
        <>
          <p style={{
            fontSize: 14, color: 'rgba(255,255,255,0.88)', lineHeight: 1.65,
            margin: '0 0 14px', fontWeight: 300, fontFamily: 'var(--font-body)',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
          }}>
            {insight.narrative}
          </p>
          {insight.tags?.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {insight.tags.map((tag, i) => <SignalTag key={i} {...tag} />)}
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', margin: '0 0 14px', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
          Insight unavailable right now.
        </p>
      )}
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.3px', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
        {insight?.updatedAt ? `Updated ${insight.updatedAt} · refreshes hourly` : 'Refreshes hourly'}
      </div>
    </>
  );
}

// ── HeroCard ──────────────────────────────────────────────────────────────────

function buildForecastSummary(hf) {
  if (!hf?.hourly?.time) return null;
  const today = new Date().toISOString().split('T')[0];
  let maxPrecipProb = 0;
  let rainyHoursCount = 0;
  let totalForecastHours = 0;
  hf.hourly.time.forEach((t, i) => {
    if (!t.startsWith(today)) return;
    totalForecastHours++;
    const prob = hf.hourly.precipitation_probability?.[i] ?? 0;
    if (prob > maxPrecipProb) maxPrecipProb = prob;
    if (prob > 50) rainyHoursCount++;
  });
  return { maxPrecipProb, rainyHoursCount, totalForecastHours };
}

export default function HeroCard({ current, isLoading, onLongPress, stationId, fetchHistoryDaily, hourlyForecast }) {
  const [showHint,      setShowHint]      = useState(false);
  const [view,          setView]          = useState(() => localStorage.getItem('yardobs-hero-view') || 'conditions');
  const [contentFade,   setContentFade]   = useState(true);
  const [insight,       setInsight]       = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
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

  const switchView = (newView) => {
    if (newView === view) return;
    setContentFade(false);
    setTimeout(() => {
      setView(newView);
      setContentFade(true);
      localStorage.setItem('yardobs-hero-view', newView);
    }, 200);
  };

  // Fetch AI daily insight when insights view is active
  useEffect(() => {
    if (view !== 'insights' || !current || !stationId) return;

    const today = new Date().toISOString().split('T')[0];
    const lsKey = `yardobs-insight-${stationId}-${today}`;

    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < 60 * 60 * 1000) {
          setInsight(data);
          return;
        }
      }
    } catch {}

    let cancelled = false;
    setInsightLoading(true);
    setInsight(null);

    const run = async () => {
      const lastYear = new Date();
      lastYear.setFullYear(lastYear.getFullYear() - 1);
      const yoyDate = lastYear.toISOString().split('T')[0].replace(/-/g, '');

      let yoyReadings = [];
      try { yoyReadings = (await fetchHistoryDaily?.(yoyDate)) ?? []; } catch {}

      if (cancelled) return;

      try {
        const res = await fetch('/api/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'daily', stationId, date: today, current, yoyReadings,
            forecastSummary: buildForecastSummary(hourlyForecast),
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        const updatedAt = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const stored = { ...json, updatedAt };
        try { localStorage.setItem(lsKey, JSON.stringify({ data: stored, ts: Date.now() })); } catch {}
        setInsight(stored);
      } catch {
        if (!cancelled) setInsight({ narrative: '', tags: [], updatedAt: '' });
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [view, current, stationId, fetchHistoryDaily]);

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

  const togglePill = (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{
        display: 'flex',
        background: 'rgba(0,0,0,0.22)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 50,
        padding: 2,
        flexShrink: 0,
      }}
    >
      {['conditions', 'insights'].map(v => (
        <button
          key={v}
          onClick={() => switchView(v)}
          style={{
            padding: '4px 10px',
            borderRadius: 50,
            border: 'none',
            background: view === v ? 'rgba(255,255,255,0.22)' : 'transparent',
            color: view === v ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)',
            fontSize: 11,
            fontWeight: view === v ? 500 : 400,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            transition: 'background 0.2s, color 0.2s',
            letterSpacing: '0.2px',
          }}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );

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
      {/* Darkening overlay for insights view — gradient strongest at top-left where light themes are palest */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.12) 100%)',
        opacity: view === 'insights' ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* Long-press hint */}
      <div style={{
        position: 'absolute', bottom: 74, left: '50%', transform: 'translateX(-50%)',
        background: 'var(--overlay-bg)', color: 'var(--overlay-text)',
        fontSize: 10, padding: '4px 10px', borderRadius: 50, whiteSpace: 'nowrap',
        opacity: showHint ? 1 : 0, transition: 'opacity 0.4s', letterSpacing: '0.3px',
        pointerEvents: 'none', zIndex: 5,
      }}>
        Hold to preview themes
      </div>

      {/* Main content — crossfades between views */}
      <div style={{
        position: 'relative', zIndex: 1,
        opacity: contentFade ? 1 : 0,
        transition: 'opacity 0.2s',
      }}>
        {view === 'conditions' ? (
          <>
            {/* Top row: label + toggle */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--ts)', fontWeight: 500 }}>
                  Current Conditions
                </div>
                <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 3, fontWeight: 300 }}>
                  {condition}
                </div>
              </div>
              {togglePill}
            </div>

            {/* Temperature row — icon sits to the right, aligned with the numerals */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
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
              <span style={{ fontSize: 58, lineHeight: 1, opacity: 0.92 }} aria-hidden="true">
                {isLoading ? '…' : icon}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 18, fontWeight: 300 }}>
              Feels like {fmt(current?.feelsLike)}° · Humidity {fmt(current?.humidity)}%
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
          </>
        ) : (
          <InsightView insight={insight} isLoading={insightLoading} toggle={togglePill} />
        )}
      </div>
    </div>
  );
}
