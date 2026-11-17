import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import TopBar from './components/TopBar';
import HeroCard from './components/HeroCard';
import NavTabs from './components/NavTabs';
import NowTab from './components/NowTab';
import ForecastTab from './components/ForecastTab';
import SettingsDrawer from './components/SettingsDrawer';
import AlertBar from './components/AlertBar';
import KeyExpiryBanner from './components/KeyExpiryBanner';
import AlertsSheet from './components/AlertsSheet';
import ErrorBoundary from './components/ErrorBoundary';
import LocationSetup from './components/LocationSetup';
import { useWeather } from './hooks/useWeather';
import { CHART_COLORS, META_COLORS, THEME_IDS, DISPLAY_MODES } from './themes.js';
import { STORAGE_KEYS } from './utils/storageKeys';
import { toDateStr } from './utils/dateUtils';
import { detectDefaultUnits } from './utils/units';
import { resolveAutoTheme } from './utils/sky';

const TrendsTab = lazy(() => import('./components/TrendsTab'));
const TrendsLockedPlaceholder = lazy(() => import('./components/TrendsLockedPlaceholder'));
const RadarTab  = lazy(() => import('./components/RadarTab'));

function LazyTabFallback() {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Loading…</div>;
}

function initProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (raw) return JSON.parse(raw);
    // Migration: existing station user has STATION_ID but no PROFILE yet
    const sid = localStorage.getItem(STORAGE_KEYS.STATION_ID);
    if (sid) {
      const p = { mode: 'station', stationId: sid };
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(p));
      return p;
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const [profile, setProfile] = useState(initProfile);

  const [activeTab, setActiveTab]               = useState('now');
  const [settingsOpen, setSettingsOpen]         = useState(false);
  const [alertsOpen, setAlertsOpen]             = useState(false);
  const [mode, setMode]                         = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.MODE) || DISPLAY_MODES.AUTO; } catch { return DISPLAY_MODES.AUTO; } });
  const [previewCondition, setPreviewCondition] = useState(null);
  const [defaultActivity, setDefaultActivity]   = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.DEFAULT_ACTIVITY) || 'bbq'; } catch { return 'bbq'; } });
  const [units, setUnits]                       = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.UNITS) || detectDefaultUnits(); } catch { return detectDefaultUnits(); } });
  const [credentialsVersion, setCredentialsVersion] = useState(0);

  const saveProfile = (p) => {
    setProfile(p);
    try { localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(p)); } catch {}
    // Station ID may be unchanged (e.g. only the TWC key was added/updated), which
    // wouldn't otherwise invalidate useWeather's memoized fetch callback. Bumping this
    // forces useWeather's effect to re-run with the freshly saved credentials.
    if (p.mode === 'station') setCredentialsVersion(v => v + 1);
  };

  const handleSetExplore = (lat, lon, label) => saveProfile({ ...profile, exploring: { lat, lon, label } });
  const handleClearExplore = () => {
    const { exploring: _, ...rest } = profile;
    saveProfile(rest);
  };
  const handleUpdatePreviewLocation = (lat, lon, label) => saveProfile({ ...profile, lat, lon, label });

  // Alias for components that still reference stationId directly
  const stationId = profile?.stationId ?? null;
  const isExploring = profile?.mode === 'station' && !!profile?.exploring;

  // Re-read after each credential save (StationForm writes it alongside the key).
  const keyExpires = useMemo(() => {
    try { return localStorage.getItem(STORAGE_KEYS.TWC_KEY_EXPIRES); } catch { return null; }
  }, [credentialsVersion]);

  const { current, history, historyRecent, historyDaily, forecast, hourlyForecast, airQuality, alerts, isLoading, error, lastUpdated, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast, fetchHourlyForecast, fetchAirQuality, fetchAlerts } = useWeather(profile, credentialsVersion);

  const currentWithAQI = useMemo(() =>
    current ? { ...current, aqi: airQuality?.current?.us_aqi ?? null } : null,
  [current, airQuality]);

  const autoTheme  = resolveAutoTheme(current);
  const activeTheme =
    mode === DISPLAY_MODES.LIGHT ? DISPLAY_MODES.LIGHT :
    mode === DISPLAY_MODES.DARK  ? DISPLAY_MODES.DARK  :
    (previewCondition || autoTheme);

  const chartColors = CHART_COLORS[activeTheme] ?? CHART_COLORS.light;

  useEffect(() => {
    document.body.className = `theme-${activeTheme}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', META_COLORS[activeTheme] ?? '#f7f8fa');
  }, [activeTheme]);

  const handleSetMode = (m) => {
    setMode(m);
    setPreviewCondition(null);
    try { if (m === DISPLAY_MODES.AUTO) localStorage.removeItem(STORAGE_KEYS.MODE); else localStorage.setItem(STORAGE_KEYS.MODE, m); } catch {}
  };

  const saveDefaultActivity = (id) => {
    setDefaultActivity(id);
    try { localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, id); } catch {}
  };

  const saveUnits = (u) => {
    setUnits(u);
    try { localStorage.setItem(STORAGE_KEYS.UNITS, u); } catch {}
  };

  const handleCloseSettings = () => {
    setPreviewCondition(null);
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (!forecast && (current || activeTab === 'forecast')) fetchForecast();
    if (!hourlyForecast && (current || activeTab === 'forecast')) fetchHourlyForecast();
    if (!airQuality && current) fetchAirQuality();
    if (alerts == null && current) fetchAlerts();
  }, [current, activeTab, forecast, fetchForecast, hourlyForecast, fetchHourlyForecast, airQuality, fetchAirQuality, alerts, fetchAlerts]);

  // Keep today's recorded high (forecast card) current even when TrendsTab hasn't
  // been visited. Re-checked on every conditions update (~5 min); the history
  // cache only actually refetches today once its copy is 15 minutes old, and the
  // date key rolls over at midnight on its own.
  const currentObsTime = current?.obsTimeLocal;
  useEffect(() => {
    if (stationId) fetchHistoryDaily(toDateStr(new Date()));
  }, [stationId, fetchHistoryDaily, currentObsTime]);

  const todayObservedHigh = useMemo(() => {
    const obs = historyDaily[toDateStr(new Date())] ?? [];
    const highs = obs.map(o => o.imperial?.tempHigh).filter(v => v != null);
    return highs.length ? Math.max(...highs) : null;
  }, [historyDaily]);

  // First-run: no profile yet — show location setup
  if (!profile) {
    return (
      <LocationSetup
        onResolved={(lat, lon, label) => saveProfile({ mode: 'preview', lat, lon, label })}
      />
    );
  }

  const isPreview = profile.mode === 'preview';

  return (
    <>
    <div style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        profile={profile}
        lastUpdated={lastUpdated}
        onSettingsOpen={() => setSettingsOpen(true)}
        neighborhood={current?.neighborhood ?? null}
        onSetExplore={handleSetExplore}
        onClearExplore={handleClearExplore}
        onUpdatePreviewLocation={handleUpdatePreviewLocation}
      />
      <AlertBar alerts={alerts} onOpen={() => setAlertsOpen(true)} />
      {profile.mode === 'station' && (
        <KeyExpiryBanner keyExpires={keyExpires} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <HeroCard
        current={currentWithAQI}
        isLoading={isLoading}
        onLongPress={() => setSettingsOpen(true)}
        stationId={stationId}
        fetchHistoryDaily={fetchHistoryDaily}
        hourlyForecast={hourlyForecast}
        units={units}
      />
      <NavTabs active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, padding: '0 16px 24px' }}>
        {activeTab === 'now' && (
          <ErrorBoundary>
            <NowTab
              current={currentWithAQI}
              isLoading={isLoading}
              error={error}
              stationId={stationId}
              hourlyForecast={hourlyForecast}
                    defaultActivity={defaultActivity}
              units={units}
            />
          </ErrorBoundary>
        )}
        {activeTab === 'trends' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyTabFallback />}>
              {(isPreview || isExploring || !stationId) ? (
                <TrendsLockedPlaceholder onOpenSettings={() => setSettingsOpen(true)} />
              ) : (
                <TrendsTab
                  stationId={stationId}
                  current={current}
                  forecast={forecast}
                  fetchHistory={fetchHistory}
                  history={history}
                  fetchHistoryRecent={fetchHistoryRecent}
                  historyRecent={historyRecent}
                  fetchHistoryDaily={fetchHistoryDaily}
                  historyDaily={historyDaily}
                  chartColors={chartColors}
                  units={units}
                />
              )}
            </Suspense>
          </ErrorBoundary>
        )}
        {activeTab === 'forecast' && (
          <ErrorBoundary>
            <ForecastTab forecast={forecast} isLoading={isLoading} hourlyForecast={hourlyForecast} airQuality={airQuality} lat={current?.lat} lon={current?.lon} todayObservedHigh={todayObservedHigh} stationId={stationId} sourceType={current?.sourceType ?? null} currentTemp={current?.temp ?? null} units={units} />
          </ErrorBoundary>
        )}
        {activeTab === 'radar' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyTabFallback />}>
              <RadarTab
                lat={current?.lat ?? null}
                lon={current?.lon ?? null}
                isLoading={isLoading}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>

      {settingsOpen && (
        <SettingsDrawer
          onClose={handleCloseSettings}
          mode={mode}
          onSetMode={handleSetMode}
          autoTheme={autoTheme}
          previewCondition={previewCondition}
          onSetPreview={setPreviewCondition}
          profile={profile}
          onSaveProfile={saveProfile}
          defaultActivity={defaultActivity}
          onSetDefaultActivity={saveDefaultActivity}
          units={units}
          onSetUnits={saveUnits}
          isExploring={isExploring}
          onClearExplore={handleClearExplore}
        />
      )}

      {alertsOpen && alerts?.length > 0 && (
        <AlertsSheet alerts={alerts} onClose={() => setAlertsOpen(false)} />
      )}

      {error && !isLoading && (
        <div style={{
          position: 'fixed', bottom: 16, left: 16, right: 16, maxWidth: 388, margin: '0 auto',
          background: '#dc2626', color: '#fff', fontSize: 12, padding: '8px 14px',
          borderRadius: 12, zIndex: 300,
        }}>
          {error}
        </div>
      )}
    </div>
    <Analytics />
    </>
  );
}
