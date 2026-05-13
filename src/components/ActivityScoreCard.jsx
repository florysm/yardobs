import { useState, useEffect, useMemo, useRef } from 'react';

// ── Activity definitions ──────────────────────────────────────────────────────

const ACTIVITIES = [
  { id: 'bbq',     label: 'BBQ & Smoking',     short: 'BBQ',      icon: '🔥' },
  { id: 'garden',  label: 'Gardening',          short: 'Gardening', icon: '🌱' },
  { id: 'sports',  label: 'Sports & Rec',       short: 'Sports',   icon: '⚽' },
  { id: 'leisure', label: 'Outdoor Leisure',    short: 'Leisure',  icon: '🌿' },
  { id: 'dogwalk', label: 'Dog Walk',           short: 'Dog Walk', icon: '🐾' },
];

// ── Scoring helpers ───────────────────────────────────────────────────────────

function clamp(v) { return Math.max(0, Math.min(100, v)); }

// Piecewise-linear interpolation over sorted [x, y] control points
function pw(x, pts) {
  if (x == null) return 60;
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i][0] && x <= pts[i + 1][0]) {
      const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
    }
  }
  return 60;
}

const PRECIP_STD  = [[0, 100], [0.01, 85], [0.05, 55], [0.1, 25],  [0.3,  5]];
const PRECIP_SPORT= [[0, 100], [0.01, 80], [0.05, 45], [0.1, 15],  [0.3,  5]];
const PRECIP_DOG  = [[0, 100], [0.01, 85], [0.05, 65], [0.1, 35],  [0.3, 10]];
const AQI_CURVE   = [[0, 100], [50, 100],  [100, 80],  [150, 45],  [200, 15], [300, 5]];

