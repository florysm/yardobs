import { useRef, useState, useEffect } from 'react';
import SunCalc from 'suncalc';
import { fmtHourIso, fmtSunTime, fmtMoonTime, getLocaleHour12 } from '../utils/format';
import { ICON_EMOJI, WMO_EMOJI, NIGHT_ICON } from '../utils/weatherIcons';
import { toISODate } from '../utils/dateUtils';
import { STORAGE_KEYS, INSIGHT_TTL_MS } from '../utils/storageKeys';
import { formatTempParts, convertTemp } from '../utils/units';
import { shortHour, dayPartRange } from '../utils/insightVocab';
import { aqiForDay } from '../utils/forecastNormalize';

function buildHours(hf, lat, lon) {
  const h = hf?.hourly;
  if (!h?.time?.length) return [];
  const now = Date.now();

  const sunMap = {};
  [...new Set(h.time.map(t => t.slice(0, 10)))].forEach(dateStr => {
    if (lat == null || lon == null) return;
    const { sunrise, sunset } = SunCalc.getTimes(new Date(dateStr + 'T12:00'), lat, lon);
    sunMap[dateStr] = { riseMs: sunrise.getTime(), setMs: sunset.getTime() };
  });

  return h.time
    .map((t, i) => {
      const ms = new Date(t).getTime();
      const sun = sunMap[t.slice(0, 10)];
      const isNight = sun ? (ms < sun.riseMs || ms > sun.setMs) : false;
      const code = h.weathercode?.[i];
      const pop  = h.precipitation_probability?.[i] ?? 0;
      const displayCode = (code >= 51 && pop < 30) ? 3 : (code === 95 && pop < 40) ? 80 : code;
      const icon = (isNight && displayCode in NIGHT_ICON) ? NIGHT_ICON[displayCode] : (WMO_EMOJI[displayCode] ?? '🌡️');
      return { time: t, ms, icon, temp: h.temperature_2m?.[i], pop };
    })
    .filter(hr => hr.ms >= now - 30 * 60 * 1000)
    .slice(0, 24)
    .map((hr, i) => ({ ...hr, isNow: i === 0 }));
}

// Matches HourlyCard's `flex: '0 0 56px'` and .fc-hourly-group's `gap: 8`.
const HOUR_CARD_W = 56;
const HOUR_CARD_GAP = 8;
const HOUR_GROUP_MARGIN = 16; // marginLeft applied to every group after the first

function groupWidthPx(hourCount) {
  return hourCount * HOUR_CARD_W + Math.max(0, hourCount - 1) * HOUR_CARD_GAP;
}

function groupByDay(hours) {
  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
  const groups = [];
  let current = null;
  for (const hr of hours) {
    const date = hr.time.slice(0, 10);
    if (!current || current.date !== date) {
      const d = new Date(date + 'T12:00:00');
      current = {
        date,
        label: date === todayStr
          ? 'Today'
          : `${d.toLocaleDateString(navigator.language, { weekday: 'long' })} ${d.getDate()}`,
        hours: [],
      };
      groups.push(current);
    }
    current.hours.push(hr);
  }
  return groups;
}

// `forecast` arrives already normalized from useWeather (see forecastNormalize.js),
// so this only adds presentation: the emoji and the isToday flag. Vendor quirks —
// TWC's day/night interleaved dayparts, Open-Meteo's WMO codes — are handled there.
function buildDays(forecast) {
  if (!forecast?.length) return [];
  const todayStr = toISODate(new Date());
  return forecast.map(day => ({
    ...day,
    icon:    ICON_EMOJI[day.iconCode] ?? '🌡️',
    isToday: day.date === todayStr,
  }));
}


