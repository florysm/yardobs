import { useState, useEffect, useMemo, useRef } from 'react';
import { fmtHourShort } from '../utils/format';
import { ACTIVITIES } from '../utils/activities';
import { STORAGE_KEYS, INSIGHT_TTL_MS } from '../utils/storageKeys';
import { getTimePeriod } from '../utils/dateUtils';
import { formatTemp } from '../utils/units';
import {
  isNotableWeatherChange, computeAllScores, getForecastRainThreat, getRainyHourWindow,
  getArcData, getBestWindow, firstSentence, restOfInsight, scoreColor, scoreVerdict,
} from '../utils/scoring';

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreRing({ score }) {
  const r = 21;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  return (
    <div role="img" aria-label="Activity score ring" style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
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
    <div role="img" aria-label="Hourly activity score timeline">
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
            {fmtHourShort(hour)}
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

export default function ActivityScoreCard({ current, hourlyForecast, onError, defaultActivity, units }) {
  const [activeId,       setActiveId]       = useState(defaultActivity ?? 'bbq');
  const [expanded,       setExpanded]       = useState(false);
  const [insight,        setInsight]        = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const iCache = useRef({});

  const { rate: forecastRate, maxProb: forecastMaxProb } = useMemo(
    () => getForecastRainThreat(hourlyForecast),
    [hourlyForecast]
  );
  const { firstRainyHour, lastRainyHour } = useMemo(
    () => getRainyHourWindow(hourlyForecast),
    [hourlyForecast]
  );
  // rainThreat combines measured rain with forecast risk. Scoring deliberately
  // ignores it (computeScore keys off measured precipRate, so a dry morning with
  // afternoon storms isn't penalized as though it were raining now) — it survives
  // for cache invalidation via isNotableWeatherChange and for display.
  const currentWithThreat = useMemo(() => current ? {
    ...current,
    rainThreat: Math.max(current.precipRate ?? 0, forecastRate),
    forecastMaxProb,
  } : current, [current, forecastRate, forecastMaxProb]);

  const allScores = useMemo(() => computeAllScores(currentWithThreat, units), [currentWithThreat, units]);
  const active    = allScores[activeId];
  const arcData   = useMemo(() => getArcData(hourlyForecast, activeId, current), [hourlyForecast, activeId, current]);
  const bestWindow = useMemo(() => getBestWindow(arcData), [arcData]);
  const act = ACTIVITIES.find(a => a.id === activeId);

  const showPawAlert = activeId === 'dogwalk' && (active.pavementTemp ?? 0) >= 100;

  // Fetch AI insight whenever the active activity or conditions change meaningfully.
  // Debounced so rapid successive updates (current then hourlyForecast arriving) don't
  // each trigger a separate API call.
  useEffect(() => {
    if (!currentWithThreat) return;

    const period = getTimePeriod();

    // Fast in-session path: useRef avoids re-renders when switching activities
    const iKey = `${activeId}|${period}|${units}|${Math.round(active.score / 5) * 5}|${Math.round((currentWithThreat.temp ?? 70) / 2) * 2}`;
    const cached = iCache.current[iKey];
    if (cached !== undefined && Date.now() - cached.ts < INSIGHT_TTL_MS) {
      setInsight(cached.text);
      setInsightLoading(false);
      return;
    }

    // Persistent path: localStorage survives page refreshes; only bypass on notable weather change
    const storageKey = STORAGE_KEYS.activityInsightKey(current?.stationId ?? 'preview', activeId, period, units);
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored && Date.now() - stored.ts < INSIGHT_TTL_MS) {
        const currentSnapshot = {
          temp: currentWithThreat.temp,
          windSpeed: currentWithThreat.windSpeed,
          rainThreat: currentWithThreat.rainThreat,
          score: active.score,
        };
        if (!isNotableWeatherChange(stored, currentSnapshot)) {
          iCache.current[iKey] = { text: stored.insight, ts: Date.now() };
          setInsight(stored.insight);
          setInsightLoading(false);
          return;
        }
      }
    } catch { /* ignore malformed cache entries */ }

    setInsightLoading(true);
    setInsight(null);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          activity: activeId,
          activityLabel: act?.label,
          score: active.score,
          factors: active.factors,
          stationId: current?.stationId,
          sourceType: current?.sourceType,
          period,
          units,
          current: {
            ...currentWithThreat,
            ...(activeId === 'dogwalk' && active.pavementTemp != null
              ? { pavementTemp: active.pavementTemp }
              : {}),
          },
          firstRainyHour,
          lastRainyHour,
        }),
      })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(d => {
          if (controller.signal.aborted) return;
          const text = d.insight ?? '';
          iCache.current[iKey] = { text, ts: Date.now() };
          try {
            localStorage.setItem(storageKey, JSON.stringify({
              insight: text,
              ts: Date.now(),
              conditions: {
                temp: currentWithThreat.temp ?? 70,
                windSpeed: currentWithThreat.windSpeed ?? 0,
                rainThreat: currentWithThreat.rainThreat ?? 0,
                score: active.score,
              },
            }));
          } catch { /* ignore storage quota errors */ }
          setInsight(text);
        })
        .catch(err => {
          if (err.name === 'AbortError' || controller.signal.aborted) return;
          iCache.current[iKey] = { text: '', ts: Date.now() };
          setInsight('');
          onError?.('Could not load activity insight');
        })
        .finally(() => { if (!controller.signal.aborted) setInsightLoading(false); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [activeId, currentWithThreat, units]);

  if (!current) {
    return (
      <div className="y-card" style={{ height: 120, opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--tm)', fontStyle: 'italic' }}>Waiting for weather data…</span>
      </div>
    );
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {bestWindow && (
                <div style={{
                  fontSize: 11, color: 'var(--accent)', background: 'var(--soft)',
                  padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap',
                }}>
                  {bestWindow}
                </div>
              )}
              {showPawAlert && (
                <div style={{
                  fontSize: 11, fontWeight: 600,
                  color: 'var(--score-marginal)',
                  background: 'rgba(217,119,6,0.14)',
                  border: '1px solid rgba(217,119,6,0.35)',
                  padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap',
                }}>
                  🐾 Hot pavement
                </div>
              )}
            </div>
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
          {current?.sourceType === 'forecast_model'
            ? 'AI insight · forecast data'
            : 'AI insight powered by your live station data'}
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
            <div className="warn-card" style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              marginTop: 12, padding: '10px 12px',
              borderRadius: 10, fontSize: 12, lineHeight: 1.5,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>🐾</span>
              <div style={{ color: 'var(--ts)' }}>
                <strong style={{ color: 'var(--score-marginal)' }}>Pavement caution</strong>
                {' '}— Estimated surface ~{formatTemp(active.pavementTemp, units)} in direct sun.
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
              <button
                key={a.id}
                onClick={e => { e.stopPropagation(); setActiveId(a.id); }}
                aria-pressed={isActive}
                aria-label={`${a.label} — score ${s}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 8px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, transition: 'all var(--tr-fast)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: isActive ? 'var(--soft)' : 'var(--glass)',
                  color: isActive ? 'var(--accent)' : 'var(--ts)',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <span style={{ fontSize: 13 }}>{a.icon}</span>
                {a.short}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.8 }}>{s}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
