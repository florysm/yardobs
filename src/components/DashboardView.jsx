import { useState, useEffect } from 'react';
import HeroCard from './HeroCard';
import MetricCard from './MetricCard';
import AlertBar from './AlertBar';
import { HourlyCard, DailyCard } from './ForecastTab';
import { buildHours, buildDays } from '../utils/forecastView';
import { placeClock, placeTimeZone } from '../utils/placeTime';
import { fmt, fmtClockTime, aqiCategory } from '../utils/format';
import { beaufort } from '../utils/weatherCalc';
import { formatTempParts, formatWindParts } from '../utils/units';
import { freshness, nextLocalHour } from '../utils/dateUtils';
import { isPreviewProfile, isExploring } from '../utils/profile';

// One-screen layout for a tablet left on a stand: no tabs, nothing hidden
// behind a tap. Same data as the phone layout; App.jsx picks which to render.
// Layout lives in the .dash-* classes in index.css.

const HOURS_SHOWN = 12;
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

function SectionTitle({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, color: 'var(--tp)', marginBottom: 8 }}>
      {children}
    </div>
  );
}

export default function DashboardView({
  banner, profile, current, isLoading, error, stationId, hourlyForecast, forecast, todayObservedHigh,
  alerts, lastUpdated, units, fetchHistory, fetchHistoryDaily, onOpenAlerts, onOpenSettings,
}) {
  useKeepAlive();

  // One tick drives the clock and the "updated N min ago" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tz = placeTimeZone(hourlyForecast);
  const clock = placeClock(tz);
  const hours = buildHours(hourlyForecast, clock).slice(0, HOURS_SHOWN);
  const days = buildDays(forecast, clock.date).slice(0, 5);

  const place = isExploring(profile)
    ? profile.exploring.label
    : isPreviewProfile(profile)
      ? (profile.label ?? 'Your location')
      : (current?.neighborhood ?? stationId ?? '');

  const fresh = freshness(lastUpdated, now);
  const dewPoint = formatTempParts(current?.dewPoint, units);
  const windGust = formatWindParts(current?.windGust, units);

  return (
    <div className="dash">
      <div className="dash-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.5px', color: 'var(--tp)', lineHeight: 1 }}>
            Yard<span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>Obs</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--tm)', fontFamily: 'var(--font-mono)', marginTop: 4, letterSpacing: '0.3px' }}>
            {place}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ textAlign: 'right', marginRight: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 600, color: 'var(--tp)', lineHeight: 1 }}>
              {fmtClockTime(new Date(now), tz ?? undefined)}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 4, color: FRESHNESS_COLOR[fresh], fontWeight: fresh === 'fresh' ? 400 : 600 }}>
              {minutesAgo(lastUpdated, now)}
            </div>
          </div>
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
              current={current}
              isLoading={isLoading}
              onLongPress={onOpenSettings}
              stationId={stationId}
              fetchHistory={fetchHistory}
              fetchHistoryDaily={fetchHistoryDaily}
              hourlyForecast={hourlyForecast}
              units={units}
            />
          </div>

          <div className="dash-right">
            <div className="dash-metrics dash-section">
              <MetricCard icon="🌬️" label="Air Quality" value={fmt(current?.aqi)} unit=" AQI" trend={aqiCategory(current?.aqi)} />
              <MetricCard icon="🌡️" label="Dew Point" value={dewPoint.value} unit={dewPoint.unit} />
              <MetricCard icon="💨" label="Wind Gust" value={windGust.value} unit={windGust.unit} trend={current?.windGust != null ? beaufort(current.windGust) : undefined} />
            </div>

            <div className="dash-section">
              <SectionTitle>Next {HOURS_SHOWN} hours</SectionTitle>
              {hours.length ? (
                <div className="dash-hours">
                  {hours.map(hr => <HourlyCard key={hr.time} hr={hr} units={units} />)}
                </div>
              ) : (
                <div className="y-card" style={{ fontSize: 13, color: 'var(--tm)', textAlign: 'center' }}>Hourly forecast loading…</div>
              )}
            </div>

            <div className="dash-section">
              <SectionTitle>5-day forecast</SectionTitle>
              {days.length ? (
                <div className="dash-days">
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
          </div>
        </div>
      )}
    </div>
  );
}