// Compact hourly temp curve for one day, e.g. "1a 64, 4a 61, 7a 66, 10a 78…".
// Sampled every 3 hours across the whole day so the dawn minimum is visible —
// with only a daily high/low the model had to guess the shape, and guessed that
// the low arrives in the evening. Values are bare numbers; the prompt states the
// unit once rather than repeating "°F" eight times.
//
// Returns a pre-formatted string on purpose: clampBody (api/lib/sanitize.js)
// silently truncates arrays at 20 elements, so a 24-entry array would lose hours
// with no error. This stays well inside the 500-char string cap.
export function buildTrajectory(hf, dateStr, units) {
  const h = hf?.hourly;
  if (!h?.time?.length) return null;
  const parts = [];
  h.time.forEach((t, i) => {
    if (!t.startsWith(dateStr)) return;
    const hour = parseInt(t.split('T')[1], 10);
    if (hour % 3 !== 1) return; // 1a, 4a, 7a, 10a, 1p, 4p, 7p, 10p
    const temp = h.temperature_2m?.[i];
    if (temp == null) return;
    parts.push(`${shortHour(hour)} ${Math.round(convertTemp(temp, units))}`);
  });
  return parts.length ? parts.join(', ') : null;
}

const RAIN_LIKELY_PCT = 30;

// When rain is likely and how likely it gets, e.g.
// "overnight (12a–3a), peaking at 80%".
//
// The day-part name is resolved here rather than left to the model: given a bare
// "12a–3a" it reasons that a.m. means morning and writes "thunderstorms Sunday
// morning between midnight and 3 a.m." — true, but not how anyone speaks.
//
// Scans every hour rather than sampling: a shower confined to 2–3pm would fall
// between the 3-hour temperature samples and vanish. Null on a dry day, so the
// prompt can stay silent instead of asserting a timing it doesn't have.
export function buildPrecipWindow(hf, dateStr) {
  const h = hf?.hourly;
  if (!h?.time?.length) return null;
  let first = null, last = null, peak = 0;
  h.time.forEach((t, i) => {
    if (!t.startsWith(dateStr)) return;
    const prob = h.precipitation_probability?.[i];
    if (prob == null || prob < RAIN_LIKELY_PCT) return;
    const hour = parseInt(t.split('T')[1], 10);
    if (first === null) first = hour;
    last = hour;
    if (prob > peak) peak = prob;
  });
  if (first === null) return null;
  const span = first === last ? shortHour(first) : `${shortHour(first)}–${shortHour(last + 1)}`;
  return `${dayPartRange(first, last)} (${span}), peaking at ${peak}%`;
}

