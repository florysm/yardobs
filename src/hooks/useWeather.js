import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { toDateStr } from '../utils/dateUtils';
import { calcFeelsLike } from '../utils/weatherCalc';

const POLL_MS = 5 * 60 * 1000;

// Converts Open-Meteo WMO weather codes to approximate TWC icon codes so that
// resolveAutoTheme and ForecastTab's buildDays (which both expect TWC codes) work
// without modification in preview mode.
function wmoToTwc(code, isDay = 1) {
  if (code == null) return null;
  if (code === 0) return isDay ? 32 : 31;   // Clear sky → Sunny (day) / Clear (night)
  if (code <= 2) return isDay ? 34 : 33;    // Mainly/partly clear → Fair (day/night)
  if (code === 3) return 26;     // Overcast → cloudy
  if (code <= 48) return 20;     // Fog/rime fog → haze
  if (code <= 55) return 9;      // Drizzle → light rain
  if (code <= 65) return 12;     // Rain → rain
  if (code <= 67) return 10;     // Freezing rain
  if (code <= 77) return 16;     // Snow / snow grains
  if (code <= 82) return 40;     // Rain showers → heavy showers
  if (code <= 86) return 46;     // Snow showers
  return 4;                       // Thunderstorm
}

// ── Open-Meteo base URLs ──────────────────────────────────────────────────────
const OM_BASE = 'https://api.open-meteo.com/v1/forecast';
const OM_AQ   = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const OM_UNITS = 'temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto';

export function useWeather(profile) {
  const [current, setCurrent]           = useState(null);
  const [history, setHistory]           = useState({});       // keyed by YYYYMMDD, hourly obs
  const [historyRecent, setHistoryRecent] = useState([]);     // rolling 7-day hourly, always fresh
  const historyDailyRef                 = useRef({});         // ref cache keeps callback stable
  const [historyDaily, setHistoryDaily] = useState({});       // keyed by YYYYMMDD, daily summaries
  const [forecast, setForecast]         = useState(null);
  const [hourlyForecast, setHourlyForecast] = useState(null);
  const [airQuality, setAirQuality]     = useState(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState(null);
  const [lastUpdated, setLastUpdated]   = useState(null);
  const locationRef = useRef(null);
  const abortRef = useRef(null);

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
            resolvedIconCode = wmoToTwc(omData.current.weather_code, obs.isDay ?? 1);
          }
        } catch { /* non-fatal — falls back to TWC iconCode */ }
      }

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
        isDay:       obs.isDay                 ?? 1,
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
  }, [stationId]);

  // ── Preview/explore mode: fetch current conditions from Open-Meteo ──────────
  const fetchCurrentPreview = useCallback(async () => {
    if (!previewLat || !previewLon) { setIsLoading(false); setError('No location set — open Settings to choose a preview location.'); return; }
    setError(null);
    try {
      const url = `${OM_BASE}?latitude=${previewLat}&longitude=${previewLon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
        `dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,` +
        `surface_pressure,weather_code,is_day,uv_index` +
        `&${OM_UNITS}`;
      const omRes = await fetch(url, { signal: abortRef.current?.signal });
      const data = await omRes.json();
      if (data.error) throw new Error(data.reason ?? 'Open-Meteo error');
      const c = data.current;
      if (!c) throw new Error('No current data from Open-Meteo');

      locationRef.current = { lat: previewLat, lon: previewLon };
      setLastUpdated(new Date());
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
        precipRate:  null,
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

  // ── Forecast — both modes use TWC daily (lat/lon available in both) ──────────
  const fetchForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;
    try {
      const data = await apiFetch(`/api/weather?type=forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setForecast(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, []);

  // ── Hourly forecast — Open-Meteo (multi-model ensemble, global, includes UV index) ─
  const fetchHourlyForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;
    try {
      const data = await apiFetch(`/api/weather?type=hourly-forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setHourlyForecast(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, []);

  // ── Air quality — all modes call Open-Meteo directly from the browser ────
  const fetchAirQuality = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;

    try {
      const { lat, lon } = loc;
      const url = `${OM_AQ}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`;
      const data = await fetch(url, { signal: abortRef.current?.signal }).then(r => r.json());
      setAirQuality(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError('Air quality unavailable');
    }
  }, []);

  // Clear forecast/hourly/AQ caches when the data source location changes
  const dataSourceKey = isPreviewMode
    ? `preview:${previewLat ?? ''},${previewLon ?? ''}`
    : `station:${stationId ?? ''}`;
  const isFirstDataRender = useRef(true);
  useEffect(() => {
    if (isFirstDataRender.current) { isFirstDataRender.current = false; return; }
    setForecast(null);
    setHourlyForecast(null);
    setAirQuality(null);
  }, [dataSourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCurrent();
    let timer;
    const schedule = () => {
      // ±30s jitter prevents all open tabs from hitting the server simultaneously
      const jitter = (Math.random() - 0.5) * 60_000;
      timer = setTimeout(() => { fetchCurrent(); schedule(); }, POLL_MS + jitter);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [fetchCurrent]);

  return {
    current, history, historyRecent, historyDaily, forecast, hourlyForecast, airQuality,
    isLoading, error, lastUpdated,
    fetchCurrent, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast, fetchHourlyForecast, fetchAirQuality,
  };
}
