# Known Bugs

Last updated: 2026-11-17

<!-- Run /bugtracker to populate this file. Run /bugfixer to fix one item. -->

<!-- Entry format:
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
-->

**Exploring a location in another time zone reads the wrong hours and dates**

Open-Meteo hourly data is fetched with `timezone=auto` (location-local, no offset), but lookups use the device clock: `buildLookahead` builds its key from `now.getHours()`, `getForecastRainThreat`/`getArcData` use the device's `toISODate()`, ForecastTab parses hourly times with `new Date(t)` in the browser zone, and the TWC forecast assigns day 0 to the device's today instead of the payload's `validTimeLocal`. A New York device exploring Los Angeles sees "next 3 hours", the activity arc, the "now" hourly card and rain threat offset by 3 hours; near midnight the date differs and lookups return nothing or the wrong day.

- File: `src/utils/outlook.js:100`, `src/utils/scoring.js:244`, `src/utils/scoring.js:257`, `src/utils/forecastNormalize.js:38-43`, `src/components/ForecastTab.jsx:26-50`
- Impact: user-visible

**Open-Meteo slight/moderate rain showers shown as heavy rain**

`wmoToTwc` maps all of 80–82 to TWC code 40 (heavy rain), so WMO 80 (slight showers) and 81 show "Heavy Rain"; 56/57 (freezing drizzle) fall into the drizzle bucket instead of freezing. The iOS widget's own mapping calls 80/81 "Rain", so app and widget disagree for the same day.

- File: `src/utils/weatherIcons.js:48-52`
- Impact: user-visible

**Per-IP rate limiters never recover if the host clock jumps backward**

A backward clock jump breaks elapsed-time math (the insight cache had the same bug, fixed 2026-11-17 with an `age >= 0` check). `isRateLimited` in `api/insight.js` filters timestamps with `now - ts < CACHE_TTL_MS`; after a backward clock jump every stored timestamp counts as "recent" indefinitely (and the sweep keeps them), so a capped IP stays 429'd. `checkRateLimit` in `api/weather.js` only resets when `now > entry.resetAt`; a backward jump leaves `resetAt` in the future and `count` never resets. Fix is a shared guard that treats negative elapsed as expired.

- File: `api/insight.js:12` (isRateLimited filter), `api/insight.js:24` (ipLog sweep), `api/weather.js:14` (checkRateLimit reset condition)
- Impact: user-visible