function fmtDaylight(riseStr, setStr) {
  if (!riseStr || !setStr) return null;
  const mins = Math.round((new Date(setStr) - new Date(riseStr)) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m daylight`;
}


function resolveMoonWindow(lat, lon) {
  if (lat == null || lon == null) return { rise: null, set: null, moonUp: false, alwaysUp: false, alwaysDown: false };
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const t  = SunCalc.getMoonTimes(today,    lat, lon);
  const tm = SunCalc.getMoonTimes(tomorrow, lat, lon);
  const moonUp = SunCalc.getMoonPosition(today, lat, lon).altitude > 0;
  return {
    rise:       t.rise  ?? null,
    set:        t.set   ?? tm.set ?? null,
    moonUp,
    alwaysUp:   t.alwaysUp   ?? false,
    alwaysDown: t.alwaysDown ?? false,
  };
}

function moonPhaseName(phase) {
  if (phase < 0.0625 || phase >= 0.9375) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  return 'Waning Crescent';
}

function MoonPhaseIcon({ phase, cx, cy, r = 9 }) {
  const offX = r * Math.cos(phase * 2 * Math.PI);
  const isWaxing = phase < 0.5;
  const clipX = isWaxing ? cx - r : cx;
  const id = `moon-clip-${Math.round(phase * 1000)}`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 3} fill="rgba(176,196,222,0.15)" />
      <circle cx={cx} cy={cy} r={r} fill="#dce8f5" />
      <clipPath id={id}>
        <rect x={clipX} y={cy - r} width={r} height={r * 2} />
      </clipPath>
      <circle cx={cx + offX} cy={cy} r={r} fill="#1e2840" clipPath={`url(#${id})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(176,196,222,0.35)" strokeWidth="0.5" />
    </g>
  );
}

function HourlyCard({ hr, units }) {
  return (
    <div
      className="fc-card"
      style={{
        flex: '0 0 56px',
        padding: '10px 6px',
        textAlign: 'center',
        ...(hr.isNow ? { background: 'var(--soft)', borderColor: 'var(--accent)' } : {}),
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        {hr.isNow ? 'Now' : fmtHourIso(hr.time)}
      </div>
      <div style={{ fontSize: 20, margin: '6px 0 3px' }} aria-hidden="true">{hr.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
        {formatTempParts(hr.temp, units).value}°
      </div>
      <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 3, visibility: hr.pop > 0 ? 'visible' : 'hidden' }}>
        {hr.pop}%
      </div>
    </div>
  );
}

function DailyCard({ day, isSelected, onClick, currentTemp, todayObservedHigh, units }) {
  return (
    <div
      className="fc-card"
      onClick={onClick}
      style={{
        flex: '0 0 70px',
        padding: '12px 8px',
        textAlign: 'center',
        cursor: 'pointer',
        ...(isSelected ? { background: 'var(--soft)', borderColor: 'var(--accent)' } : {}),
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>
        {day.isToday ? 'Today' : (day.dayOfWeek ?? '').slice(0, 3)}
      </div>
      <div style={{ fontSize: 22, margin: '8px 0 4px' }} aria-hidden="true">{day.icon}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
        {formatTempParts(day.isToday
          ? (currentTemp != null && currentTemp >= (day.tempMax ?? -Infinity)
              ? Math.max(currentTemp, todayObservedHigh ?? currentTemp)
              : (day.tempMax ?? todayObservedHigh))
          : day.tempMax, units).value}°
      </div>
      <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>
        {formatTempParts(day.tempMin, units).value}°
      </div>
      {day.pop != null && (
        <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 4 }}>{day.pop}%</div>
      )}
    </div>
  );
}

function HourSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 20 }}>
      {[0,1,2,3,4,5,6].map(i => (
        <div key={i} style={{
          flex: '0 0 56px', height: 100, borderRadius: 16,
          background: 'var(--card)', border: '1px solid var(--border)',
          opacity: 0.4, animation: 'pulse 1.5s infinite',
        }} />
      ))}
    </div>
  );
}

function Skeleton() {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{
            flex: '0 0 70px', height: 140, borderRadius: 16,
            background: 'var(--card)', border: '1px solid var(--border)',
            opacity: 0.4, animation: 'pulse 1.5s infinite',
          }} />
        ))}
      </div>
    </div>
  );
}

function ForecastDayInsight({ insight, isLoading }) {
  return (
    <div className="y-card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <div className="live-dot" style={{ background: 'var(--tm)' }} />
        <div style={{ fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--tm)' }}>AI</div>
      </div>
      {isLoading ? (
        <div style={{ fontSize: 14, color: 'var(--tm)', fontStyle: 'italic', lineHeight: 1.65 }}>
          Analyzing forecast…
        </div>
      ) : insight?.narrative ? (
        <>
          <p style={{ fontSize: 14, color: 'var(--tp)', lineHeight: 1.65, margin: '0 0 10px', fontWeight: 300, fontFamily: 'var(--font-body)' }}>
            {insight.narrative}
          </p>
          <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: '0.3px' }}>
            {insight.updatedAt ? `Updated ${insight.updatedAt} · refreshes hourly` : 'Refreshes hourly'}
          </div>
        </>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--tm)', fontStyle: 'italic', margin: 0 }}>
          Forecast insight unavailable right now.
        </p>
      )}
    </div>
  );
}

