import { useState, useEffect, useCallback, useRef } from 'react';
import SunCalc from 'suncalc';
import { apiFetch } from '../utils/apiFetch';
import { toDateStr, historyCacheUsable } from '../utils/dateUtils';
import { calcFeelsLike } from '../utils/weatherCalc';
import { normalizeAlerts } from '../utils/alerts';
import { normalizeTwcForecast, normalizeOpenMeteoForecast } from '../utils/forecastNormalize';
import { wmoToTwc } from '../utils/weatherIcons';
import { INHG_PER_HPA } from '../utils/units';

const POLL_MS = 5 * 60 * 1000;
// Forecasts change slowly, but a tab left open all afternoon used to keep
// narrating the morning's forecast — the AI cards describe "the rest of today",
// so the hourly data under them has to keep up.
const FORECAST_POLL_MS = 60 * 60 * 1000;

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

// Stable empties, so consumers' memo/effect deps don't change every render.
const EMPTY_BY_DATE = Object.freeze({ owner: null, byDate: Object.freeze({}) });
const EMPTY_RECENT  = Object.freeze({ owner: null, obs: Object.freeze([]) });

export function useWeather(profile, credentialsVersion) {
  const [current, setCurrent]           = useState(null);
  // Station history. Each slice records the station it belongs to (`owner`), so
  // switching stations can never show the previous station's days — the hook
  // only exposes a slice whose owner matches the current stationId. The ref
  // caches (keyed `${stationId}|${YYYYMMDD}`) keep the fetch callbacks stable.
  const [historyState, setHistoryState]             = useState(EMPTY_BY_DATE); // hourly obs per day
  const [historyRecentState, setHistoryRecentState] = useState(EMPTY_RECENT);  // rolling 7-day hourly
  const [historyDailyState, setHistoryDailyState]   = useState(EMPTY_BY_DATE); // daily summaries
  const historyCacheRef      = useRef({});  // key → { obs, fetchedAt }
  const historyDailyCacheRef = useRef({});
  const inFlightRef          = useRef({});  // `${type}|${key}` → Promise, dedupes concurrent fetches
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

  // Identifies the active data source (station id, or preview/explore coords).
  const dataSourceKey = isPreviewMode
    ? `preview:${previewLat ?? ''},${previewLon ?? ''}`
    : `station:${stationId ?? ''}`;

  // Fresh AbortController per data source: aborting the previous one cancels any
  // in-flight request for the old station/location, so a late response can't
  // overwrite the new location's `current`/`locationRef`.
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    return () => controller.abort();
  }, [dataSourceKey]);

  // ── Station mode: fetch current PWS observation ───────────────────────────
  const fetchCurrentStation = useCallback(async () => {
    if (!stationId) { setIsLoading(false); setError('No station configured — open Settings to add your station ID.'); return; }
    // Take the signal once: re-reading abortRef after an await could pick up the
    // next data source's controller, so a switch mid-request wouldn't cancel it.
    const signal = abortRef.current?.signal;
    setError(null);
    try {
      const data = await apiFetch(`/api/weather?type=current&stationId=${encodeURIComponent(stationId)}`, { signal });
      if (signal?.aborted) return;
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
      if (obs.solarRadiation == null && obs.uv == null && obs.lat != null && obs.lon != null) {
        try {
          const omRes = await fetch(
            `${OM_BASE}?latitude=${obs.lat}&longitude=${obs.lon}&current=weather_code&timezone=auto`,
            { signal }
          );
          const omData = await omRes.json();
          if (omData.current?.weather_code != null) {
            resolvedIconCode = wmoToTwc(omData.current.weather_code, isDay);
          }
        } catch (err) {
          // A cancelled data source must stop here, not fall through to setCurrent.
          if (err.name === 'AbortError') throw err;
          /* otherwise non-fatal — falls back to TWC iconCode */
        }
      }
      if (signal?.aborted) return;

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
    if (previewLat == null || previewLon == null) { setIsLoading(false); setError('No location set — open Settings to choose a preview location.'); return; }
    const signal = abortRef.current?.signal;
    setError(null);
    try {
      const url = `${OM_BASE}?latitude=${previewLat}&longitude=${previewLon}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
        `dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,` +
        `surface_pressure,weather_code,is_day,uv_index,precipitation` +
        `&${OM_UNITS}`;
      const omRes = await fetch(url, { signal });
      const data = await omRes.json();
      if (signal?.aborted) return;
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
        pressure:    c.surface_pressure != null ? Math.round(c.surface_pressure * INHG_PER_HPA * 100) / 100 : null,
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
  // Shared by the hourly and daily history fetchers: serve a usable cached day
  // (see historyCacheUsable — past days are final, today refreshes every 15
  // min), join a request already in flight, or fetch and record it.
  const fetchHistoryDay = useCallback((type, cacheRef, setState, dateStr) => {
    if (isPreviewMode || !stationId) return Promise.resolve(null);
    const sid = stationId;
    const key = `${sid}|${dateStr}`;
    const hit = cacheRef.current[key];
    if (hit && historyCacheUsable(dateStr, hit.fetchedAt)) return Promise.resolve(hit.obs);
    const flightKey = `${type}|${key}`;
    if (inFlightRef.current[flightKey]) return inFlightRef.current[flightKey];

    const signal = abortRef.current?.signal;
    const request = (async () => {
      try {
        const data = await apiFetch(
          `/api/weather?type=${type}&stationId=${encodeURIComponent(sid)}&date=${dateStr}`,
          { signal }
        );
        if (signal?.aborted) return null;
        const obs = data.observations ?? [];
        cacheRef.current[key] = { obs, fetchedAt: Date.now() };
        setState(prev => ({
          owner: sid,
          byDate: { ...(prev.owner === sid ? prev.byDate : {}), [dateStr]: obs },
        }));
        return obs;
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
        return null;
      } finally {
        delete inFlightRef.current[flightKey];
      }
    })();
    inFlightRef.current[flightKey] = request;
    return request;
  }, [isPreviewMode, stationId]);

  const fetchHistory = useCallback(
    (dateStr) => fetchHistoryDay('history', historyCacheRef, setHistoryState, dateStr || toDateStr(new Date())),
    [fetchHistoryDay]
  );

  const fetchHistoryDaily = useCallback(
    (dateStr) => fetchHistoryDay('history-daily', historyDailyCacheRef, setHistoryDailyState, dateStr),
    [fetchHistoryDay]
  );

  const fetchHistoryRecent = useCallback(async () => {
    if (isPreviewMode) return null;
    if (!stationId) return null;
    const sid = stationId;
    const signal = abortRef.current?.signal;
    try {
      const data = await apiFetch(
        `/api/weather?type=history-recent&stationId=${encodeURIComponent(sid)}`,
        { signal }
      );
      if (signal?.aborted) return null;
      const obs = data.observations ?? [];
      setHistoryRecentState({ owner: sid, obs });
      return obs;
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
      return null;
    }
  }, [isPreviewMode, stationId]);

  // Only expose history that belongs to the current station.
  const history       = historyState.owner       === stationId ? historyState.byDate      : EMPTY_BY_DATE.byDate;
  const historyDaily  = historyDailyState.owner  === stationId ? historyDailyState.byDate : EMPTY_BY_DATE.byDate;
  const historyRecent = historyRecentState.owner === stationId ? historyRecentState.obs   : EMPTY_RECENT.obs;

  // ── Daily forecast — TWC for station owners, Open-Meteo for preview ──────────
  // The TWC 5-day is a geocoded model forecast, not station data (the PWS routes
  // are the stationId-keyed ones) — station owners stay on it so their forecast
  // icons and phrasing match the TWC conditions they see elsewhere. Preview mode
  // is served by Open-Meteo, which needs no key: see fetchHourlyForecast.
  const fetchForecast = useCallback(async () => {
    const loc = locationRef.current;
    const signal = abortRef.current?.signal;
    if (!loc || !stationId) return; // preview's forecast rides along with the hourly fetch
    try {
      const data = await apiFetch(`/api/weather?type=forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal });
      if (signal?.aborted) return;
      setForecast(normalizeTwcForecast(data, currentIconRef.current));
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    }
  }, [stationId]);

  // ── Hourly forecast — Open-Meteo (multi-model ensemble, global, includes UV index) ─
  const fetchHourlyForecast = useCallback(async () => {
    const loc = locationRef.current;
    const signal = abortRef.current?.signal;
    if (!loc) return;
    try {
      const data = await apiFetch(`/api/weather?type=hourly-forecast&lat=${loc.lat}&lon=${loc.lon}`, { signal });
      if (signal?.aborted) return;
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
    const signal = abortRef.current?.signal;
    if (!loc) return;

    try {
      const { lat, lon } = loc;
      // hourly us_aqi rides along on the same request the current reading needs,
      // so the Forecast tab can describe air quality per day instead of smearing
      // today's number across all five. See aqiForDay in forecastNormalize.js.
      const url = `${OM_AQ}?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&hourly=us_aqi&forecast_days=5&timezone=auto`;
      const res = await fetch(url, { signal });
      const data = await res.json();
      if (signal?.aborted) return;
      // Leave airQuality null on failure so App's effect retries with the next
      // conditions update, instead of storing an error body as data.
      if (!res.ok || data?.error) throw new Error(data?.reason ?? `HTTP ${res.status}`);
      setAirQuality(data);
    } catch (err) {
      if (err.name !== 'AbortError') setError('Air quality unavailable');
    }
  }, []);

  // ── Severe-weather alerts — via proxy (NWS, US-only). Failures are silent:
  //    outside NWS coverage the endpoint 4xxs, which simply means "no alerts". ─
  const fetchAlerts = useCallback(async () => {
    const loc = locationRef.current;
    const signal = abortRef.current?.signal;
    if (!loc) return;
    try {
      const raw = await apiFetch(`/api/weather?type=alerts&lat=${loc.lat}&lon=${loc.lon}`, { signal });
      if (signal?.aborted) return;
      setAlerts(normalizeAlerts(raw));
    } catch (err) {
      if (err.name !== 'AbortError') setAlerts([]);
    }
  }, []);

  // Clear everything derived from the old data source's location. locationRef
  // matters most: App refetches the (now empty) forecast slots immediately, and
  // with the old coordinates still here those requests would run under the new,
  // un-aborted controller and store the old location's data. With it cleared,
  // they no-op until the new source's first reading sets the new location.
  // Station history needs no reset — it's tagged with its owner (see above).
  const isFirstDataRender = useRef(true);
  useEffect(() => {
    if (isFirstDataRender.current) { isFirstDataRender.current = false; return; }
    locationRef.current = null;
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

  // Initial forecast loads stay in App (they wait for the first observation);
  // this only keeps them fresh. Each fetcher no-ops until a location is known.
  useEffect(() => {
    let timer;
    const schedule = () => {
      const jitter = (Math.random() - 0.5) * 120_000;
      timer = setTimeout(() => {
        fetchForecast();
        fetchHourlyForecast();
        fetchAirQuality();
        schedule();
      }, FORECAST_POLL_MS + jitter);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [fetchForecast, fetchHourlyForecast, fetchAirQuality]);

  return {
    current, history, historyRecent, historyDaily, forecast, hourlyForecast, airQuality, alerts,
    isLoading, error, lastUpdated,
    fetchCurrent, fetchHistory, fetchHistoryRecent, fetchHistoryDaily, fetchForecast, fetchHourlyForecast, fetchAirQuality, fetchAlerts,
  };
}
