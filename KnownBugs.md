# Known Bugs

Last updated: 2026-11-17

<!-- Run /bugtracker to populate this file. Run /bugfixer to fix one item. -->

<!-- Entry format:
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
-->

**Insight cards pin blank or "API busy" results for an hour**

The server no longer caches a blank daily insight, but clients still do. On an Anthropic overload, `handleInsightError` returns the "Insight temporarily unavailable — API is busy" text as a 200, and on a daily parse failure/refusal the handler returns 200 `{ narrative: '', tags: [] }` or `{}`. HeroCard stores `{...json, updatedAt}` in localStorage with no narrative check; ForecastTab and ActivityScoreCard cache any non-empty text. One overload or bad response shows a blank or "busy" card for the full 1-hour client TTL.

- File: `api/insight.js:106-110`, `api/insight.js:320-331`, `src/components/HeroCard.jsx:310-312`
- Impact: user-visible

**HeroCard insight view can get stuck "loading", blocking the Conditions toggle**

On a localStorage cache hit the effect calls `setInsight(data); return;` without `setInsightLoading(false)`. If an earlier run was cancelled mid-fetch (its `finally` skips the reset when `cancelled`), `insightLoading` stays `true`, and `switchView` returns early, so the user can't switch back. Trigger: a dependency (`units`, `current`, `stationId`) changes while a fetch is in flight and the new key is already cached. ForecastTab resets loading on its cache hit; HeroCard doesn't.

- File: `src/components/HeroCard.jsx:270-276`, `src/components/HeroCard.jsx:251`
- Impact: user-visible

**Exploring a location in another time zone reads the wrong hours and dates**

Open-Meteo hourly data is fetched with `timezone=auto` (location-local, no offset), but lookups use the device clock: `buildLookahead` builds its key from `now.getHours()`, `getForecastRainThreat`/`getArcData` use the device's `toISODate()`, ForecastTab parses hourly times with `new Date(t)` in the browser zone, and the TWC forecast assigns day 0 to the device's today instead of the payload's `validTimeLocal`. A New York device exploring Los Angeles sees "next 3 hours", the activity arc, the "now" hourly card and rain threat offset by 3 hours; near midnight the date differs and lookups return nothing or the wrong day.

- File: `src/utils/outlook.js:100`, `src/utils/scoring.js:244`, `src/utils/scoring.js:257`, `src/utils/forecastNormalize.js:38-43`, `src/components/ForecastTab.jsx:26-50`
- Impact: user-visible

**TrendsTab range effect refetches on every history update and its loading flag races**

`ensureFetched` depends on the `history` object, so every history write gives it a new identity and re-runs the range effect: `setLoading(true)` again and another uncached `fetchHistoryRecent()` (more with YoY on, all counted against the 30-per-5-min limiter). `fetchHistory` itself is stable since 2026-11-17, so this is now confined to TrendsTab. The effect has no cancel flag, so an earlier run's `.finally(() => setLoading(false))` can clear loading while a later range's fetches are still in flight, rendering a partial chart.

- File: `src/components/TrendsTab.jsx` (`ensureFetched` and the "Range-aware data fetching" effect)
- Impact: user-visible

**Open-Meteo slight/moderate rain showers shown as heavy rain**

`wmoToTwc` maps all of 80–82 to TWC code 40 (heavy rain), so WMO 80 (slight showers) and 81 show "Heavy Rain"; 56/57 (freezing drizzle) fall into the drizzle bucket instead of freezing. The iOS widget's own mapping calls 80/81 "Rain", so app and widget disagree for the same day.

- File: `src/utils/weatherIcons.js:48-52`
- Impact: user-visible

**Insight cache TTL never expires entries if the host clock jumps backward**

`getCacheHit` computes elapsed time as `Date.now() - hit.ts < CACHE_TTL_MS`; if the server clock jumps backward, elapsed goes negative and the entry always passes the freshness check. The interval sweep uses the same forward-only arithmetic (`now - v.ts >= CACHE_TTL_MS`) and never deletes it either, so a stale insight is served indefinitely until size-pressure eviction (`CACHE_MAX_SIZE`) happens to remove it. Guard should treat negative elapsed as expired.

- File: `api/insight.js:97` (getCacheHit), `api/insight.js:27` (interval sweep)
- Impact: silent failure

**Per-IP rate limiters never recover if the host clock jumps backward**

Same defect class as the insight-cache TTL entry above. `isRateLimited` in `api/insight.js` filters timestamps with `now - ts < CACHE_TTL_MS`; after a backward clock jump every stored timestamp counts as "recent" indefinitely (and the sweep keeps them), so a capped IP stays 429'd. `checkRateLimit` in `api/weather.js` only resets when `now > entry.resetAt`; a backward jump leaves `resetAt` in the future and `count` never resets. Fix is a shared guard that treats negative elapsed as expired.

- File: `api/insight.js:12` (isRateLimited filter), `api/insight.js:24` (ipLog sweep), `api/weather.js:14` (checkRateLimit reset condition)
- Impact: user-visible
