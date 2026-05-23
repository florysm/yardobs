import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../utils/apiFetch';

const POLL_MS = 5 * 60 * 1000;

// NWS Rothfusz heat index (°F) — valid when T >= 80°F and RH >= 40%
// NWS wind chill (°F) — valid when T <= 50°F and wind >= 3 mph
function calcFeelsLike(tempF, humidity, windMph) {
  if (tempF == null) return null;
  const T = tempF;
  const RH = humidity ?? 0;
  const V = windMph ?? 0;

  if (T >= 80 && RH >= 40) {
    const hi =
      -42.379 +
      2.04901523 * T +
      10.14333127 * RH -
      0.22475541 * T * RH -
      0.00683783 * T * T -
      0.05391553 * RH * RH +
      0.00122874 * T * T * RH +
      0.00085282 * T * RH * RH -
      0.00000199 * T * T * RH * RH;
    return Math.round(hi);
  }

  if (T <= 50 && V >= 3) {
    const wc = 35.74 + 0.6215 * T - 35.75 * Math.pow(V, 0.16) + 0.4275 * T * Math.pow(V, 0.16);
    return Math.round(wc);
  }

  return Math.round(T);
}

export function toDateStr(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

// Converts Open-Meteo WMO weather codes to approximate TWC icon codes so that
// resolveAutoTheme and ForecastTab's buildDays (which both expect TWC codes) work
// without modification in preview mode.
function wmoToTwc(code) {
  if (code == null) return null;
  if (code === 0) return 32;     // Clear sky → sunny
  if (code <= 2) return 34;      // Mainly/partly clear → partly sunny
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

  const isPreview = profile?.mode === 'preview';
  const stationId = profile?.stationId ?? null;

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, []);

  // ── Station mode: fetch current PWS observation ───────────────────────────
  const fetchCurrentStation = useCallback(async () => {
    if (!stationId) { setIsLoading(false); return; }
    try {
      const data = await apiFetch(`/api/weather?type=current&stationId=${encodeURIComponent(stationId)}`, { signal: abortRef.current?.signal });
      const obs = data.observations?.[0];
      if (!obs) throw new Error('No observation in response');

      locationRef.current = { lat: obs.lat, lon: obs.lon };
      setLastUpdated(new Date());
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
        iconCode:    obs.iconCode              ?? null,
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

  // ── Preview mode: fetch current conditions from Open-Meteo ────────────────
  const fetchCurrentPreview = useCallback(async () => {
    if (!profile?.lat || !profile?.lon) { setIsLoading(false); return; }
    const { lat, lon } = profile;
    try {
      const url = `${OM_BASE}?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
        `dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,` +
        `surface_pressure,weather_code,is_day,uv_index` +
        `&${OM_UNITS}`;
      const data = await fetch(url, { signal: abortRef.current?.signal }).then(r => r.json());
      const c = data.current;
      if (!c) throw new Error('No current data from Open-Meteo');

      locationRef.current = { lat, lon };
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
        iconCode:    wmoToTwc(c.weather_code),
        isDay:       c.is_day                   ?? 1,
        stationId:   null,
        neighborhood: profile.label             ?? null,
        country:     null,
        obsTimeLocal: c.time,
        lat,
        lon,
        sourceType:  'forecast_model',
        sourceLabel: 'Weather Forecast',
      });
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [profile]);

  const fetchCurrent = isPreview ? fetchCurrentPreview : fetchCurrentStation;

  // ── History functions — no-op in preview mode ────────────────────────────
  const fetchHistory = useCallback(async (dateStr) => {
    if (isPreview) return null;
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
  }, [isPreview, stationId, history]);

  const fetchHistoryRecent = useCallback(async () => {
    if (isPreview) return null;
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
  }, [isPreview, stationId]);

  const fetchHistoryDaily = useCallback(async (dateStr) => {
    if (isPreview) return null;
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
  }, [isPreview, stationId]);

  // ── Forecast — station mode uses TWC; preview uses Open-Meteo daily ───────
  const fetchForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;

    if (isPreview) {
      try {
        const { lat, lon } = loc;
        const url = `${OM_BASE}?latitude=${lat}&longitude=${lon}` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset` +
          `&forecast_days=7&${OM_UNITS}`;
        const data = await fetch(url, { signal: abortRef.current?.signal }).then(r => r.json());
        const d = data.daily;
        if (!d) throw new Error('No daily data from Open-Meteo');
        // Normalize to TWC forecast shape expected by ForecastTab's buildDays()
        setForecast({
          dayOfWeek: d.time.map(t => new Date(t + 'T12:00').toLocaleDateString('en-US', { weekday: 'long' })),
          temperatureMax: d.temperature_2m_max,
          temperatureMin: d.temperature_2m_min,
          daypart: [{
            iconCode:    d.weather_code.flatMap(c => [wmoToTwc(c), null]),
            precipChance: d.precipitation_probability_max.flatMap(p => [p, null]),
          }],
        });
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      }
      return;
    }

    try {
      const data = await apiFetch(`/api/weather?type=forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setForecast(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, [isPreview]);

  // ── Hourly forecast — station uses proxy; preview calls Open-Meteo directly
  const fetchHourlyForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;

    if (isPreview) {
      try {
        const { lat, lon } = loc;
        const url = `${OM_BASE}?latitude=${lat}&longitude=${lon}` +
          `&hourly=temperature_2m,precipitation_probability,weathercode,apparent_temperature,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,uv_index` +
          `&daily=sunrise,sunset&forecast_days=2&${OM_UNITS}`;
        const data = await fetch(url, { signal: abortRef.current?.signal }).then(r => r.json());
        setHourlyForecast(data);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      }
      return;
    }

    try {
      const data = await apiFetch(`/api/weather?type=hourly-forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setHourlyForecast(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, [isPreview]);

  // ── Air quality — station uses proxy; preview calls Open-Meteo directly ───
  const fetchAirQuality = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;

    if (isPreview) {
      try {
        const { lat, lon } = loc;
        const url = `${OM_AQ}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`;
        const data = await fetch(url, { signal: abortRef.current?.signal }).then(r => r.json());
        setAirQuality(data);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      }
      return;
    }

    try {
      const data = await apiFetch(`/api/weather?type=air-quality&lat=${loc.lat}&lon=${loc.lon}`, { signal: abortRef.current?.signal });
      setAirQuality(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, [isPreview]);

  useEffect(() => {
    fetchCurrent();
    const interval = setInterval(fetchCurrent, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchCurrent]);

  return {
    current, history, historyRecent, historyDaily, forecast, hourlyForecast, airQuality,
    isLoading, error, lastUpdated,
    fetchCurrent, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast, fetchHourlyForecast, fetchAirQuality,
  };
}
