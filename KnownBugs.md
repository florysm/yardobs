# Known Bugs

Last updated: 2026-11-17

<!-- Run /bugtracker to populate this file. Run /bugfixer to fix one item. -->

<!-- Entry format:
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
-->

**History caches: today's daily summary frozen, and nothing cleared on station change**

`fetchHistoryDaily` returns `historyDailyRef.current[dateStr]` for any cached date, including today — unlike `fetchHistory`, which refetches today. App fetches today once on load, so `todayObservedHigh` (Forecast card), today's bar/row in 7d/30d charts and rain totals stay at their first-load values all session; after midnight, yesterday's partial row is never refreshed, undercounting rainfall. Separately, `history`, `historyDaily` and `historyDailyRef` are never reset when `dataSourceKey` changes, so after changing station ID in Settings, Trends, HeroCard YoY and the forecast "today high" show the previous station's data (keys are date-only). TrendsTab's `yoyFetched` ref also never resets, so its YoY card keeps the old station's numbers until remount.

- File: `src/hooks/useWeather.js:212`, `src/hooks/useWeather.js:247`, `src/hooks/useWeather.js:327-333` (reset effect skips history), `src/components/TrendsTab.jsx:373-375`
- Impact: user-visible

**Previous location's forecast, hourly, air quality and alerts stick after switching source**

On `dataSourceKey` change the reset effect nulls forecast/hourly/AQ/alerts but leaves `current` and `locationRef.current` alone. App's effect sees `!forecast && current` (old `current`) and immediately refetches — each fetcher reads the old `locationRef.current` and runs under the new, un-aborted controller, so it stores the old location's data. When the new `current` lands, the slots are non-null and App never refetches, leaving the old forecast/hourly/AQ up until the hourly forecast poll (alerts until the 5-min poll). Related: in `fetchCurrentStation` the inner `catch {}` around the Open-Meteo icon lookup swallows `AbortError`, so an aborted request still continues to `setCurrent` with the old station's reading.

- File: `src/hooks/useWeather.js:327-333`, `src/hooks/useWeather.js:269` / `281` / `296` / `315` (fetchers read `locationRef`), `src/App.jsx:180-185`, `src/hooks/useWeather.js:100-114` (swallowed abort)
- Impact: user-visible

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

`ensureFetched` depends on `history`/`fetchHistory`, and `fetchHistory` depends on `history`, so every `setHistory` re-runs the range effect: `setLoading(true)` again and another uncached `fetchHistoryRecent()` (≈3 history-recent requests on mount, more with YoY, all counted against the 30-per-5-min limiter). The effect has no cancel flag, so an earlier run's `.finally(() => setLoading(false))` can clear loading while a later range's fetches are still in flight, rendering a partial chart.

- File: `src/components/TrendsTab.jsx:401-403`, `src/components/TrendsTab.jsx:414-435`, `src/hooks/useWeather.js:225`
- Impact: user-visible

**Upstream 204 becomes a 502 "Upstream non-JSON response"**

A 204 is `ok`, so the `!upstream.ok` branch is skipped and `JSON.parse('')` throws into the 502 path. `twcErrorMessage`'s 204 → "Station not found" branch is unreachable, so an offline/unknown station shows a generic error.

- File: `api/weather.js:136-143`, `api/weather.js:38`
- Impact: user-visible

**Air-quality fetch stores an error body as data**

`fetch(url).then(r => r.json())` has no `r.ok` / `data.error` check, so an Open-Meteo 429/5xx JSON body is stored in `airQuality`. It's non-null, so App never retries, and AQI shows empty until the next hourly forecast poll.

- File: `src/hooks/useWeather.js:305-306`
- Impact: silent failure

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
