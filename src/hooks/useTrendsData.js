import { useEffect, useMemo, useState } from 'react';
import { toDateStr, lastYearKey } from '../utils/dateUtils';
import {
  RANGE_DAYS, trailingDayKeys, lastYearKeys, parseDateKey, hourlyLastYearKeys, summarize,
} from '../utils/trends';

const EMPTY_YOY = { today: null, lastYear: null, lyRaw: [] };

// Everything the Trends tab fetches, and the date keys it reads back by.
// History itself lives in useWeather's caches (passed in as fetchers); this
// hook decides what to request and when the chart is loading.
export function useTrendsData({ stationId, range, metric, showYoY, fetchHistory, fetchHistoryRecent, fetchHistoryDaily }) {
  const [loading, setLoading] = useState(false);
  const [yoy, setYoy] = useState(EMPTY_YOY);

  // Keyed on the date so the lists roll over at midnight, not every render.
  const todayKey = toDateStr(new Date());
  const keys = useMemo(() => {
    const today = parseDateKey(todayKey);
    const rangeKeys = range === '24h' ? [todayKey] : trailingDayKeys(RANGE_DAYS[range], today);
    const lyRangeKeys = lastYearKeys(rangeKeys);
    return {
      today,
      rangeKeys,
      lyRangeKeys,
      last7: trailingDayKeys(7, today),
      hourlyLy: hourlyLastYearKeys(today),
      // Last year's rain for the rainfall card: today's date for 24h, else each range day.
      lyRainKeys: range === '24h' ? [lastYearKey(today)] : lyRangeKeys,
    };
  }, [todayKey, range]);

  // "Today vs. One Year Ago": today's and last year's hourly history.
  useEffect(() => {
    if (!stationId) { setYoy(EMPTY_YOY); return; }
    let cancelled = false;
    Promise.all([fetchHistory(todayKey), fetchHistory(lastYearKey(parseDateKey(todayKey)))])
      .then(([t, l]) => {
        if (!cancelled) setYoy({ today: summarize(t), lastYear: summarize(l), lyRaw: l ?? [] });
      });
    return () => { cancelled = true; };
  }, [stationId, fetchHistory, todayKey]);

  // The 7-day rainfall bars are always shown, whatever the range.
  useEffect(() => {
    if (!stationId) return;
    keys.last7.forEach(k => fetchHistoryDaily(k));
  }, [stationId, fetchHistoryDaily, keys]);

  // The chart's data for the selected range. Only the latest run clears
  // `loading`: an earlier range finishing must not reveal a half-loaded chart.
  useEffect(() => {
    if (!stationId) { setLoading(false); return; }
    let cancelled = false;
    const tasks = range === '24h'
      ? [fetchHistoryRecent(), ...(showYoY ? [fetchHistory(keys.hourlyLy.today), fetchHistory(keys.hourlyLy.yesterday)] : [])]
      : [...keys.rangeKeys, ...(showYoY ? keys.lyRangeKeys : [])].map(k => fetchHistoryDaily(k));
    setLoading(true);
    Promise.all(tasks).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [stationId, range, showYoY, keys, fetchHistory, fetchHistoryRecent, fetchHistoryDaily]);

  // Last year's rain for the rainfall card, only when Rainfall is selected.
  useEffect(() => {
    if (metric !== 'precip' || !stationId) return;
    keys.lyRainKeys.forEach(k => fetchHistoryDaily(k));
  }, [stationId, metric, keys, fetchHistoryDaily]);

  return { loading, yoy, keys };
}
