import { INSIGHT_TTL_MS, readStored, writeStored } from './storageKeys';
import { SOURCE_TYPES } from './sourceTypes';

// Entries are { v, data, ts, meta }. Bump the version when the stored shape or
// what counts as a cacheable result changes: older entries then read as misses.
// v2 (2026-11-17): only real results are written; earlier builds could store a
// blank or "API is busy" insight.
// v3 (2026-11-18): Backyard prompt no longer invents a rain contrast on dry days.
const CACHE_VERSION = 3;

// The saved insight for `key`, or null when there is none, it is from an older
// build, it has expired, or it is from the "future" (the clock moved backward).
export function readInsightCache(key, now = Date.now()) {
  try {
    const raw = readStored(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry?.v !== CACHE_VERSION || typeof entry.ts !== 'number' || entry.data == null) return null;
    const age = now - entry.ts;
    return age >= 0 && age < INSIGHT_TTL_MS ? entry : null;
  } catch {
    return null;
  }
}

export function writeInsightCache(key, data, meta, now = Date.now()) {
  writeStored(key, JSON.stringify({ v: CACHE_VERSION, data, ts: now, ...(meta != null ? { meta } : {}) }));
}

// Which place an insight is about, for cache keys and the server's `stationId`.
// A real station is its ID. Forecast-model data (preview and Explore) has no
// station, so it is its coordinates — App's `stationId` stays the home station
// while exploring, and keying on it showed the yard's insight for Paris.
export function insightScope(current) {
  if (!current) return 'preview';
  if (current.sourceType !== SOURCE_TYPES.FORECAST_MODEL && current.stationId) return current.stationId;
  if (current.lat != null && current.lon != null) {
    return `geo${Number(current.lat).toFixed(2)},${Number(current.lon).toFixed(2)}`;
  }
  return 'preview';
}
