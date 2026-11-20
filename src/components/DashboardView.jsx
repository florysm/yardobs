import { useState, useEffect, lazy, Suspense } from 'react';
import HeroCard from './HeroCard';
import SunMoonCard from './SunMoonCard';
import MetricCard from './MetricCard';
import AlertBar from './AlertBar';
import { HourlyCard, DailyCard } from './ForecastTab';
import { buildHours, buildDays } from '../utils/forecastView';
import { placeClock, placeTimeZone } from '../utils/placeTime';
import { fmt, fmtClockTime, aqiCategory } from '../utils/format';
import { beaufort } from '../utils/weatherCalc';
import { formatTempParts, formatWindParts, formatPrecipTotal, convertTemp } from '../utils/units';
import { freshness, nextLocalHour, toDateStr } from '../utils/dateUtils';
import { DASHBOARD_SIZES, SIZE_LABELS, resolveDashboardSize } from '../utils/dashboardSize';

const DashboardTodayChart = lazy(() => import('./DashboardTodayChart'));
import { isPreviewProfile, isExploring } from '../utils/profile';

// One-screen layout for a tablet left on a stand: no tabs, nothing hidden
// behind a tap. Same data as the phone layout; App.jsx picks which to render.
// Layout lives in the .dash-* classes in index.css.
//
// Three sizes (utils/dashboardSize.js), for how far away the tablet sits:
//   large    — scaled up, with less on screen: no AI briefing or metric
//              cards, 6 hours, 3 days
//   normal   — the original layout
//   detailed — adds a "Today so far" card and the sun/moon card

const LAYOUT = {
  large:    { hours: 6,  days: 3, metrics: false, briefing: false, today: false, sunMoon: false },
  normal:   { hours: 12, days: 5, metrics: true,  briefing: true,  today: false, sunMoon: false },
  detailed: { hours: 12, days: 5, metrics: true,  briefing: true,  today: true,  sunMoon: true  },
};
const RELOAD_HOUR = 3;           // local time; see useKeepAlive
const RELOAD_CHECK_MS = 60_000;

const FRESHNESS_COLOR = {
  fresh: 'var(--tm)',
  stale: 'var(--score-marginal)',
  old:   'var(--delta-dn)',
};

function minutesAgo(date, nowMs) {
  if (!date) return 'Not updated yet';
  const mins = Math.round((nowMs - date.getTime()) / 60_000);
  if (mins < 1) return 'Updated just now';
  return `Updated ${mins} min ago`;
}

// Keeps a page that stays open for days healthy:
//  - holds a screen wake lock where the browser has one (Safari 16.4+), taking
//    it again whenever the page comes back to the front, since iOS drops it;
//  - reloads the page once a day at RELOAD_HOUR, but only after a quick check
//    that the server answers, so a Wi-Fi outage at 3am can't leave a
//    "cannot open page" screen up until someone touches it. The check runs
//    every minute instead of one long timer, because timers don't fire on time
//    after the device sleeps.
function useKeepAlive() {
  useEffect(() => {
    let lock = null;
    const acquire = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try { lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed now; retry on next visible */ }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const reloadAt = nextLocalHour(RELOAD_HOUR);
    let checking = false;
    const id = setInterval(async () => {
      if (Date.now() < reloadAt || checking || !navigator.onLine) return;
      checking = true;
      try {
        const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
        if (res.ok) window.location.reload();
      } catch { /* offline: try again next minute */ }
      checking = false;
    }, RELOAD_CHECK_MS);
    return () => clearInterval(id);
  }, []);
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// The window's size, kept current through rotation and split view, so Auto can
// switch between Normal and Detailed.
function useWindowSize() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return size;
}

