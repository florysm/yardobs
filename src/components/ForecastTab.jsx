import { useRef, useState, useEffect } from 'react';
import SunCalc from 'suncalc';
import { fmt, fmtHourIso, fmtSunTime, fmtMoonTime } from '../utils/format';
import { ICON_EMOJI } from '../utils/weatherIcons';


const WMO_EMOJI = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌧️', 55:'🌧️', 56:'🌧️', 57:'🌧️',
  61:'🌦️', 63:'🌧️', 65:'🌧️', 66:'🌧️', 67:'🌧️',
  71:'🌨️', 73:'🌨️', 75:'❄️', 77:'❄️',
  80:'🌦️', 81:'🌧️', 82:'🌧️', 85:'🌨️', 86:'❄️',
  95:'⛈️', 96:'⛈️', 99:'⛈️',
};

// WMO codes with sun icons — night overrides (no standard moon-with-cloud emoji)
const NIGHT_ICON = { 0: '🌙', 1: '🌙', 2: '☁️' };

function buildHours(hf) {
  const h = hf?.hourly;
  if (!h?.time?.length) return [];
  const now = Date.now();

  // Build per-date sunrise/sunset lookup from daily data
  const sunMap = {};
  (hf?.daily?.sunrise ?? []).forEach((r, i) => {
    const set = hf?.daily?.sunset?.[i];
    if (r && set) sunMap[r.slice(0, 10)] = { riseMs: new Date(r).getTime(), setMs: new Date(set).getTime() };
  });

  return h.time
    .map((t, i) => {
      const ms = new Date(t).getTime();
      const sun = sunMap[t.slice(0, 10)];
      const isNight = sun ? (ms < sun.riseMs || ms > sun.setMs) : false;
      const code = h.weathercode?.[i];
      const icon = (isNight && code in NIGHT_ICON) ? NIGHT_ICON[code] : (WMO_EMOJI[code] ?? '🌡️');
      return { time: t, ms, icon, temp: h.temperature_2m?.[i], pop: h.precipitation_probability?.[i] ?? 0 };
    })
    .filter(hr => hr.ms >= now - 30 * 60 * 1000)
    .slice(0, 24)
    .map((hr, i) => ({ ...hr, isNow: i === 0 }));
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
          : `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${d.getDate()}`,
        hours: [],
      };
      groups.push(current);
    }
    current.hours.push(hr);
  }
  return groups;
}

function buildDays(forecast) {
  if (!forecast) return [];
  const { dayOfWeek = [], temperatureMax = [], temperatureMin = [], daypart = [] } = forecast;
  const icons = daypart?.[0]?.iconCode ?? [];
  const pops  = daypart?.[0]?.precipChance ?? [];
  return dayOfWeek.map((dow, i) => ({
    dayOfWeek: dow,
    tempMax:   temperatureMax[i],
    tempMin:   temperatureMin[i],
    icon:      ICON_EMOJI[icons[i * 2] ?? icons[i]] ?? '🌡️',
    pop:       pops[i * 2] ?? pops[i],
    isToday:   i === 0,
  }));
}

function fmtDaylight(riseStr, setStr) {
  if (!riseStr || !setStr) return null;
  const mins = Math.round((new Date(setStr) - new Date(riseStr)) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m daylight`;
}


function resolveMoonWindow(lat, lon) {
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

export default function ForecastTab({ forecast, isLoading, chartColors, hourlyForecast, lat, lon }) {
  const scrollRef = useRef(null);
  const groupRefs = useRef([]);
  const [activeLabel, setActiveLabel] = useState(null);

  const groups = groupByDay(hourlyForecast ? buildHours(hourlyForecast) : []);

  useEffect(() => {
    if (groups.length > 0) setActiveLabel(groups[0].label);
  // groups is derived from hourlyForecast every render; using it as a dep would
  // trigger this effect on every render. hourlyForecast is the true signal.
  }, [hourlyForecast]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {!hourlyForecast ? <HourSkeleton /> : (
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
            style={{ display: 'flex', overflowX: 'auto', paddingBottom: 4, marginBottom: 20, alignItems: 'flex-start' }}
          >
            {groups.map((group, gi) => (
              <div
                key={group.date}
                ref={el => { groupRefs.current[gi] = el; }}
                style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: gi > 0 ? 16 : 0 }}
              >
                {group.hours.map((hr) => (
                  <div
                    key={hr.time}
                    className="fc-card"
                    style={{
                      flex: '0 0 56px',
                      padding: '10px 6px',
                      textAlign: 'center',
                      ...(hr.isNow ? { background: 'var(--soft)', borderColor: 'var(--accent)' } : {}),
                    }}
                  >
                    <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>
                      {hr.isNow ? 'Now' : fmtHourIso(hr.time)}
                    </div>
                    <div style={{ fontSize: 20, margin: '6px 0 3px' }} aria-hidden="true">{hr.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
                      {fmt(hr.temp)}°
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 3, visibility: hr.pop > 0 ? 'visible' : 'hidden' }}>
                      {hr.pop}%
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--tp)', marginBottom: 12, marginTop: 4 }}>
        7-Day Forecast
      </div>

      {/* Horizontal scroll cards */}
      <div className="fc-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 14 }}>
        {days.map((day, i) => (
          <div
            key={i}
            className="fc-card"
            style={{
              flex: '0 0 70px',
              padding: '12px 8px',
              textAlign: 'center',
              cursor: 'default',
              ...(day.isToday ? { background: 'var(--soft)', borderColor: 'var(--accent)' } : {}),
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--tm)', letterSpacing: 1, textTransform: 'uppercase' }}>
              {day.isToday ? 'Today' : (day.dayOfWeek ?? '').slice(0, 3)}
            </div>
            <div style={{ fontSize: 22, margin: '8px 0 4px' }} aria-hidden="true">{day.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)' }}>
              {fmt(day.tempMax)}°
            </div>
            <div style={{ fontSize: 11, color: 'var(--tm)', fontFamily: 'var(--font-mono)' }}>
              {fmt(day.tempMin)}°
            </div>
            {day.pop != null && (
              <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 4 }}>{day.pop}%</div>
            )}
          </div>
        ))}
      </div>

      {/* Sunrise / Sunset — arc progress; flips to Moon card after dusk */}
      {hourlyForecast?.daily && (() => {
        const rise = hourlyForecast.daily.sunrise?.[0];
        const set  = hourlyForecast.daily.sunset?.[0];
        const daylight = fmtDaylight(rise, set);
        const sunTimes = (lat != null && lon != null)
          ? SunCalc.getTimes(new Date(), lat, lon)
          : null;

        const dusk = sunTimes?.dusk;
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
