# Known Bugs

Last updated: 2026-07-17

<!-- Run /bugtracker to populate this file. Run /bugfixer to fix one item. -->

<!-- Entry format:
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
-->

**Stale fetch response overwrites newer data when station/location changes**

A single AbortController is created once on mount and only aborted on unmount — it is never re-aborted between fetches. When the user switches stations or preview locations, the in-flight request for the old location keeps running; if it resolves after the new location's request, its late response overwrites `current` and `locationRef.current` with stale data. Because `fetchForecast`/`fetchHourlyForecast`/`fetchAirQuality`/`fetchAlerts` all read `locationRef.current`, subsequent fetches then key off the wrong coordinates.

- File: `src/hooks/useWeather.js:62-66` (controller lifecycle), `src/hooks/useWeather.js:326-340` (re-fetch effect that never cancels the prior request)
- Impact: user-visible

**Falsy-zero coordinate guards reject latitude/longitude of exactly 0**

`if (!previewLat || !previewLon)` treats a coordinate of exactly `0` (equator or prime meridian, e.g. Greenwich) as "no location set," so a valid preview/explore location shows the "No location set" error and never loads. The same falsy pattern at line 88 (`obs.lat && obs.lon`) silently skips the Open-Meteo icon supplement for stations at lat/lon 0. Guards should check `== null` instead of falsiness.

- File: `src/hooks/useWeather.js:135`, `src/hooks/useWeather.js:88`
- Impact: user-visible

**Insight cache TTL never expires entries if the host clock jumps backward**

`getCacheHit` computes elapsed time as `Date.now() - hit.ts < CACHE_TTL_MS`; if the server clock jumps backward, elapsed goes negative and the entry always passes the freshness check. The interval sweep uses the same forward-only arithmetic (`now - v.ts >= CACHE_TTL_MS`) and never deletes it either, so a stale insight is served indefinitely until size-pressure eviction (`CACHE_MAX_SIZE`) happens to remove it. Guard should treat negative elapsed as expired.

- File: `api/insight.js:105` (getCacheHit), `api/insight.js:27` (interval sweep)
- Impact: silent failure

**Per-IP rate limiters never recover if the host clock jumps backward**

Same defect class as the insight-cache TTL entry above, in two more places. `isRateLimited` in `api/insight.js` filters timestamps with `now - ts < CACHE_TTL_MS`; after a backward clock jump elapsed goes negative, so every stored timestamp counts as "recent" indefinitely (and the interval sweep keeps them for the same reason) — an IP that hit the 20-call cap stays 429'd until the clock catches back up. `checkRateLimit` in `api/weather.js` only resets its window when `now > entry.resetAt`; a backward jump leaves the stale `resetAt` in the future, `count` keeps incrementing and never resets, locking a capped IP out. Fix is a shared guard that treats negative elapsed as expired.

- File: `api/insight.js:12` (isRateLimited filter), `api/insight.js:24` (ipLog sweep), `api/weather.js:14` (checkRateLimit reset condition)
- Impact: user-visible

**Daily insight handler caches a blank result on JSON parse failure**

When the model response fails to parse (truncation is the known path), `data` remains the default `{ narrative: '', tags: [] }` — or `{}` when `textOf` returns empty — and the handler unconditionally caches it and returns it with a 200. One malformed response poisons the cache: every identical request for the full 15-min TTL is served the blank insight card instead of retrying. It does `console.error`, but the failure is persisted and served as success. Contrast the activity and forecast-day handlers, which cache non-empty partial text on truncation rather than an empty object.

- File: `api/insight.js:309-318`
- Impact: silent failure
