import { useState, useEffect, useCallback, useRef } from 'react';
import SunCalc from 'suncalc';
import { apiFetch } from '../utils/apiFetch';
import { toDateStr } from '../utils/dateUtils';
import { calcFeelsLike } from '../utils/weatherCalc';
import { normalizeAlerts } from '../utils/alerts';
import { normalizeTwcForecast, normalizeOpenMeteoForecast } from '../utils/forecastNormalize';
import { wmoToTwc } from '../utils/weatherIcons';

const POLL_MS = 5 * 60 * 1000;

// TWC PWS observations omit the day/night flag, so derive it locally from the
// sun's position (works everywhere, incl. polar day/night). Falls back to day
// when coordinates are missing.
function computeIsDay(lat, lon) {
  if (lat == null || lon == null) return 1;
  try {
    return SunCalc.getPosition(new Date(), lat, lon).altitude > 0 ? 1 : 0;
  } catch {
    return 1;
  }
}

// Converts Open-Meteo WMO weather codes to approximate TWC icon codes so that
// resolveAutoTheme and ForecastTab's buildDays (which both expect TWC codes) work
// without modification in preview mode.
// ── Open-Meteo base URLs ──────────────────────────────────────────────────────
const OM_BASE = 'https://api.open-meteo.com/v1/forecast';
const OM_AQ   = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OM_UNITS = 'temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto';