// "Aa" button in the header: pick a size without opening Settings.
function SizeMenu({ sizePref, resolved, onSetSize }) {
  const [open, setOpen] = useState(false);
  if (!onSetSize) return null;
  return (
    <div style={{ position: 'relative', marginRight: 8 }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Dashboard size" aria-expanded={open}
        className="topbar-settings-btn" style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>
        Aa
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} />
          <div className="y-card" role="menu" style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 41,
            padding: 6, minWidth: 170, boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
          }}>
            {DASHBOARD_SIZES.map(sz => {
              const active = sizePref === sz;
              return (
                <button key={sz} role="menuitemradio" aria-checked={active}
                  onClick={() => { onSetSize(sz); setOpen(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', marginBottom: 2,
                    borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 14,
                    background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--tp)',
                    fontWeight: active ? 600 : 400,
                  }}>
                  {SIZE_LABELS[sz]}{sz === 'auto' ? ` (${SIZE_LABELS[resolved]})` : ''}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Detailed only: what the station has recorded since midnight.
function TodaySoFar({ stationId, fetchHistory, lastUpdated, current, high, low, units, color }) {
  const [obs, setObs] = useState(null);
  const updatedMs = lastUpdated?.getTime?.() ?? 0;
  useEffect(() => {
    if (!stationId || !fetchHistory) return;
    let live = true;
    // useWeather caches today's history and refetches it every 15 minutes.
    Promise.resolve(fetchHistory(toDateStr(new Date()))).then(o => { if (live && o) setObs(o); });
    return () => { live = false; };
  }, [stationId, fetchHistory, updatedMs]);

  if (!stationId) return null;
  const now = current?.temp ?? null;
  const hi = [high, now].filter(v => v != null);
  const lo = [low, now].filter(v => v != null);
  const hiParts = formatTempParts(hi.length ? Math.max(...hi) : null, units);
  const loParts = formatTempParts(lo.length ? Math.min(...lo) : null, units);
  const points = (obs ?? [])
    .map(o => ({ temp: convertTemp(o.imperial?.tempAvg ?? null, units) }))
    .filter(p => p.temp != null && !isNaN(p.temp));
  const stat = (label, value) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="y-label" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--tp)' }}>{value}</div>
    </div>
  );
  return (
    <div className="y-card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex' }}>
        {stat('High', `${hiParts.value}${hiParts.unit}`)}
        {stat('Low', `${loParts.value}${loParts.unit}`)}
        {stat('Rain', formatPrecipTotal(current?.precipTotal ?? null, units))}
      </div>
      {points.length > 1 && (
        <Suspense fallback={<div style={{ height: 64 }} />}>
          <div style={{ marginTop: 8 }}>
            <DashboardTodayChart points={points} color={color} />
          </div>
        </Suspense>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--tp)', marginBottom: 8 }}>
      {children}
    </div>
  );
}

export default function DashboardView({
  banner, profile, current, isLoading, error, stationId, hourlyForecast, forecast, todayObservedHigh,
  todayObservedLow, alerts, lastUpdated, units, fetchHistory, fetchHistoryDaily, onOpenAlerts, onOpenSettings,
  sizePref = 'auto', onSetSize, chartColors,
}) {
  useKeepAlive();
  const win = useWindowSize();
  const size = resolveDashboardSize(sizePref, win.w, win.h);
  const layout = LAYOUT[size];

  // One tick drives the clock and the "updated N min ago" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tz = placeTimeZone(hourlyForecast);
  const clock = placeClock(tz);
  const hours = buildHours(hourlyForecast, clock).slice(0, layout.hours);
  const days = buildDays(forecast, clock.date).slice(0, layout.days);

  const place = isExploring(profile)
    ? profile.exploring.label
    : isPreviewProfile(profile)
      ? (profile.label ?? 'Your location')
      : (current?.neighborhood ?? stationId ?? '');

  const fresh = freshness(lastUpdated, now);
  const dewPoint = formatTempParts(current?.dewPoint, units);
  const windGust = formatWindParts(current?.windGust, units);

  return (
    <div className={`dash dash--${size}`}>
      <div className="dash-header">
        <div style={{ minWidth: 0 }}>
          <div className="dash-wordmark" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.5px', color: 'var(--tp)', lineHeight: 1 }}>
            Yard<span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Obs</span>
          </div>
          <div className="dash-place" style={{ color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 4, letterSpacing: '0.3px' }}>
            {place}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', marginRight: 14 }}>
            <div className="dash-clock" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--tp)', lineHeight: 1 }}>
              {fmtClockTime(new Date(now), tz ?? undefined)}
            </div>
            <div className="dash-updated" style={{ fontFamily: 'var(--font-mono)', marginTop: 4, color: FRESHNESS_COLOR[fresh], fontWeight: fresh === 'fresh' ? 400 : 600 }}>
              {minutesAgo(lastUpdated, now)}
            </div>
          </div>
          <SizeMenu sizePref={sizePref} resolved={resolveDashboardSize('auto', win.w, win.h)} onSetSize={onSetSize} />
          <button onClick={onOpenSettings} aria-label="Open settings" className="topbar-settings-btn">
            <GearIcon />
          </button>
        </div>
      </div>

      {banner}

      {alerts?.length > 0 && (
        <div style={{ marginBottom: 14, borderRadius: 12, overflow: 'hidden' }}>
          <AlertBar alerts={alerts} onOpen={onOpenAlerts} />
        </div>
      )}

      {!current && error && !isLoading ? (
        <div className="y-card" style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--ts)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tp)', marginBottom: 4 }}>Unable to load weather data</div>
          <div style={{ fontSize: 12 }}>{error}</div>
        </div>
      ) : (
        <div className="dash-cols">
          <div className="dash-left">
            <HeroCard
              dashboard
              briefing={layout.briefing}
              current={current}
              isLoading={isLoading}
              onLongPress={onOpenSettings}
              stationId={stationId}
              fetchHistory={fetchHistory}
              fetchHistoryDaily={fetchHistoryDaily}
              hourlyForecast={hourlyForecast}
              units={units}
            />
            {layout.sunMoon && (
              <div style={{ marginTop: 16 }}>
                <SunMoonCard lat={current?.lat} lon={current?.lon} tz={tz} />
              </div>
            )}
          </div>

          <div className="dash-right">
            {layout.metrics && <div className="dash-metrics dash-section">
              <MetricCard icon="🌬️" label="Air Quality" value={fmt(current?.aqi)} unit=" AQI" trend={aqiCategory(current?.aqi)} />
              <MetricCard icon="🌡️" label="Dew Point" value={dewPoint.value} unit={dewPoint.unit} />
              <MetricCard icon="💨" label="Wind Gust" value={windGust.value} unit={windGust.unit} trend={current?.windGust != null ? beaufort(current.windGust) : undefined} />
            </div>}

            <div className="dash-section">
              <SectionTitle>Next {layout.hours} hours</SectionTitle>
              {hours.length ? (
                <div className={`dash-hours dash-hours--${layout.hours}`}>
                  {hours.map(hr => <HourlyCard key={hr.time} hr={hr} units={units} />)}
                </div>
              ) : (
                <div className="y-card" style={{ fontSize: 13, color: 'var(--tm)', textAlign: 'center' }}>Hourly forecast loading…</div>
              )}
            </div>

            <div className="dash-section">
              <SectionTitle>{layout.days}-day forecast</SectionTitle>
              {days.length ? (
                <div className={`dash-days dash-days--${layout.days}`}>
                  {days.map(day => (
                    <DailyCard
                      key={day.date}
                      day={day}
                      isSelected={false}
                      currentTemp={current?.temp ?? null}
                      todayObservedHigh={todayObservedHigh}
                      units={units}
                    />
                  ))}
                </div>
              ) : (
                <div className="y-card" style={{ fontSize: 13, color: 'var(--tm)', textAlign: 'center' }}>Forecast loading…</div>
              )}
            </div>

            {layout.today && stationId && (
              <div className="dash-section">
                <SectionTitle>Today so far</SectionTitle>
                <TodaySoFar
                  stationId={stationId}
                  fetchHistory={fetchHistory}
                  lastUpdated={lastUpdated}
                  current={current}
                  high={todayObservedHigh}
                  low={todayObservedLow}
                  units={units}
                  color={chartColors?.accent ?? '#888'}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
