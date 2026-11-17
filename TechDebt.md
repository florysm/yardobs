# Tech Debt

Last updated: 2026-11-17

<!-- Run /codecleaner to populate this file. Run /debtpayer to address one item. -->
<!-- Item numbers are stable: resolved items are removed, not renumbered. -->

## High Priority

_None open. Items 1–3 (insight flow, insight handlers, error banner) were fixed 2026-11-17._

## Medium Priority

**8. Time-window and threshold vocabulary defined in more than one place**

`insightVocab.js` `DAY_PARTS` is the day-part vocabulary (TrendsTab's separate `dayPhase` was folded into it 2026-11-17 — `yoyInsight.js` maps day parts onto its modes). The AQI daytime window is `AQI_DAY_START/END = 8/20` in `forecastNormalize.js:63-64` and hard-coded as "8a–8p" in the prompt at `api/insight.js:394`; the activity arc uses its own `hour < 7 || hour > 18` (`scoring.js:263`). Rain-probability thresholds live in 4 places (`insightVocab.js:103-108`, `scoring.js:232-238`, `scoring.js:69`, and the hourly strip's `HOURLY_MIN_POP_WET/STORM` in `weatherIcons.js`, named 2026-11-17), and `scoreColor` hard-codes the 65/50 bands instead of calling `scoreBand`.

## Lower Priority

**10. Repeated inline style objects instead of `.y-*` classes**

Beyond the existing `.y-*` set: the mono value style (`fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)'`) ×4 (`ForecastTab.jsx` DailyCard, `TrendsTab.jsx` stats row, `ActivityScoreCard.jsx:35`, and the `VALUE_STYLE` constant in `SunMoonCard.jsx`); tiny uppercase labels ×9 with 4 different letter-spacings; tab section headers ×3 (two in `ForecastTab.jsx`, `TrendsTab.jsx:604`); the "API source" footer ×3 (`NowTab.jsx:68`, end of `ForecastTab.jsx`, `TrendsTab.jsx:783` — ForecastTab's also always says "TWC" even in preview, where the forecast comes from Open-Meteo); pulse skeleton ×3; the selectable chip duplicated in `SettingsDrawer.jsx:265-279, 295-309` though `.y-pill`/`.y-msel` exist. Candidates: `.y-value`, `.y-eyebrow`, `.y-section-title`, `.y-source`, `.y-skeleton`.

**12. `updatedAt` / time formatting duplicated, and hour formatters multiplying**

`new Date().toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12() })` is byte-identical at `HeroCard.jsx:288` and `ForecastTab.jsx:255` (each card's `useInsight` `accept`), with the same options in `AlertsSheet.jsx:9-11`; `RadarTab.jsx:91` ignores `getLocaleHour12` entirely. More broadly there are 7 hour formatters (`shortHour` '9p', `fmtHourShort` '9P', `fmtHourIso`/`fmtTimeTick` '9pm' with identical bodies, `fmtSunTime`/`fmtMoonTime` identical, `getBestWindow`'s '2 PM'), and the server parses the last one (`api/insight.js:228` `bestWindow.replace('Peak ', '')`).

**13. Profile mode and default-activity string literals with no constants**

`'station'`/`'preview'` appear in ~17 places across 6 files, and the `profile?.mode === 'station' && !!profile?.exploring` derivation is copied in `App.jsx:132`, `TopBar.jsx:64` and `useWeather.js:57`. (Source types are done: `SOURCE_TYPES` in `src/utils/sourceTypes.js`, 2026-11-17.) Default activity `'bbq'` is hard-coded at `App.jsx:110` and `ActivityScoreCard.jsx:134` instead of `ACTIVITIES[0].id`.

**14. Wrapped `localStorage` read idiom copied 9 times**

`try { return localStorage.getItem(K) || d } catch { return d }` appears at `App.jsx:107, 110, 111, 136`, `SettingsDrawer.jsx:62-63`, `StationForm.jsx:11, 13`, `RadarTab.jsx:96` — SettingsDrawer and StationForm repeat the same two reads. A `readStored(key, fallback)` in `storageKeys.js` would replace them. `StationForm.jsx:30-32` also hand-sets the `x-twc-key` header instead of using `apiFetch`.

**15. Duplicated rate limiting in `api/`**

Rate limiting is implemented twice in different styles (fixed window in `api/weather.js:7-29`, sliding log in `api/insight.js:8-29`) with the IP-extraction line duplicated (`insight.js`, `weather.js`); both share the clock-jump bug in `KnownBugs.md`, so one `api/lib/rateLimit.js` fixes it once. (The dead `hourly-forecast-twc`/`air-quality` routes and the stale 400 message were fixed 2026-11-17.)
