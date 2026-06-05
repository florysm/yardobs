import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import TopBar from './components/TopBar';
import HeroCard from './components/HeroCard';
import NavTabs from './components/NavTabs';
import NowTab from './components/NowTab';
import ForecastTab from './components/ForecastTab';
import SettingsDrawer from './components/SettingsDrawer';
import ErrorBoundary from './components/ErrorBoundary';
import LocationSetup from './components/LocationSetup';
import { useWeather } from './hooks/useWeather';
import { CHART_COLORS, META_COLORS, THEME_IDS } from './themes.js';
import { STORAGE_KEYS } from './utils/storageKeys';
import { toDateStr } from './utils/dateUtils';

const TrendsTab = lazy(() => import('./components/TrendsTab'));
const TrendsLockedPlaceholder = lazy(() => import('./components/TrendsLockedPlaceholder'));
const RadarTab  = lazy(() => import('./components/RadarTab'));

function LazyTabFallback() {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Loading…</div>;
}

// Resolves current conditions → one of the 6 theme names.
// Uses iconCode when the API returns it; falls back to PWS sensor data.
function resolveAutoTheme(current) {
  const iconCode = current?.iconCode ?? null;
  const isDay    = current?.isDay    ?? 1;

  if (iconCode != null) {
    const stormy = [0, 1, 2, 3, 4, 17, 37, 38, 47];
    const rainy   = [5, 6, 8, 9, 10, 11, 12, 35, 39, 40, 45];
    const cloudy  = [7, 13, 14, 15, 16, 18, 19, 20, 21, 22, 25, 26, 27, 28, 41, 42, 43, 46];
    const partly  = [23, 24, 29, 30];
    if (stormy.includes(iconCode)) return THEME_IDS.stormy;
    if (rainy.includes(iconCode))  return THEME_IDS.rainy;
    if (cloudy.includes(iconCode)) return THEME_IDS.cloudy;
    if (!isDay) return THEME_IDS.dark;
    if (partly.includes(iconCode)) {
      if ((current?.uv ?? 0) >= 5 || (current?.solar ?? 0) >= 450) return THEME_IDS.sunny;
      return THEME_IDS.light;
    }
    return THEME_IDS.sunny;
  }

  // PWS sensor fallback — iconCode absent from this API endpoint
  if (current) {
    const precip = current.precipRate ?? 0;
    if (precip > 0.05) return isDay ? THEME_IDS.rainy : THEME_IDS.stormy;
    if (precip > 0)    return THEME_IDS.rainy;
    if (!isDay)        return THEME_IDS.dark;
    if ((current.uv ?? 0) >= 6) return THEME_IDS.sunny;
    if (current.solar != null && current.solar < 150) return THEME_IDS.cloudy;
    return THEME_IDS.light;
  }

  return isDay ? THEME_IDS.light : THEME_IDS.dark;
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
  const [mode, setMode]                         = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.MODE) || 'auto'; } catch { return 'auto'; } });
  const [previewCondition, setPreviewCondition] = useState(null);
  const [componentError, setComponentError]     = useState(null);
  const [defaultActivity, setDefaultActivity]   = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.DEFAULT_ACTIVITY) || 'bbq'; } catch { return 'bbq'; } });

  const saveProfile = (p) => {
    setProfile(p);
    try { localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(p)); } catch {}
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

  const { current, history, historyRecent, historyDaily, forecast, hourlyForecast, airQuality, isLoading, error, lastUpdated, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast, fetchHourlyForecast, fetchAirQuality } = useWeather(profile);

  const currentWithAQI = useMemo(() =>
    current ? { ...current, aqi: airQuality?.current?.us_aqi ?? null } : null,
  [current, airQuality]);

  const autoTheme  = resolveAutoTheme(current);
  const activeTheme =
    mode === 'light' ? 'light' :
    mode === 'dark'  ? 'dark'  :
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
    try { if (m === 'auto') localStorage.removeItem(STORAGE_KEYS.MODE); else localStorage.setItem(STORAGE_KEYS.MODE, m); } catch {}
  };

  const saveDefaultActivity = (id) => {
    setDefaultActivity(id);
    try { localStorage.setItem(STORAGE_KEYS.DEFAULT_ACTIVITY, id); } catch {}
  };

  const handleCloseSettings = () => {
    setPreviewCondition(null);
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (!forecast && (current || activeTab === 'forecast')) fetchForecast();
    if (!hourlyForecast && (current || activeTab === 'forecast')) fetchHourlyForecast();
    if (!airQuality && current) fetchAirQuality();
  }, [current, activeTab, forecast, fetchForecast, hourlyForecast, fetchHourlyForecast, airQuality, fetchAirQuality]);

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
      <HeroCard
        current={currentWithAQI}
        isLoading={isLoading}
        onLongPress={() => setSettingsOpen(true)}
        stationId={stationId}
        fetchHistoryDaily={fetchHistoryDaily}
        hourlyForecast={hourlyForecast}
        onError={setComponentError}
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
            />
          </ErrorBoundary>
        )}
        {activeTab === 'trends' && (
          <ErrorBoundary>
            <Suspense fallback={<LazyTabFallback />}>
              {(isPreview || isExploring) ? (
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
                />
              )}
            </Suspense>
          </ErrorBoundary>
        )}
        {activeTab === 'forecast' && (
          <ErrorBoundary>
            <ForecastTab forecast={forecast} isLoading={isLoading} chartColors={chartColors} hourlyForecast={hourlyForecast} lat={current?.lat} lon={current?.lon} todayObservedHigh={todayObservedHigh} stationId={stationId} sourceType={current?.sourceType ?? null} />
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
          isExploring={isExploring}
          onClearExplore={handleClearExplore}
        />
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
