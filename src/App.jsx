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
import DashboardView from './components/DashboardView';
import { useWeather } from './hooks/useWeather';
import { CHART_COLORS, META_COLORS, THEME_IDS, DISPLAY_MODES } from './themes.js';
import { STORAGE_KEYS, readStored, writeStored } from './utils/storageKeys';
import { PROFILE_MODES, isStationProfile, isPreviewProfile, isExploring } from './utils/profile';
import { DEFAULT_ACTIVITY_ID } from './utils/activities';
import { toDateStr } from './utils/dateUtils';
import { detectDefaultUnits } from './utils/units';
import { resolveAutoTheme } from './utils/sky';
import { readDeviceLink, isSetupHash, clearSetupHash, setupFingerprint } from './utils/deviceSetup';
import { normalizeSize } from './utils/dashboardSize';

const TrendsTab = lazy(() => import('./components/TrendsTab'));
const TrendsLockedPlaceholder = lazy(() => import('./components/TrendsLockedPlaceholder'));
const RadarTab  = lazy(() => import('./components/RadarTab'));

function LazyTabFallback() {
  return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--tm)', fontSize: 13 }}>Loading…</div>;
}

// Dashboard layout is per device. `?dashboard=1` (e.g. a tablet's home-screen
// bookmark) turns it on and remembers it; `?dashboard=large` (or normal,
// detailed, auto) also picks the size; `?dashboard=0` turns it off.
function initDashboard() {
  try {
    const param = new URLSearchParams(window.location.search).get('dashboard');
    if (param === '0') writeStored(STORAGE_KEYS.DASHBOARD, null);
    else if (param) {
      writeStored(STORAGE_KEYS.DASHBOARD, '1');
      if (param !== '1') {
        const size = normalizeSize(param);
        writeStored(STORAGE_KEYS.DASHBOARD_SIZE, size === 'auto' ? null : size);
      }
    }
  } catch { /* no URL support: fall back to the saved setting */ }
  return readStored(STORAGE_KEYS.DASHBOARD) === '1';
}

// Running from the Home Screen rather than in a browser tab. navigator.standalone
// is iOS Safari's (all versions); display-mode covers other browsers.
function isInstalledApp() {
  try {
    return window.navigator.standalone === true
      || (!!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  } catch { return false; }
}

// Saves a setup link's station, key, expiry and dashboard choice on this
// device, replacing whatever profile it had.
function applyDeviceLink(link) {
  writeStored(STORAGE_KEYS.TWC_API_KEY, link.key);
  writeStored(STORAGE_KEYS.TWC_KEY_EXPIRES, link.expires);
  writeStored(STORAGE_KEYS.PROFILE, JSON.stringify({ mode: PROFILE_MODES.STATION, stationId: link.stationId }));
  if (link.dashboard) writeStored(STORAGE_KEYS.DASHBOARD, '1');
}

// A "set up another device" link (#setup=…, see deviceSetup.js) applies itself
// on load. A home-screen app on iOS doesn't share storage with Safari, so in a
// Safari tab the link stays in the address: "Add to Home Screen" saves the
// icon with it, and the installed app sets itself up from it on first launch.
// Each device applies a given link once (SETUP_LINK_USED), so reloading the tab
// or relaunching the icon never brings back an old key. Running from the Home
// Screen, the link also removes itself from the address; in a tab,
// SetupLinkNote offers to remove it.
function consumeDeviceLink() {
  let hash, link;
  try { hash = window.location.hash; link = readDeviceLink(hash); } catch { return; }
  if (!link) return;
  // Only the first time this device sees this link: an icon added from a tab
  // with the link in its address opens it again on every launch.
  const mark = setupFingerprint(hash);
  if (readStored(STORAGE_KEYS.SETUP_LINK_USED) !== mark) {
    applyDeviceLink(link);
    writeStored(STORAGE_KEYS.SETUP_LINK_USED, mark);
  }
  if (isInstalledApp()) clearSetupHash();
}

function setupLinkInAddress() {
  try { return isSetupHash(window.location.hash) && !isInstalledApp(); } catch { return false; }
}

// Shown in a Safari tab while a setup link is still in the address.
function SetupLinkNote({ onDone }) {
  return (
    <div style={{
      position: 'fixed', top: 12, left: 12, right: 12, maxWidth: 560, margin: '0 auto', zIndex: 310,
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14,
      boxShadow: '0 6px 24px rgba(0,0,0,0.15)', padding: '12px 14px',
      display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--tp)', lineHeight: 1.45,
    }}>
      <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
        <b>This device is set up.</b> To use YardObs from your Home Screen, tap Share → Add to Home Screen now, from this page.
      </div>
      <button type="button" onClick={onDone} style={{
        padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff',
        fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', flexShrink: 0,
      }}>Done</button>
    </div>
  );
}