export function useWeather(profile, credentialsVersion) {
  const [current, setCurrent]           = useState(null);
  const [history, setHistory]           = useState({});       // keyed by YYYYMMDD, hourly obs
  const [historyRecent, setHistoryRecent] = useState([]);     // rolling 7-day hourly, always fresh
  const historyDailyRef                 = useRef({});         // ref cache keeps callback stable
  const [historyDaily, setHistoryDaily] = useState({});       // keyed by YYYYMMDD, daily summaries
  const [forecast, setForecast]         = useState(null);
  const [hourlyForecast, setHourlyForecast] = useState(null);
  const [airQuality, setAirQuality]     = useState(null);
  const [alerts, setAlerts]             = useState(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState(null);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const locationRef = useRef(null);
  const abortRef = useRef(null);
  // TWC nulls out today's daypart once that period has passed (~mid-afternoon),
  // so the normalizer falls back to the current observed icon for day 0. A ref
  // rather than reading `current`, which would rebuild fetchForecast every poll.
  const currentIconRef = useRef(null);

  const isPreview   = profile?.mode === 'preview';
  const isExploring = profile?.mode === 'station' && !!profile?.exploring;
  const isPreviewMode = isPreview || isExploring;
  const stationId   = profile?.stationId ?? null;

  // Effective coordinates for the preview/explore data path
  const previewLat   = isExploring ? profile.exploring.lat   : profile?.lat;
  const previewLon   = isExploring ? profile.exploring.lon   : profile?.lon;
  const previewLabel = isExploring ? profile.exploring.label : profile?.label;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  // ── Station mode: fetch current PWS observation ───────────────────────────
  const fetchCurrentStation = useCallback(async () => {
    if (!stationId) { setIsLoading(false); setError('No station configured — open Settings to add your station ID.'); return; }
    setError(null);
    try {
      const data = await apiFetch(`/api/weather?type=current&stationId=${encodeURIComponent(stationId)}`, { signal: abortRef.current?.signal });
      const obs = data.observations?.[0];
      if (!obs) throw new Error('No observation in response');

      locationRef.current = { lat: obs.lat, lon: obs.lon };
      setLastUpdated(new Date());

      // TWC PWS observations carry no day/night flag — derive it from the sun's
      // position so night themes actually engage after sunset.
      const isDay = computeIsDay(obs.lat, obs.lon);

      // When the station lacks solar/UV sensors (the only local sky-clarity signals),
      // supplement TWC's iconCode with Open-Meteo's model-based weather_code so the
      // theme reflects actual conditions rather than TWC's regional inference.
      let resolvedIconCode = obs.iconCode ?? null;
      if (obs.solarRadiation == null && obs.uv == null && obs.lat && obs.lon) {
        try {
          const omRes = await fetch(
            `${OM_BASE}?latitude=${obs.lat}&longitude=${obs.lon}&current=weather_code&timezone=auto`,
            { signal: abortRef.current?.signal }
          );
          const omData = await omRes.json();
          if (omData.current?.weather_code != null) {
            resolvedIconCode = wmoToTwc(omData.current.weather_code, isDay);
          }
        } catch { /* non-fatal — falls back to TWC iconCode */ }
      }

      currentIconRef.current = resolvedIconCode;
      setCurrent({
        temp:        obs.imperial?.temp        ?? null,
        feelsLike:   calcFeelsLike(obs.imperial?.temp, obs.humidity, obs.imperial?.windSpeed),
        humidity:    obs.humidity              ?? null,
        windSpeed:   obs.imperial?.windSpeed   ?? null,
        windGust:    obs.imperial?.windGust    ?? null,
        windDir:     obs.winddir               ?? null,
        pressure:    obs.imperial?.pressure    ?? null,
        dewPoint:    obs.imperial?.dewpt       ?? null,
        precipRate:  obs.imperial?.precipRate  ?? null,
        precipTotal: obs.imperial?.precipTotal ?? null,
        uv:          obs.uv                    ?? null,
        solar:       obs.solarRadiation        ?? null,
        iconCode:    resolvedIconCode,
        isDay:       isDay,
        stationId:    obs.stationID,
        neighborhood: obs.neighborhood ?? null,
        country:      obs.country      ?? null,
        obsTimeLocal: obs.obsTimeLocal,
        lat: obs.lat,
        lon: obs.lon,
        sourceType:  'pws',
        sourceLabel: 'Your Station',
      });
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [stationId, credentialsVersion]);

  // ── Preview/explore mode: fetch current conditions from Open-Meteo ──────────
  const fetchCurrentPreview = useCallback(async () => {
    if (!previewLat || !previewLon) { setIsLoading(false); setError('No location set — open Settings to choose a preview location.'); return; }
    setError(null);
    try {
      const url = `${OM_BASE}?latitude=${previewLat}&longitude=${previewLon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
        `dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,` +
        `surface_pressure,weather_code,is_day,uv_index,precipitation` +
        `&${OM_UNITS}`;
      const omRes = await fetch(url, { signal: abortRef.current?.signal });
      const data = await omRes.json();
      if (data.error) throw new Error(data.reason ?? 'Open-Meteo error');
      const c = data.current;
      if (!c) throw new Error('No current data from Open-Meteo');

      locationRef.current = { lat: previewLat, lon: previewLon };
      setLastUpdated(new Date());
      // Also set while exploring: a station owner viewing another location takes
      // `current` from Open-Meteo here but still gets their forecast from TWC,
      // which needs this fallback for today's nulled daypart.
      currentIconRef.current = wmoToTwc(c.weather_code, c.is_day ?? 1);
      setCurrent({
        temp:        c.temperature_2m           ?? null,
        feelsLike:   c.apparent_temperature     ?? null,
        humidity:    c.relative_humidity_2m     ?? null,
        windSpeed:   c.wind_speed_10m           ?? null,
        windGust:    c.wind_gusts_10m           ?? null,
        windDir:     c.wind_direction_10m       ?? null,
        // Open-Meteo surface_pressure is hPa; convert to inHg
        pressure:    c.surface_pressure != null ? Math.round(c.surface_pressure * 0.02953 * 100) / 100 : null,
        dewPoint:    c.dew_point_2m             ?? null,
        // OM_UNITS sets precipitation_unit=inch, so this is already in/hr and
        // matches the imperial-internal convention. Without it the activity
        // scores could never tell that it was raining in preview mode.
        precipRate:  c.precipitation            ?? null,
        // Open-Meteo's current block has no daily accumulation figure.
        precipTotal: null,
        uv:          c.uv_index                 ?? null,
        solar:       null,
        iconCode:    wmoToTwc(c.weather_code, c.is_day ?? 1),
        isDay:       c.is_day                   ?? 1,
        stationId:   null,
        neighborhood: previewLabel              ?? null,
        country:     null,
        obsTimeLocal: c.time,
        lat: previewLat,
        lon: previewLon,
        sourceType:  'forecast_model',
        sourceLabel: 'Weather Forecast',
      });

    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile]); // profile is the root source for previewLat/previewLon/previewLabel

  const fetchCurrent = isPreviewMode ? fetchCurrentPreview : fetchCurrentStation;

  // ── History functions — no-op in preview/explore mode ────────────────────
  const fetchHistory = useCallback(async (dateStr) => {
    if (isPreviewMode) return null;
    if (!stationId) return null;
    const key = dateStr || toDateStr(new Date());
    const isToday = key === toDateStr(new Date());
    if (!isToday && history[key]) return history[key];
    try {
      const data = await apiFetch(
        `/api/weather?type=history&stationId=${encodeURIComponent(stationId)}&date=${key}`,
        { signal: abortRef.current?.signal }
      );
      const obs = data.observations ?? [];
      setHistory(prev => ({ ...prev, [key]: obs }));
      return obs;
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
      return null;
    }
  }, [isPreviewMode, stationId, history]);

  const fetchHistoryRecent = useCallback(async () => {
    if (isPreviewMode) return null;
    if (!stationId) return null;
    try {
      const data = await apiFetch(
        `/api/weather?type=history-recent&stationId=${encodeURIComponent(stationId)}`,
        { signal: abortRef.current?.signal }
      );
      const obs = data.observations ?? [];
      setHistoryRecent(obs);
      return obs;
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
      return null;
    }
  }, [isPreviewMode, stationId]);

  const fetchHistoryDaily = useCallback(async (dateStr) => {
    if (isPreviewMode) return null;
    if (!stationId) return null;
    if (historyDailyRef.current[dateStr]) return historyDailyRef.current[dateStr];
    try {
      const data = await apiFetch(
        `/api/weather?type=history-daily&stationId=${encodeURIComponent(stationId)}&date=${dateStr}`,
        { signal: abortRef.current?.signal }
      );
      const obs = data.observations ?? [];
      historyDailyRef.current[dateStr] = obs;
      setHistoryDaily(prev => ({ ...prev, [dateStr]: obs }));
      return obs;
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
      return null;
    }
  }, [isPreviewMode, stationId]);

  // ── Daily forecast — TWC for station owners, Open-Meteo for preview ──────────
  // The TWC 5-day is a geocoded model forecast, not station data (the PWS routes
  // are the stationId-keyed ones) — station owners stay on it so their forecast
  // icons and phrasing match the TWC conditions they see elsewhere. Preview mode
  // is served by Open-Meteo, which needs no key: see fetchHourlyForecast.
  const fetchForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc || !stationId) return; // preview's forecast rides along with the hourly fetch
    try {
      const data = await apiFetch(`/api/weather?type=forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setForecast(normalizeTwcForecast(data, currentIconRef.current));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, [stationId]);

  // ── Hourly forecast — Open-Meteo (multi-model ensemble, global, includes UV index) ─
  const fetchHourlyForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;
    try {
      const data = await apiFetch(`/api/weather?type=hourly-forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setHourlyForecast(data);
      // This response also carries the `daily` block, so preview mode's 5-day
      // forecast costs no additional request.
      if (!stationId) setForecast(normalizeOpenMeteoForecast(data));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, [stationId]);

  // ── Air quality — all modes call Open-Meteo directly from the browser ────
  const fetchAirQuality = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;

    try {
      const { lat, lon } = loc;
      // hourly us_aqi rides along on the same request the current reading needs,
      // so the Forecast tab can describe air quality per day instead of smearing
      // today's number across all five. See aqiForDay in forecastNormalize.js.
      const url = `${OM_AQ}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&hourly=us_aqi&forecast_days=5&timezone=auto`;
      const data = await fetch(url, { signal: abortRef.current?.signal }).then(r => r.json());
      setAirQuality(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError('Air quality unavailable');
    }
  }, []);

  // ── Severe-weather alerts — via proxy (NWS, US-only). Failures are silent:
  //    outside NWS coverage the endpoint 4xxs, which simply means "no alerts". ─
  const fetchAlerts = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;
    try {
      const raw = await apiFetch(`/api/weather?type=alerts&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setAlerts(normalizeAlerts(raw));
    } catch (err) {
      if (err.name !== 'AbortError') setAlerts([]);
    }
  }, []);

  // Clear forecast/hourly/AQ/alert caches when the data source location changes
  const dataSourceKey = isPreviewMode
    ? `preview:${previewLat ?? ''},${previewLon ?? ''}`
    : `station:${stationId ?? ''}`;
  const isFirstDataRender = useRef(true);
  useEffect(() => {
    if (isFirstDataRender.current) { isFirstDataRender.current = false; return; }
    setForecast(null);
    setHourlyForecast(null);
    setAirQuality(null);
    setAlerts(null);
  }, [dataSourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCurrent();
    let timer;
    const schedule = () => {
      // ±30s jitter prevents all open tabs from hitting the server simultaneously
      const jitter = (Math.random() - 0.5) * 60_000;
      timer = setTimeout(() => {
        fetchCurrent();
        fetchAlerts();  // refresh alerts each poll so mid-session warnings surface
        schedule();
      }, POLL_MS + jitter);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [fetchCurrent, fetchAlerts]);

  return {
    current, history, historyRecent, historyDaily, forecast, hourlyForecast, airQuality, alerts,
    isLoading, error, lastUpdated,
    fetchCurrent, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast, fetchHourlyForecast, fetchAirQuality, fetchAlerts,
  };
}