export default function ForecastTab({ forecast, isLoading, chartColors, hourlyForecast, airQuality, lat, lon, todayObservedHigh, stationId, sourceType, currentTemp, units }) {
  const scrollRef = useRef(null);
  const groupRefs = useRef([]);
  const [activeLabel, setActiveLabel] = useState(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [dayInsight, setDayInsight] = useState(null);
  const [dayInsightLoading, setDayInsightLoading] = useState(false);
  const dayInsightCancelRef = useRef(null);

  const groups = groupByDay(hourlyForecast ? buildHours(hourlyForecast, lat, lon) : []);

  useEffect(() => {
    if (groups.length > 0) setActiveLabel(groups[0].label);
  // groups is derived from hourlyForecast every render; using it as a dep would
  // trigger this effect on every render. hourlyForecast is the true signal.
  }, [hourlyForecast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const days = buildDays(forecast);
    if (!days.length) return;
    const day = days[selectedDayIndex];
    if (!day) return;

    const insightId = stationId || 'preview';
    const dayAqi = aqiForDay(airQuality, day.date);
    // Same 25-wide bucket the server keys on, so client and server invalidate together.
    const aqiBucket = dayAqi == null ? 'na' : Math.round(dayAqi / 25) * 25;
    const lsKey = STORAGE_KEYS.forecastDayInsightKey(insightId, day.date, units, aqiBucket);

    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (Date.now() - ts < INSIGHT_TTL_MS) {
          setDayInsight(data);
          setDayInsightLoading(false);
          return;
        }
      }
    } catch {}

    if (dayInsightCancelRef.current) dayInsightCancelRef.current.cancelled = true;
    const cancelToken = { cancelled: false };
    dayInsightCancelRef.current = cancelToken;

    setDayInsightLoading(true);
    setDayInsight(null);

    (async () => {
      try {
        const res = await fetch('/api/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'forecast-day',
            stationId: insightId,
            date: day.date,
            dayLabel: day.isToday ? 'Today' : day.dayOfWeek,
            tempMax: day.tempMax,
            tempMin: day.tempMin,
            pop: day.pop,
            conditions: day.phrase,
            trajectory: buildTrajectory(hourlyForecast, day.date, units),
            precipWindow: buildPrecipWindow(hourlyForecast, day.date),
            aqi: dayAqi,
            sourceType: sourceType ?? 'pws',
            units,
          }),
        });
        if (!res.ok) throw new Error(res.status);
        const json = await res.json();
        if (cancelToken.cancelled) return;
        const updatedAt = new Date().toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12() });
        const stored = { narrative: json.narrative ?? '', updatedAt };
        try { localStorage.setItem(lsKey, JSON.stringify({ data: stored, ts: Date.now() })); } catch {}
        setDayInsight(stored);
      } catch {
        if (!cancelToken.cancelled) setDayInsight({ narrative: '', updatedAt: '' });
      } finally {
        if (!cancelToken.cancelled) setDayInsightLoading(false);
      }
    })();

    return () => { cancelToken.cancelled = true; };
  // hourlyForecast and airQuality are deps because the trajectory and the AQI
  // sent to the model are derived from them — both arrive after `forecast`, and
  // without them the first request for a day goes out missing that detail.
  }, [selectedDayIndex, forecast, hourlyForecast, airQuality, stationId, sourceType, units]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <Skeleton />;

  if (!forecast) {
    return (
      <div className="y-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{ fontSize: 13, color: 'var(--tm)' }}>Forecast unavailable</div>
        <div style={{ fontSize: 11, color: 'var(--tm)', opacity: 0.6, marginTop: 4 }}>
          Opens after current conditions load
        </div>
      </div>
    );
  }

  const days = buildDays(forecast);

  function handleHourlyScroll() {
    if (!scrollRef.current) return;
    const { scrollLeft, clientWidth } = scrollRef.current;
    const center = scrollLeft + clientWidth / 2;
    let label = groups[0]?.label ?? null;
    groupRefs.current.forEach((ref, i) => {
      if (ref && ref.offsetLeft <= center) label = groups[i]?.label ?? label;
    });
    if (label) setActiveLabel(label);
  }

  return (
    <div>
      {/* Hourly section */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 8, marginTop: 4 }}>
        Hourly Forecast
      </div>
      {!hourlyForecast ? (
        <div className="y-card" style={{ textAlign: 'center', padding: '24px 16px' }}>
          <div style={{ fontSize: 13, color: 'var(--tm)' }}>Hourly forecast unavailable</div>
        </div>
      ) : (
        <>
          <div style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            textTransform: 'uppercase', color: 'var(--tm)', marginBottom: 8,
            fontFamily: 'var(--font-display)', transition: 'opacity var(--tr-fast)',
          }}>
            {activeLabel ?? groups[0]?.label ?? ''}
          </div>
          <div
            ref={scrollRef}
            onScroll={handleHourlyScroll}
            style={{ overflowX: 'auto', paddingBottom: 4, marginBottom: 20, width: '100%' }}
          >
            {/* Layout lives in .fc-hourly-track / .fc-hourly-group (index.css),
                sized here with explicit pixel widths — see the comment there.
                Do not go back to letting width resolve from content (max-content
                or inline-flex shrink-to-fit): the overnight cards overlap on iOS
                Safari, and only on iOS Safari. */}
            <div
              className="fc-hourly-track"
              style={{
                width: groups.reduce((sum, g) => sum + groupWidthPx(g.hours.length), 0)
                  + Math.max(0, groups.length - 1) * HOUR_GROUP_MARGIN,
              }}
            >
            {groups.map((group, gi) => (
              <div
                key={group.date}
                ref={el => { groupRefs.current[gi] = el; }}
                className="fc-hourly-group"
                style={{ width: groupWidthPx(group.hours.length), marginLeft: gi > 0 ? HOUR_GROUP_MARGIN : 0 }}
              >
                {group.hours.map((hr) => (
                  <HourlyCard key={hr.time} hr={hr} units={units} />
                ))}
              </div>
            ))}
            </div>
          </div>
        </>
      )}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 12, marginTop: 4 }}>
        Daily Forecast
      </div>

      {/* Horizontal scroll cards */}
      <div className="fc-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {days.map((day, i) => (
          <DailyCard
            key={i}
            day={day}
            isSelected={i === selectedDayIndex}
            onClick={() => setSelectedDayIndex(i)}
            currentTemp={currentTemp}
            todayObservedHigh={todayObservedHigh}
            units={units}
          />
        ))}
      </div>

      <ForecastDayInsight insight={dayInsight} isLoading={dayInsightLoading} />

      {/* Sunrise / Sunset — arc progress; flips to Moon card after dusk */}
      {lat != null && lon != null && (() => {
        const sunTimes = SunCalc.getTimes(new Date(), lat, lon);
        const rise = sunTimes.sunrise.toISOString();
        const set  = sunTimes.sunset.toISOString();
        const daylight = fmtDaylight(rise, set);

        const dusk = sunTimes.dusk;
        const showMoon = dusk instanceof Date && isFinite(dusk) && Date.now() > dusk.getTime();

        // ── SUN CARD ──────────────────────────────────────────────────────────
        if (!showMoon) {
          const riseMs = rise ? new Date(rise).getTime() : null;
          const setMs  = set  ? new Date(set).getTime()  : null;
          const rawProgress = (riseMs && setMs) ? (Date.now() - riseMs) / (setMs - riseMs) : null;
          const progress = rawProgress != null ? Math.max(0, Math.min(0.9999, rawProgress)) : null;
          const cx = 100, cy = 84, r = 74;
          const dotX = progress != null ? cx + r * Math.cos(Math.PI * (1 - progress)) : null;
          const dotY = progress != null ? cy - r * Math.sin(Math.PI * (1 - progress)) : null;

          return (
            <div className="y-card">
              <div className="y-label">Sun</div>

              <svg viewBox="0 0 200 88" style={{ width: '100%', display: 'block' }}>
                <path
                  d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                  fill="none" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"
                />
                {progress != null && progress > 0 && dotX != null && dotY != null && (
                  <path
                    d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${dotX} ${dotY}`}
                    fill="none" stroke="#f5c518" strokeWidth="2" strokeLinecap="round"
                  />
                )}
                <line x1={cx - r - 8} y1={cy} x2={cx + r + 8} y2={cy} stroke="var(--border)" strokeWidth="1" />
                {dotX != null && dotY != null && (
                  <g transform={`translate(${dotX}, ${dotY})`}>
                    <circle r="11" fill="rgba(245,197,24,0.18)" />
                    {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
                      const rad = (deg * Math.PI) / 180;
                      return (
                        <line key={deg}
                          x1={Math.cos(rad) * 6} y1={Math.sin(rad) * 6}
                          x2={Math.cos(rad) * 9} y2={Math.sin(rad) * 9}
                          stroke="#f5c518" strokeWidth="1.5" strokeLinecap="round"
                        />
                      );
                    })}
                    <circle r="4" fill="#f5c518" />
                  </g>
                )}
              </svg>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                    {fmtSunTime(rise)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>
                    Sunrise
                  </div>
                  {sunTimes && (
                    <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 3, opacity: 0.7 }}>
                      {fmtSunTime(sunTimes.dawn)} first light
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                    {fmtSunTime(set)}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>
                    Sunset
                  </div>
                  {sunTimes && (
                    <div style={{ fontSize: 9, color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 3, opacity: 0.7 }}>
                      last light {fmtSunTime(sunTimes.dusk)}
                    </div>
                  )}
                </div>
              </div>

              {daylight && (
                <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
                  {daylight}
                </div>
              )}
            </div>
          );
        }

        // ── MOON CARD ─────────────────────────────────────────────────────────
        const moonWindow = resolveMoonWindow(lat, lon);
        const moonIllum  = SunCalc.getMoonIllumination(new Date());
        const moonRiseMs = moonWindow.rise?.getTime() ?? null;
        const moonSetMs  = moonWindow.set?.getTime()  ?? null;
        const moonRaw    = (moonRiseMs && moonSetMs) ? (Date.now() - moonRiseMs) / (moonSetMs - moonRiseMs) : null;
        const moonProgress = moonRaw != null ? Math.max(0, Math.min(0.9999, moonRaw)) : null;

        const cx = 100, cy = 84, r = 74;
        const moonDotX = moonProgress != null ? cx + r * Math.cos(Math.PI * (1 - moonProgress)) : null;
        const moonDotY = moonProgress != null ? cy - r * Math.sin(Math.PI * (1 - moonProgress)) : null;
        const phaseName = moonPhaseName(moonIllum.phase);
        const illumPct  = Math.round(moonIllum.fraction * 100);

        return (
          <div className="y-card">
            <div className="y-label">Moon</div>

            <svg viewBox="0 0 200 88" style={{ width: '100%', display: 'block' }}>
              <path
                d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"
              />
              {moonProgress != null && moonProgress > 0 && moonDotX != null && moonDotY != null && (
                <path
                  d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${moonDotX} ${moonDotY}`}
                  fill="none" stroke="#b0c4de" strokeWidth="2" strokeLinecap="round"
                />
              )}
              <line x1={cx - r - 8} y1={cy} x2={cx + r + 8} y2={cy} stroke="var(--border)" strokeWidth="1" />
              {moonDotX != null && moonDotY != null && (
                <MoonPhaseIcon phase={moonIllum.phase} cx={moonDotX} cy={moonDotY} r={9} />
              )}
            </svg>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                  {moonWindow.alwaysDown ? '--'
                    : moonWindow.rise ? fmtMoonTime(moonWindow.rise)
                    : moonWindow.moonUp ? 'Already up' : '--'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>
                  Moonrise
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tp)' }}>{phaseName}</div>
                <div style={{ fontSize: 9, color: 'var(--tm)', marginTop: 1 }}>{illumPct}% illuminated</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                  {moonWindow.alwaysUp ? 'Always up'
                    : moonWindow.alwaysDown ? 'Always down'
                    : fmtMoonTime(moonWindow.set)}
                </div>
                <div style={{ fontSize: 9, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>
                  Moonset
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--tm)', fontFamily: 'var(--font-mono)', padding: '6px 0 4px', letterSpacing: '0.3px' }}>
        TWC Daily Forecast API
      </div>
    </div>
  );
}