// Factor definitions keyed by activity id.
// fn(current) → raw score 0–100; raw(current) → display string
const FACTOR_DEFS = {
  bbq: [
    {
      name: 'Temperature', weight: 0.30,
      fn:  c => pw(c.temp,      [[32,5],[45,30],[55,75],[65,100],[85,100],[92,75],[100,40],[110,10]]),
      raw: c => c.temp != null ? `${Math.round(c.temp)}°F` : '—',
    },
    {
      name: 'Wind',        weight: 0.30,
      fn:  c => pw(c.windSpeed, [[0,100],[8,100],[12,80],[18,55],[25,25],[35,5]]),
      raw: c => c.windSpeed != null ? `${Math.round(c.windSpeed)} mph` : '—',
    },
    {
      name: 'Humidity',    weight: 0.20,
      fn:  c => pw(c.humidity,  [[10,55],[35,80],[45,100],[70,100],[80,65],[90,30],[100,10]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Rain Risk',   weight: 0.20,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_STD),
      raw: c => (c.precipRate ?? 0) > 0
        ? `${(c.precipRate).toFixed(2)}"/hr`
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : '0.00"/hr',
    },
  ],
  garden: [
    {
      name: 'Temperature', weight: 0.25,
      fn:  c => pw(c.temp,      [[35,10],[50,45],[60,85],[72,100],[80,100],[88,65],[96,30],[105,5]]),
      raw: c => c.temp != null ? `${Math.round(c.temp)}°F` : '—',
    },
    {
      name: 'UV Index',    weight: 0.15,
      fn:  c => pw(c.uv ?? 0,   [[0,100],[3,100],[6,80],[8,55],[10,30],[13,10]]),
      raw: c => c.uv != null ? `UV ${c.uv}` : '—',
    },
    {
      name: 'Humidity',    weight: 0.20,
      fn:  c => pw(c.humidity,  [[15,40],[35,80],[45,100],[65,100],[78,65],[88,30],[100,10]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Wind',        weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,90],[10,100],[18,80],[25,55],[35,20]]),
      raw: c => c.windSpeed != null ? `${Math.round(c.windSpeed)} mph` : '—',
    },
    {
      name: 'Rain Risk',   weight: 0.15,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_STD),
      raw: c => (c.precipRate ?? 0) > 0
        ? `${(c.precipRate).toFixed(2)}"/hr`
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : '0.00"/hr',
    },
    {
      name: 'Air Quality', weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
  sports: [
    {
      name: 'Temperature', weight: 0.30,
      fn:  c => pw(c.temp,      [[40,10],[55,45],[62,85],[68,100],[75,100],[82,70],[88,40],[95,10]]),
      raw: c => c.temp != null ? `${Math.round(c.temp)}°F` : '—',
    },
    {
      name: 'Humidity',    weight: 0.25,
      fn:  c => pw(c.humidity,  [[10,70],[30,95],[45,100],[55,90],[65,70],[75,40],[85,15],[100,5]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Wind',        weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,80],[8,100],[15,85],[22,55],[30,25],[40,5]]),
      raw: c => c.windSpeed != null ? `${Math.round(c.windSpeed)} mph` : '—',
    },
    {
      name: 'Rain Risk',   weight: 0.20,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_SPORT),
      raw: c => (c.precipRate ?? 0) > 0
        ? `${(c.precipRate).toFixed(2)}"/hr`
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : '0.00"/hr',
    },
    {
      name: 'Air Quality', weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
  leisure: [
    {
      name: 'Temperature', weight: 0.35,
      fn:  c => pw(c.temp,      [[45,15],[58,50],[65,85],[70,100],[82,100],[88,70],[95,30],[103,5]]),
      raw: c => c.temp != null ? `${Math.round(c.temp)}°F` : '—',
    },
    {
      name: 'Humidity',    weight: 0.25,
      fn:  c => pw(c.humidity,  [[15,60],[35,90],[45,100],[60,100],[70,75],[80,45],[90,15]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Wind',        weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,85],[8,100],[15,80],[22,55],[30,20]]),
      raw: c => c.windSpeed != null ? `${Math.round(c.windSpeed)} mph` : '—',
    },
    {
      name: 'Rain Risk',   weight: 0.15,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_STD),
      raw: c => (c.precipRate ?? 0) > 0
        ? `${(c.precipRate).toFixed(2)}"/hr`
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : '0.00"/hr',
    },
    {
      name: 'Air Quality', weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
  dogwalk: [
    {
      name: 'Heat Index',     weight: 0.40,
      fn:  c => {
        const hi = c.feelsLike ?? c.temp ?? 70;
        return pw(hi, [[32,5],[45,30],[55,75],[68,100],[75,80],[80,50],[85,20],[92,5]]);
      },
      raw: c => {
        const v = c.feelsLike ?? c.temp;
        return v != null ? `${Math.round(v)}°F` : '—';
      },
    },
    {
      name: 'Wind (Cooling)', weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,60],[5,80],[12,100],[20,90],[28,65],[38,30]]),
      raw: c => c.windSpeed != null ? `${Math.round(c.windSpeed)} mph` : '—',
    },
    {
      name: 'Humidity',       weight: 0.20,
      fn:  c => pw(c.humidity,  [[10,60],[30,90],[45,100],[55,85],[65,55],[75,25],[85,5]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Rain Risk',      weight: 0.15,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_DOG),
      raw: c => (c.precipRate ?? 0) > 0
        ? `${(c.precipRate).toFixed(2)}"/hr`
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : '0.00"/hr',
    },
    {
      name: 'Air Quality',    weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
};

function computeScore(actId, current) {
  if (!current) return { score: 0, factors: [], pavementTemp: null };
  const defs = FACTOR_DEFS[actId];
  let total = 0;
  const factors = defs.map(f => {
    const s = Math.round(clamp(f.fn(current)));
    total += s * f.weight;
    return { name: f.name, score: s, raw: f.raw(current) };
  });
  const score = Math.round(clamp(total));

  let pavementTemp = null;
  if (actId === 'dogwalk' && current.temp != null) {
    // Direct-sun pavement: air temp + 40–60°F. Use UV as proxy for sun intensity.
    const sunOffset = (current.uv ?? 0) >= 3 ? 50 : 20;
    pavementTemp = Math.round(current.temp + sunOffset);
  }
  return { score, factors, pavementTemp };
}

function computeAllScores(current) {
  return Object.fromEntries(ACTIVITIES.map(a => [a.id, computeScore(a.id, current)]));
}

// ── Arc helpers ───────────────────────────────────────────────────────────────

function precipProbToRate(prob) {
  if (prob < 20) return 0;
  if (prob < 50) return 0.01;
  if (prob < 75) return 0.05;
  return 0.1;
}

function getForecastRainThreat(hf) {
  if (!hf?.hourly?.time) return { rate: 0, maxProb: 0 };
  const today = new Date().toISOString().split('T')[0];
  let maxProb = 0;
  hf.hourly.time.forEach((t, i) => {
    if (!t.startsWith(today)) return;
    const prob = hf.hourly.precipitation_probability?.[i] ?? 0;
    if (prob > maxProb) maxProb = prob;
  });
  return { rate: precipProbToRate(maxProb), maxProb };
}

function getArcData(hf, actId, current) {
  if (!hf?.hourly?.time) return [];
  const today = new Date().toISOString().split('T')[0];
  const result = [];
  hf.hourly.time.forEach((t, i) => {
    const [date, timeStr] = t.split('T');
    if (date !== today) return;
    const hour = parseInt(timeStr, 10);
    if (hour < 7 || hour > 18) return;
    const cHour = {
      temp:       hf.hourly.temperature_2m?.[i]          ?? current?.temp      ?? 70,
      feelsLike:  hf.hourly.apparent_temperature?.[i]    ?? null,
      humidity:   hf.hourly.relative_humidity_2m?.[i]    ?? current?.humidity  ?? 50,
      windSpeed:  hf.hourly.wind_speed_10m?.[i]          ?? current?.windSpeed ?? 0,
      windGust:   hf.hourly.wind_gusts_10m?.[i]          ?? null,
      precipRate: precipProbToRate(hf.hourly.precipitation_probability?.[i] ?? 0),
      uv:         hf.hourly.uv_index?.[i]                ?? 0,
      aqi:        current?.aqi                           ?? null,
    };
    const { score } = computeScore(actId, cHour);
    result.push({ hour, score });
  });
  return result;
}

function fmtHour(h) {
  if (h === 12) return '12P';
  if (h === 0)  return '12A';
  return h > 12 ? `${h - 12}P` : `${h}A`;
}

function getBestWindow(arcData) {
  if (arcData.length < 3) return null;
  let bi = 0, best = 0;
  for (let i = 0; i <= arcData.length - 3; i++) {
    const avg = (arcData[i].score + arcData[i + 1].score + arcData[i + 2].score) / 3;
    if (avg > best) { best = avg; bi = i; }
  }
  const s = arcData[bi].hour;
  const e = arcData[Math.min(bi + 2, arcData.length - 1)].hour + 1;
  // Format: "Peak 2–5 PM"
  function label(h) {
    const p = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12} ${p}`;
  }
  return `Peak ${label(s)}–${label(e)}`;
}

// ── Insight splitting ─────────────────────────────────────────────────────────

// Matches up to the first sentence-ending punctuation that is followed by
// whitespace + uppercase (new sentence) or end of string. Avoids splitting on
// abbreviations like "N.E." or decimal numbers mid-sentence.
function firstSentence(text) {
  if (!text) return null;
  const m = text.match(/^.+?[.!?](?=\s+[A-Z]|$)/);
  return m ? m[0] : text;
}

function restOfInsight(text) {
  if (!text) return null;
  const first = firstSentence(text);
  if (!first || first.length >= text.length) return null;
  return text.slice(first.length).trim() || null;
}

// ── Color & verdict ───────────────────────────────────────────────────────────

function scoreColor(s) {
  if (s >= 80) return '#3B6D11';
  if (s >= 65) return '#639922';
  if (s >= 50) return '#BA7517';
  return '#A32D2D';
}

function scoreVerdict(s) {
  if (s >= 80) return 'Excellent conditions';
  if (s >= 65) return 'Good conditions today';
  if (s >= 50) return 'Marginal conditions';
  return 'Poor conditions today';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const r = 21;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={r} fill="none"
          stroke={scoreColor(score)} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.3s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)',
      }}>
        {score}
      </div>
    </div>
  );
}

function FactorBars({ factors }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {factors.map(f => (
        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--ts)', width: 108, flexShrink: 0 }}>{f.name}</div>
          <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${f.score}%`, borderRadius: 3,
              background: scoreColor(f.score),
              transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--tp)', width: 24, textAlign: 'right', flexShrink: 0 }}>
            {f.score}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tm)', width: 52, textAlign: 'right', flexShrink: 0 }}>
            {f.raw}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeArc({ arcData, bestWindow }) {
  if (!arcData.length) {
    return (
      <div style={{ fontSize: 11, color: 'var(--tm)', textAlign: 'center', padding: '8px 0' }}>
        Forecast data loading…
      </div>
    );
  }

  // Find peak window start index for highlight
  let peakIdx = 0, peakAvg = 0;
  for (let i = 0; i <= arcData.length - 3; i++) {
    const avg = (arcData[i].score + arcData[i + 1].score + arcData[i + 2].score) / 3;
    if (avg > peakAvg) { peakAvg = avg; peakIdx = i; }
  }
  const peakHours = new Set(
    arcData.slice(peakIdx, peakIdx + 3).map(d => d.hour)
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
        {arcData.map(({ hour, score }) => {
          const isPeak = peakHours.has(hour);
          const color  = scoreColor(score);
          const barH   = Math.max(3, Math.round(score * 0.44));
          return (
            <div key={hour} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end', height: '100%',
            }}>
              <div style={{
                width: '100%', height: barH,
                borderRadius: '2px 2px 0 0',
                background: isPeak ? color : color + '66',
                transition: 'height 0.5s ease, background 0.3s',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {arcData.map(({ hour }) => (
          <div key={hour} style={{
            flex: 1, textAlign: 'center',
            fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)',
          }}>
            {fmtHour(hour)}
          </div>
        ))}
      </div>
      {bestWindow && (
        <div style={{
          fontSize: 10, color: '#3B6D11', marginTop: 6,
          textAlign: 'center', fontWeight: 500,
        }}>
          Best window: {bestWindow.replace('Peak ', '')}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ActivityScoreCard({ current, hourlyForecast }) {
  const [activeId,       setActiveId]       = useState('bbq');
  const [expanded,       setExpanded]       = useState(false);
  const [insight,        setInsight]        = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const iCache = useRef({});

  const { rate: forecastRate, maxProb: forecastMaxProb } = useMemo(
    () => getForecastRainThreat(hourlyForecast),
    [hourlyForecast]
  );
  const currentWithThreat = useMemo(() => current ? {
    ...current,
    rainThreat: Math.max(current.precipRate ?? 0, forecastRate),
    forecastMaxProb,
  } : current, [current, forecastRate, forecastMaxProb]);

  const allScores = useMemo(() => computeAllScores(currentWithThreat), [currentWithThreat]);
  const active    = allScores[activeId];
  const arcData   = useMemo(() => getArcData(hourlyForecast, activeId, current), [hourlyForecast, activeId, current]);
  const bestWindow = useMemo(() => getBestWindow(arcData), [arcData]);
  const act = ACTIVITIES.find(a => a.id === activeId);

  const showPawAlert = activeId === 'dogwalk' && (active.pavementTemp ?? 0) >= 100;

  // Fetch AI insight whenever the active activity or conditions change meaningfully
  useEffect(() => {
    if (!currentWithThreat) return;
    const key = `${activeId}|${Math.round(active.score / 5) * 5}|${Math.round((currentWithThreat.temp ?? 70) / 2) * 2}`;
    if (iCache.current[key] !== undefined) {
      setInsight(iCache.current[key]);
      setInsightLoading(false);
      return;
    }
    setInsightLoading(true);
    setInsight(null);
    fetch('/api/insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activity: activeId,
        activityLabel: act?.label,
        score: active.score,
        factors: active.factors,
        current: currentWithThreat,
      }),
    })
      .then(r => r.json())
      .then(d => {
        const text = d.insight ?? '';
        iCache.current[key] = text;
        setInsight(text);
      })
      .catch(() => {
        iCache.current[key] = '';
        setInsight('');
      })
      .finally(() => setInsightLoading(false));
  }, [activeId, currentWithThreat]);

  if (!current) {
    return <div className="y-card" style={{ height: 120, opacity: 0.5 }} />;
  }

  return (
    <div className="y-card" style={{ padding: 0, overflow: 'hidden' }}>

      {/* ── Header (tap to expand/collapse) ────────────────────────────────── */}
      <div style={{ padding: 16, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ScoreRing score={active.score} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tp)' }}>{act?.label}</div>
              <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 2 }}>{scoreVerdict(active.score)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {bestWindow && (
              <div style={{
                fontSize: 11, color: 'var(--accent)', background: 'var(--soft)',
                padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap',
              }}>
                {bestWindow}
              </div>
            )}
            <div style={{
              width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--tm)', transition: 'transform 0.3s',
              transform: expanded ? 'rotate(180deg)' : 'none',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,6 8,11 13,6" />
              </svg>
            </div>
          </div>
        </div>

        {/* First sentence only — rest surfaces in expanded panel */}
        <div style={{
          marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
          fontSize: 13, color: 'var(--ts)', lineHeight: 1.6, minHeight: 22,
        }}>
          {insightLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="live-dot" style={{ background: 'var(--tm)' }} />
              <span style={{ color: 'var(--tm)', fontSize: 12 }}>Generating insight…</span>
            </div>
          ) : firstSentence(insight) ? (
            firstSentence(insight)
          ) : (
            <span style={{ color: 'var(--tm)', fontStyle: 'italic' }}>No insight available</span>
          )}
        </div>

        {/* AI badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--tm)',
        }}>
          <div className="live-dot" />
          AI insight powered by your live station data
        </div>
      </div>

      {/* ── Expanded panel ─────────────────────────────────────────────────── */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 16 }}>
          {/* Remaining sentences of the insight */}
          {restOfInsight(insight) && (
            <div style={{
              fontSize: 13, color: 'var(--ts)', lineHeight: 1.6,
              marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)',
            }}>
              {restOfInsight(insight)}
            </div>
          )}
          <div className="y-label">Contributing factors</div>
          <FactorBars factors={active.factors} />

          {/* Pavement caution (Dog Walk only) */}
          {showPawAlert && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              marginTop: 12, padding: '10px 12px',
              background: 'rgba(186,117,23,0.12)',
              border: '1px solid rgba(186,117,23,0.4)',
              borderRadius: 10, fontSize: 12, color: 'var(--ts)', lineHeight: 1.5,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>🐾</span>
              <div>
                <strong style={{ color: '#BA7517' }}>Pavement caution</strong>
                {' '}— Estimated surface ~{active.pavementTemp}°F in direct sun.
                Use the 7-second rule: if you can't hold the back of your hand on the pavement
                for 7 seconds, it's too hot for paws.
              </div>
            </div>
          )}

          {/* Time-of-day arc */}
          <div style={{ marginTop: 14 }}>
            <div className="y-label">Conditions through the day</div>
            <TimeArc arcData={arcData} bestWindow={bestWindow} />
          </div>
        </div>
      )}

      {/* ── Activity chips (always visible) ────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
        <div style={{
          fontSize: 11, color: 'var(--tm)',
          letterSpacing: '0.5px', marginBottom: 8,
        }}>
          Other activities today
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {ACTIVITIES.map(a => {
            const s = allScores[a.id]?.score ?? 0;
            const isActive = a.id === activeId;
            return (
              <div
                key={a.id}
                onClick={e => { e.stopPropagation(); setActiveId(a.id); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, transition: 'all 0.2s',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--soft)' : 'var(--glass)',
                  color: isActive ? 'var(--accent)' : 'var(--ts)',
                }}
              >
                <span style={{ fontSize: 13 }}>{a.icon}</span>
                {a.short}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.8 }}>{s}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
