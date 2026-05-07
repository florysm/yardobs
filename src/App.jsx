import { useState, useEffect, lazy, Suspense } from 'react';
import TopBar from './components/TopBar';
import HeroCard from './components/HeroCard';
import NavTabs from './components/NavTabs';
import NowTab from './components/NowTab';
import ForecastTab from './components/ForecastTab';
import SettingsDrawer from './components/SettingsDrawer';
import { useWeather } from './hooks/useWeather';

const TrendsTab = lazy(() => import('./components/TrendsTab'));

// Resolves current conditions → one of the 6 theme names.
// Uses iconCode when the API returns it; falls back to PWS sensor data.
function resolveAutoTheme(current) {
  const iconCode = current?.iconCode ?? null;
  const isDay    = current?.isDay    ?? 1;

  if (iconCode != null) {
    const stormy = [0, 1, 2, 3, 4, 17, 37, 38, 47];
    const rainy   = [5, 6, 8, 9, 10, 11, 12, 35, 39, 40, 45];
    const cloudy  = [7, 13, 14, 15, 16, 18, 19, 20, 21, 22, 25, 26, 27, 28, 41, 42, 43, 46];
    const partly  = [23, 24, 29, 30, 33, 34];
    if (stormy.includes(iconCode)) return 'stormy';
    if (rainy.includes(iconCode))  return 'rainy';
    if (cloudy.includes(iconCode)) return 'cloudy';
    if (!isDay) return 'dark';
    if (partly.includes(iconCode)) return 'light';
    return 'sunny';
  }

  // PWS sensor fallback — iconCode absent from this API endpoint
  if (current) {
    const precip = current.precipRate ?? 0;
    if (precip > 0.05) return isDay ? 'rainy' : 'stormy';
    if (precip > 0)    return 'rainy';
    if (!isDay)        return 'dark';
    if ((current.uv ?? 0) >= 6) return 'sunny';
    if (current.solar != null && current.solar < 150) return 'cloudy';
    return 'light';
  }

  return isDay ? 'light' : 'dark';
}

// Exact --accent / --yoy values from index.css — needed for recharts (SVG attrs don't support var())
export const CHART_COLORS = {
  sunny:  { accent: '#e8760a', yoy: '#c8520a' },
  cloudy: { accent: '#5b7fa6', yoy: '#3a5f86' },
  rainy:  { accent: '#4fc3f7', yoy: '#0288d1' },
  stormy: { accent: '#b388ff', yoy: '#7b1fa2' },
  light:  { accent: '#1a73e8', yoy: '#0d47a1' },
  dark:   { accent: '#64b5f6', yoy: '#1565c0' },
};

export default function App() {
  const [activeTab, setActiveTab]           = useState('now');
  const [settingsOpen, setSettingsOpen]     = useState(false);
  // 'auto' | 'light' | 'dark'
  const [mode, setMode]                     = useState(() => localStorage.getItem('yardobs-mode') || 'auto');
  // temporary preview inside the settings drawer (not persisted)
  const [previewCondition, setPreviewCondition] = useState(null);

  const stationId = import.meta.env.VITE_PWS_STATION_ID;
  const { current, history, historyRecent, historyDaily, forecast, isLoading, error, lastUpdated, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast } = useWeather(stationId);

  const autoTheme  = resolveAutoTheme(current);
  const activeTheme =
    mode === 'light' ? 'light' :
    mode === 'dark'  ? 'dark'  :
    (previewCondition || autoTheme);

  const chartColors = CHART_COLORS[activeTheme] ?? CHART_COLORS.light;

  // Apply theme class to body so CSS variables cascade everywhere
  useEffect(() => {
    document.body.className = `theme-${activeTheme}`;
  }, [activeTheme]);

  const handleSetMode = (m) => {
    setMode(m);
    setPreviewCondition(null);
    if (m === 'auto') localStorage.removeItem('yardobs-mode');
    else localStorage.setItem('yardobs-mode', m);
  };

  const handleCloseSettings = () => {
    setPreviewCondition(null);
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (!forecast && (current || activeTab === 'forecast')) fetchForecast();
  }, [current, activeTab, forecast, fetchForecast]);

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar
        stationId={stationId}
        lastUpdated={lastUpdated}
        onSettingsOpen={() => setSettingsOpen(true)}
      />
      <HeroCard
        current={current}
        isLoading={isLoading}
        onLongPress={() => setSettingsOpen(true)}
      />
      <NavTabs active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, padding: '0 16px 24px' }}>
        {activeTab === 'now' && (
          <NowTab
            current={current}
            isLoading={isLoading}
            stationId={stationId}
            fetchHistory={fetchHistory}
            history={history}
            forecast={forecast}
          />
        )}
        {activeTab === 'trends' && (
          <Suspense fallback={
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>
              Loading…
            </div>
          }>
            <TrendsTab
              stationId={stationId}
              fetchHistory={fetchHistory}
              history={history}
              fetchHistoryRecent={fetchHistoryRecent}
              historyRecent={historyRecent}
              fetchHistoryDaily={fetchHistoryDaily}
              historyDaily={historyDaily}
              chartColors={chartColors}
            />
          </Suspense>
        )}
        {activeTab === 'forecast' && (
          <ForecastTab forecast={forecast} isLoading={isLoading} chartColors={chartColors} />
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
          stationId={stationId}
        />
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
  );
}
