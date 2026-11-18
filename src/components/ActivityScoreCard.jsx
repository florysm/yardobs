import { useState, useMemo } from 'react';
import { fmtHourShort } from '../utils/format';
import { ACTIVITIES, DEFAULT_ACTIVITY_ID } from '../utils/activities';
import { STORAGE_KEYS } from '../utils/storageKeys';
import { SOURCE_TYPES } from '../utils/sourceTypes';
import { insightScope } from '../utils/insightCache';
import { useInsight } from '../hooks/useInsight';
import { placeClock, placeTimeZone } from '../utils/placeTime';
import { currentDayPart } from '../utils/insightVocab';
import { buildDayOutlook } from '../utils/outlook';
import { formatTemp } from '../utils/units';
import {
  isNotableWeatherChange, computeAllScores, getForecastRainThreat,
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
                // scoreColor() returns a CSS var, so fade with opacity — appending
                // a hex alpha ("var(--x)66") is invalid CSS and drops the bar.
                background: color,
                opacity: isPeak ? 1 : 0.4,
                transition: 'height 0.5s ease, background 0.3s, opacity 0.3s',
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

export default function ActivityScoreCard({ current, hourlyForecast, defaultActivity, units }) {
  const [activeId,       setActiveId]       = useState(defaultActivity ?? DEFAULT_ACTIVITY_ID);
  const [expanded,       setExpanded]       = useState(false);

  // The forecast's place clock, not the device's: exploring another time zone,
  // "today" and "hours still ahead" are that place's. Read every render so the
  // memos below move on as the hour turns, not only when the forecast refreshes.
  const clock = placeClock(placeTimeZone(hourlyForecast));
  const { rate: forecastRate, maxProb: forecastMaxProb } = useMemo(
    () => getForecastRainThreat(hourlyForecast, clock.hour, clock.date),
    [hourlyForecast, clock.hour, clock.date]
  );
  // Rest of today by day part — the Activity card is the one that answers
  // "when should I go", so it's the one that gets the timing detail. Recomputed
  // whenever the hourly forecast refreshes (hourly, see useWeather).
  const outlook = useMemo(
    () => buildDayOutlook(hourlyForecast, clock.date, units, { fromHour: clock.hour }),
    [hourlyForecast, units, clock.date, clock.hour]
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
  const arcData   = useMemo(
    () => getArcData(hourlyForecast, activeId, current, clock.date),
    [hourlyForecast, activeId, current, clock.date]
  );
  const bestWindow = useMemo(() => getBestWindow(arcData, clock.hour), [arcData, clock.hour]);
  const act = ACTIVITIES.find(a => a.id === activeId);

  const showPawAlert = activeId === 'dogwalk' && (active.pavementTemp ?? 0) >= 100;

  // AI insight for the active activity. Debounced so rapid successive updates
  // (current then hourlyForecast arriving) send one request. A saved insight is
  // reused for the hour unless the weather has changed notably since.
  const snapshot = currentWithThreat ? {
    temp: currentWithThreat.temp ?? 70,
    windSpeed: currentWithThreat.windSpeed ?? 0,
    rainThreat: currentWithThreat.rainThreat ?? 0,
    score: active.score,
  } : null;
  const period = currentDayPart(clock.wall);
  const insightId = insightScope(current);
  const { data: insight, loading: insightLoading } = useInsight({
    storageKey: STORAGE_KEYS.activityInsightKey(insightId, activeId, period, units),
    enabled: !!currentWithThreat,
    debounceMs: 400,
    deps: [currentWithThreat, outlook, bestWindow],
    meta: () => snapshot,
    isStale: saved => isNotableWeatherChange({ conditions: saved }, snapshot),
    buildBody: async () => ({
      activity: activeId,
      activityLabel: act?.label,
      score: active.score,
      factors: active.factors,
      stationId: insightId,
      sourceType: current?.sourceType,
      period,
      units,
      current: {
        ...currentWithThreat,
        ...(activeId === 'dogwalk' && active.pavementTemp != null
          ? { pavementTemp: active.pavementTemp }
          : {}),
      },
      outlook,
      bestWindow,
    }),
    accept: json => json?.insight || null,
  });

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
          {current?.sourceType === SOURCE_TYPES.FORECAST_MODEL
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
