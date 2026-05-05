import { useState, useEffect, useCallback, useRef } from 'react';

const POLL_MS = 5 * 60 * 1000;

export function toDateStr(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

export function useWeather(stationId) {
  const [current, setCurrent]       = useState(null);
  const [history, setHistory]       = useState({});   // keyed by YYYYMMDD
  const [forecast, setForecast]     = useState(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const locationRef = useRef(null);

  const fetchCurrent = useCallback(async () => {
    if (!stationId) { setIsLoading(false); return; }
    try {
      const res = await fetch(`/api/weather?type=current&stationId=${encodeURIComponent(stationId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const obs = data.observations?.[0];
      if (!obs) throw new Error('No observation in response');

      locationRef.current = { lat: obs.lat, lon: obs.lon };
      setLastUpdated(new Date());
      setCurrent({
        temp:        obs.imperial?.temp        ?? null,
        feelsLike:   obs.imperial?.windChill   ?? obs.imperial?.heatIndex ?? obs.imperial?.temp ?? null,
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
        stationId:   obs.stationID,
        obsTimeLocal: obs.obsTimeLocal,
        lat: obs.lat,
        lon: obs.lon,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [stationId]);

  // Returns observations array; caches by YYYYMMDD key
  const fetchHistory = useCallback(async (dateStr) => {
    if (!stationId) return null;
    const key = dateStr || toDateStr(new Date());
    if (history[key]) return history[key];
    try {
      const res = await fetch(
        `/api/weather?type=history&stationId=${encodeURIComponent(stationId)}&date=${key}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const obs = data.observations ?? [];
      setHistory(prev => ({ ...prev, [key]: obs }));
      return obs;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [stationId, history]);

  const fetchForecast = useCallback(async () => {
    const loc = locationRef.current;
    if (!loc) return;
    try {
      const res = await fetch(`/api/weather?type=forecast&lat=${loc.lat}&lon=${loc.lon}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setForecast(data);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    fetchCurrent();
    const interval = setInterval(fetchCurrent, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchCurrent]);

  return { current, history, forecast, isLoading, error, lastUpdated, fetchCurrent, fetchHistory, fetchForecast };
}
