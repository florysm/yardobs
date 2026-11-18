# Tech Debt

Last updated: 2026-11-17

<!-- Run /codecleaner to populate this file. Run /debtpayer to address one item. -->
<!-- Item numbers are stable: resolved items are removed, not renumbered. -->

## High Priority

_None open. Items 1–3 (insight flow, insight handlers, error banner) were fixed 2026-11-17._

## Medium Priority

**8. Rain-threshold and score-band vocabulary defined in more than one place**

`insightVocab.js` `DAY_PARTS` is the day-part vocabulary (TrendsTab's separate `dayPhase` was folded into it 2026-11-17 — `yoyInsight.js` maps day parts onto its modes). The time windows are done (2026-11-17): the AQI window is `AQI_DAY_START/END` + `AQI_WINDOW_LABEL` in `insightVocab.js`, used by `aqiForDay` and the Forecast prompt, and the activity arc's hours are `ARC_START_HOUR/END_HOUR` in `scoring.js`. Still open: rain-probability thresholds live in 4 places (`insightVocab.js` `RAIN_TERMS`, `scoring.js` `precipProbToRate`, `scoring.js:69`, and the hourly strip's `HOURLY_MIN_POP_WET/STORM` in `weatherIcons.js`), and `scoreColor` hard-codes the 65/50 bands instead of calling `scoreBand`.

## Lower Priority

**10. Repeated inline style objects instead of `.y-*` classes**

Beyond the existing `.y-*` set: the mono value style (`fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)'`) ×4 (`ForecastTab.jsx` DailyCard, `TrendsTab.jsx` stats row, `ActivityScoreCard.jsx:35`, and the `VALUE_STYLE` constant in `SunMoonCard.jsx`); tiny uppercase labels ×9 with 4 different letter-spacings; tab section headers ×3 (two in `ForecastTab.jsx`, `TrendsTab.jsx:604`); the "API source" footer ×3 (`NowTab.jsx:68`, end of `ForecastTab.jsx`, `TrendsTab.jsx:783` — ForecastTab's also always says "TWC" even in preview, where the forecast comes from Open-Meteo); pulse skeleton ×3; the selectable chip duplicated in `SettingsDrawer.jsx:265-279, 295-309` though `.y-pill`/`.y-msel` exist. Candidates: `.y-value`, `.y-eyebrow`, `.y-section-title`, `.y-source`, `.y-skeleton`.

**12. Hour formatters multiplying**

Partly done 2026-11-17: `fmtClockTime(date, timeZone)` in `format.js` replaced the identical `fmtSunTime`/`fmtMoonTime` and the `updatedAt` line copied in `HeroCard.jsx`/`ForecastTab.jsx`. Still open: `RadarTab.jsx` frame times ignore `getLocaleHour12` (could use `fmtClockTime`); `AlertsSheet.jsx` `fmtAlertTime` (weekday + time) stays separate. Hour formatters still overlap: `shortHour` '9p', `fmtHourShort` '9P', `fmtHourIso`/`fmtTimeTick` '9pm' with identical bodies, `getBestWindow`'s '2 PM' — and the server parses the last one (`api/insight.js` `bestWindow.replace('Peak ', '')`).

**13. Profile mode and default-activity string literals with no constants**

`'station'`/`'preview'` appear in ~17 places across 6 files, and the `profile?.mode === 'station' && !!profile?.exploring` derivation is copied in `App.jsx:132`, `TopBar.jsx:64` and `useWeather.js:57`. (Source types are done: `SOURCE_TYPES` in `src/utils/sourceTypes.js`, 2026-11-17.) Default activity `'bbq'` is hard-coded at `App.jsx:110` and `ActivityScoreCard.jsx:134` instead of `ACTIVITIES[0].id`.

**14. Wrapped `localStorage` read idiom copied 9 times**

`try { return localStorage.getItem(K) || d } catch { return d }` appears at `App.jsx:107, 110, 111, 136`, `SettingsDrawer.jsx:62-63`, `StationForm.jsx:11, 13`, `RadarTab.jsx:96` — SettingsDrawer and StationForm repeat the same two reads. A `readStored(key, fallback)` in `storageKeys.js` would replace them. `StationForm.jsx:30-32` also hand-sets the `x-twc-key` header instead of using `apiFetch`.

**15. Duplicated rate limiting in `api/`**

Rate limiting is implemented twice in different styles (fixed window in `api/weather.js:7-29`, sliding log in `api/insight.js:8-29`) with the IP-extraction line duplicated (`insight.js`, `weather.js`); both share the clock-jump bug in `KnownBugs.md`, so one `api/lib/rateLimit.js` fixes it once. (The dead `hourly-forecast-twc`/`air-quality` routes and the stale 400 message were fixed 2026-11-17.)
