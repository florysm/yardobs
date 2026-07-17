import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import TopBar from './components/TopBar';
import HeroCard from './components/HeroCard';
import NavTabs from './components/NavTabs';
import NowTab from './components/NowTab';
import ForecastTab from './components/ForecastTab';
import SettingsDrawer from './components/SettingsDrawer';
import AlertBar from './components/AlertBar';
import AlertsSheet from './components/AlertsSheet';
import ErrorBoundary from './components/ErrorBoundary';
import LocationSetup from './components/LocationSetup';
import { useWeather } from './hooks/useWeather';
import { CHART_COLORS, META_COLORS, THEME_IDS, DISPLAY_MODES } from './themes.js';
import { STORAGE_KEYS } from './utils/storageKeys';
import { toDateStr } from './utils/dateUtils';
import { detectDefaultUnits } from './utils/units';

const TrendsTab = lazy(() => import('./components/TrendsTab'));
const TrendsLockedPlaceholder = lazy(() => import('./components/TrendsLockedPlaceholder'));
const RadarTab  = lazy(() => import('./components/RadarTab'));

function LazyTabFallback() {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Loading…</div>;
}

const ICON_STORMY = [0, 1, 2, 3, 4, 17, 37, 38, 47];
const ICON_RAINY  = [5, 6, 8, 9, 10, 11, 12, 35, 39, 40, 45];
const ICON_CLOUDY = [7, 13, 14, 15, 16, 18, 19, 20, 21, 22, 25, 26, 27, 28, 41, 42, 43, 46];
const ICON_PARTLY = [23, 24, 29, 30];

// Resolves current conditions → one of the 6 theme names using a sensor-aware
// cascade. Prefers the station's own measurements and only leans on the model
// iconCode when local sensors can't answer, so a regional-model storm can't
// override a backyard that's measurably dry. Day/night comes from current.isDay,
// which useWeather derives via SunCalc (the TWC observation omits it).
function resolveAutoTheme(current) {
  if (!current) return THEME_IDS.light;

  const isDay      = (current.isDay ?? 1) === 1;
  const iconCode   = current.iconCode ?? null;
  const precipRate = current.precipRate;   // null → station has no rain sensor
  const uv         = current.uv;           // null → no UV sensor
  const solar      = current.solar;        // null → no solar sensor

  const hasRainSensor = precipRate != null;

  const modelStormy = iconCode != null && ICON_STORMY.includes(iconCode);
  const modelRainy  = iconCode != null && ICON_RAINY.includes(iconCode);
  const modelCloudy = iconCode != null && ICON_CLOUDY.includes(iconCode);
  const modelPartly = iconCode != null && ICON_PARTLY.includes(iconCode);

  // 1. Wetness. A local rain gauge is ground truth: a dry reading (0) vetoes the
  //    model's precipitation; the model's wetness is trusted only when the
  //    station has no gauge of its own (e.g. preview mode, which has no sensors).
  const isWet = hasRainSensor ? precipRate > 0 : (modelStormy || modelRainy);
  if (isWet) {
    const severe = modelStormy || (hasRainSensor && precipRate > 0.1);
    return severe ? THEME_IDS.stormy : THEME_IDS.rainy;
  }

  // 2. Dry night → dark.
  if (!isDay) return THEME_IDS.dark;

  // 3. Dry day → decide sunny / partly / cloudy, using the strongest signal
  //    available. Measured sunlight is only ever a positive "sunny" signal or,
  //    via solar radiation, a positive "overcast" signal — a low UV reading
  //    alone is ambiguous, so it never forces cloudy. When sensors are silent
  //    (preview mode, or a station without solar/UV) we defer to the model
  //    iconCode for the cloud state, which is the only clarity signal we have.
  if ((uv ?? 0) >= 5 || (solar ?? 0) >= 450) return THEME_IDS.sunny;  // strong sun
  if (solar != null && solar < 150)          return THEME_IDS.cloudy; // measured overcast
  // A storm/rain code reaching here was vetoed by a dry gauge, so treat it as
  // merely cloudy rather than a phantom storm.
  if (modelCloudy || modelStormy || modelRainy) return THEME_IDS.cloudy;
  if (modelPartly) return THEME_IDS.light;
  if (iconCode != null) return THEME_IDS.sunny;   // model reports clear sky
  // No strong sun reading and no model info: a silent solar sensor implies a
  // hazy/indeterminate day (light); nothing at all defaults to sunny daytime.
  return solar != null ? THEME_IDS.light : THEME_IDS.sunny;
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
  const [componentError, setComponentError]     = useState(null);
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

  // Ensure today's recorded high is available for the forecast card even when TrendsTab hasn't been visited
  useEffect(() => {
    if (stationId) fetchHistoryDaily(toDateStr(new Date()));
  }, [stationId, fetchHistoryDaily]);

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
      <HeroCard
        current={currentWithAQI}
        isLoading={isLoading}
        onLongPress={() => setSettingsOpen(true)}
        stationId={stationId}
        fetchHistoryDaily={fetchHistoryDaily}
        hourlyForecast={hourlyForecast}
        onError={setComponentError}
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
              onError={setComponentError}
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
            <ForecastTab forecast={forecast} isLoading={isLoading} chartColors={chartColors} hourlyForecast={hourlyForecast} airQuality={airQuality} lat={current?.lat} lon={current?.lon} todayObservedHigh={todayObservedHigh} stationId={stationId} sourceType={current?.sourceType ?? null} currentTemp={current?.temp ?? null} units={units} />
          </ErrorBoundary>
        )}
        {activeTab === 'radar' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyTabFallback />}>
              <RadarTab
                lat={current?.lat ?? null}
                lon={current?.lon ?? null}
                isLoading={isLoading}
                onError={setComponentError}
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

      {((error && !isLoading) || componentError) && (
        <div style={{
          position: 'fixed', bottom: 16, left: 16, right: 16, maxWidth: 388, margin: '0 auto',
          background: '#dc2626', color: '#fff', fontSize: 12, padding: '8px 14px',
          borderRadius: 12, zIndex: 300,
        }}>
          {error || componentError}
        </div>
      )}
    </div>
    <Analytics />
    </>
  );
}