function initProfile() {
  consumeDeviceLink();
  try {
    const raw = readStored(STORAGE_KEYS.PROFILE);
    if (raw) return JSON.parse(raw);
    // Migration: existing station user has STATION_ID but no PROFILE yet
    const sid = readStored(STORAGE_KEYS.STATION_ID);
    if (sid) {
      const p = { mode: PROFILE_MODES.STATION, stationId: sid };
      writeStored(STORAGE_KEYS.PROFILE, JSON.stringify(p));
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
  const [mode, setMode]                         = useState(() => readStored(STORAGE_KEYS.MODE, DISPLAY_MODES.AUTO));
  const [previewCondition, setPreviewCondition] = useState(null);
  const [defaultActivity, setDefaultActivity]   = useState(() => readStored(STORAGE_KEYS.DEFAULT_ACTIVITY, DEFAULT_ACTIVITY_ID));
  const [units, setUnits]                       = useState(() => readStored(STORAGE_KEYS.UNITS) || detectDefaultUnits());
  const [credentialsVersion, setCredentialsVersion] = useState(0);
  const [dashboard, setDashboard]               = useState(initDashboard);
  const [dashboardSize, setDashboardSize]       = useState(() => normalizeSize(readStored(STORAGE_KEYS.DASHBOARD_SIZE)));
  const [setupNote, setSetupNote]               = useState(setupLinkInAddress);

  const saveProfile = (p) => {
    setProfile(p);
    writeStored(STORAGE_KEYS.PROFILE, JSON.stringify(p));
    // Station ID may be unchanged (e.g. only the TWC key was added/updated), which
    // wouldn't otherwise invalidate useWeather's memoized fetch callback. Bumping this
    // forces useWeather's effect to re-run with the freshly saved credentials.
    if (isStationProfile(p)) setCredentialsVersion(v => v + 1);
  };

  const handleSetExplore = (lat, lon, label) => saveProfile({ ...profile, exploring: { lat, lon, label } });
  const handleClearExplore = () => {
    const { exploring: _, ...rest } = profile;
    saveProfile(rest);
  };
  const handleUpdatePreviewLocation = (lat, lon, label) => saveProfile({ ...profile, lat, lon, label });

  // Alias for components that still reference stationId directly
  const stationId = profile?.stationId ?? null;
  const exploring = isExploring(profile);

  // Re-read after each credential save (StationForm writes it alongside the key).
  const keyExpires = useMemo(() => readStored(STORAGE_KEYS.TWC_KEY_EXPIRES), [credentialsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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
    writeStored(STORAGE_KEYS.MODE, m === DISPLAY_MODES.AUTO ? null : m);
  };

  const saveDefaultActivity = (id) => {
    setDefaultActivity(id);
    writeStored(STORAGE_KEYS.DEFAULT_ACTIVITY, id);
  };

  const saveUnits = (u) => {
    setUnits(u);
    writeStored(STORAGE_KEYS.UNITS, u);
  };

  const dismissSetupNote = () => {
    clearSetupHash();
    setSetupNote(false);
  };

  // A setup link pasted on the first-run screen.
  const handleSetupLink = (link) => {
    applyDeviceLink(link);
    dismissSetupNote();
    if (link.dashboard) setDashboard(true);
    saveProfile({ mode: PROFILE_MODES.STATION, stationId: link.stationId });
  };

  const saveDashboardSize = (size) => {
    const s = normalizeSize(size);
    setDashboardSize(s);
    writeStored(STORAGE_KEYS.DASHBOARD_SIZE, s === 'auto' ? null : s);
  };

  const saveDashboard = (on) => {
    dismissSetupNote(); // or a reload would apply the link's choice again
    setDashboard(on);
    writeStored(STORAGE_KEYS.DASHBOARD, on ? '1' : null);
    // Drop a ?dashboard param so a reload keeps the choice just made.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('dashboard')) {
        url.searchParams.delete('dashboard');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
    } catch { /* leave the URL alone */ }
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
  const todayObservedLow = useMemo(() => {
    const obs = historyDaily[toDateStr(new Date())] ?? [];
    const lows = obs.map(o => o.imperial?.tempLow).filter(v => v != null);
    return lows.length ? Math.min(...lows) : null;
  }, [historyDaily]);

  // First-run: no profile yet — show location setup
  if (!profile) {
    return (
      <LocationSetup
        onResolved={(lat, lon, label) => saveProfile({ mode: PROFILE_MODES.PREVIEW, lat, lon, label })}
        onSetupLink={handleSetupLink}
      />
    );
  }

  const isPreview = isPreviewProfile(profile);

  // Sheets and toasts shared by both layouts.
  const overlays = (
    <>
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
          isExploring={exploring}
          onClearExplore={handleClearExplore}
          dashboard={dashboard}
          onSetDashboard={saveDashboard}
          dashboardSize={dashboardSize}
          onSetDashboardSize={saveDashboardSize}
        />
      )}

      {setupNote && <SetupLinkNote onDone={dismissSetupNote} />}

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
    </>
  );

  if (dashboard) {
    // If the dashboard itself fails, its own gear and long-press are gone with
    // it, so the error screen offers the way out: the phone layout, another
    // size, or a reload. Keyed by size so picking one starts fresh.
    const dashboardEscape = [
      { label: 'Switch to phone layout', onClick: () => saveDashboard(false) },
      ...(dashboardSize !== 'normal' ? [{ label: 'Use Normal size', onClick: () => saveDashboardSize('normal') }] : []),
      { label: 'Reload', onClick: () => window.location.reload() },
    ];
    return (
      <>
        <ErrorBoundary key={dashboardSize} where="dashboard" label="The dashboard couldn't load." actions={dashboardEscape}>
        <DashboardView
          banner={isStationProfile(profile) && (
            <KeyExpiryBanner keyExpires={keyExpires} onOpenSettings={() => setSettingsOpen(true)} />
          )}
          profile={profile}
          current={currentWithAQI}
          isLoading={isLoading}
          error={error}
          stationId={stationId}
          hourlyForecast={hourlyForecast}
          forecast={forecast}
          todayObservedHigh={todayObservedHigh}
          todayObservedLow={todayObservedLow}
          alerts={alerts}
          lastUpdated={lastUpdated}
          sizePref={dashboardSize}
          onSetSize={saveDashboardSize}
          chartColors={chartColors}
          units={units}
          fetchHistory={fetchHistory}
          fetchHistoryDaily={fetchHistoryDaily}
          onOpenAlerts={() => setAlertsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        </ErrorBoundary>
        {overlays}
        <Analytics />
      </>
    );
  }

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
      {isStationProfile(profile) && (
        <KeyExpiryBanner keyExpires={keyExpires} onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <HeroCard
        current={currentWithAQI}
        isLoading={isLoading}
        onLongPress={() => setSettingsOpen(true)}
        stationId={stationId}
        fetchHistory={fetchHistory}
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
              {(isPreview || exploring || !stationId) ? (
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

      {overlays}
    </div>
    <Analytics />
    </>
  );
}
