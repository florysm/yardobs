# Tech Debt

Last updated: 2026-11-17

<!-- Run /codecleaner to populate this file. Run /debtpayer to address one item. -->
<!-- Item numbers are stable: resolved items are removed, not renumbered. -->

## High Priority

_None open. Items 1–3 (insight flow, insight handlers, error banner) were fixed 2026-11-17._

## Medium Priority

**4. Weather-code → icon/label mapping defined in 4 tables that disagree**

`WMO_EMOJI` (hourly strip, plus its own precip-suppression remap at `ForecastTab.jsx:31`), `wmoToTwc` → `ICONS`/`LABELS` (current + daily), and the widget's `condition()` all map the same WMO codes differently: WMO 2 is ⛅ hourly but 🌤️ "Fair" elsewhere and "Partly Cloudy" in the widget; WMO 80 is 🌦️ hourly, 🌧️ "Heavy Rain" in the app, "Rain" in the widget; 71 🌨️ vs ❄️; 45/48 "Foggy" vs "Fog"; 66-67 "Freezing Rain" vs "Rain". `ICON_EMOJI` is a bare alias of `ICONS`, the `'🌡️'` fallback is repeated 3×, and `useWeather.js:28-30` has an orphaned comment describing code that moved. One WMO table (code → emoji, label, TWC code) would fix the drift; the widget copy is forced (standalone Scriptable) but needs a parity test.

- `src/utils/weatherIcons.js:25-56`, `src/components/ForecastTab.jsx:31-32,79`, `src/components/HeroCard.jsx:346`, `public/widget/yardobs-widget.js:71-83`

**5. "Last year" date computed 3 different ways**

`HeroCard.jsx:285-287` uses `setFullYear(getFullYear() - 1)` (Feb 29 → Mar 1); TrendsTab's YoY card (`TrendsTab.jsx:377-381`) uses `new Date(year - 1, …)` with a Feb-29 clamp; TrendsTab's charts and rain comparison (`TrendsTab.jsx:387-389, 395`) use `addDays(today, -365)` / `-366`, which is a day off across a leap year — so the YoY card and the chart on the same screen can compare different dates. `addDays` is local to TrendsTab. Belongs in `src/utils/dateUtils.js` as one `lastYearKey(date)` plus `addDays`.

- `src/components/HeroCard.jsx:285-287`, `src/components/TrendsTab.jsx:36, 377-381, 387-396`

**6. TrendsTab.jsx (788 lines) mixes fetching, chart building and narrative logic**

Data helpers, 4 presentational sub-components, a 125-line pure YoY narrative block (`dayPhase`/`lyObsAtCurrentHour`/`yoyInsight`, `:236-360`, no tests), 4 fetching effects, chart building, rain totals and the render. Internal duplication: the trailing-N-day key array is built 7× (`:389, 393-396, 399, 423-425, 458, 474, 516, 527`); `(historyDaily[k] ?? [])[0]?.imperial?.precipTotal ?? 0` 6× (`:517, 522, 534, 543, 550, 556`); the 7d and 30d `chartData` branches (`:457-488`) are near-identical; `range === '30d' ? 30 : 7` 3×; precip digits/unit re-derived in 4 places instead of `formatPrecipTotal`. Extraction targets: a `useTrendsData` hook (keys + fetching + loading, which also fixes the effect race in `KnownBugs.md`), `yoyInsight` to `src/utils/` with tests, and one chart-row builder.

- `src/components/TrendsTab.jsx` overall

**8. Day-part and time-window vocabulary defined in more than one place**

`insightVocab.js` `DAY_PARTS` says it's "the only day-part vocabulary", but TrendsTab's `dayPhase` (`TrendsTab.jsx:236-241`: morning <10, midday <14, afternoon <19) is a second one used in the YoY text. The AQI daytime window is `AQI_DAY_START/END = 8/20` in `forecastNormalize.js:63-64` and hard-coded as "8a–8p" in the prompt at `api/insight.js:394`; the activity arc uses its own `hour < 7 || hour > 18` (`scoring.js:263`). Rain-probability thresholds live in 4 places (`insightVocab.js:103-108`, `scoring.js:232-238`, `scoring.js:69`, `ForecastTab.jsx:31`), and `scoreColor` hard-codes the 65/50 bands instead of calling `scoreBand`.

**9. Widget re-implements app logic with no parity tests**

`public/widget/yardobs-widget.js` is standalone (Scriptable can't import), so copies are expected — but they've already drifted: `keyNote` warns at `d > 7` days while the app's `KEY_WARN_DAYS = 14`; mph→km/h is `1.609344` vs `1.60934`; the WMO table differs (item 4). It also copies `calcFeelsLike`, `daysUntilExpiry`, F→C, and the Open-Meteo URL. `widgetScript.test.js` only tests config injection. A parity test that loads the widget's functions and compares them with the app's on a fixed input set would catch drift.

- `public/widget/yardobs-widget.js:54-68, 71-83, 96-112, 130-134`

## Lower Priority

**10. Repeated inline style objects instead of `.y-*` classes**

Beyond the existing `.y-*` set: the mono value style (`fontSize: 14, fontWeight: 500, color: 'var(--tp)', fontFamily: 'var(--font-mono)'`) ×4 (`ForecastTab.jsx` DailyCard, `TrendsTab.jsx:765`, `ActivityScoreCard.jsx:35`, and the `VALUE_STYLE` constant in `SunMoonCard.jsx`); tiny uppercase labels ×9 with 4 different letter-spacings; tab section headers ×3 (two in `ForecastTab.jsx`, `TrendsTab.jsx:604`); the "API source" footer ×3 (`NowTab.jsx:68`, end of `ForecastTab.jsx`, `TrendsTab.jsx:783` — ForecastTab's also always says "TWC" even in preview, where the forecast comes from Open-Meteo); pulse skeleton ×3; the selectable chip duplicated in `SettingsDrawer.jsx:265-279, 295-309` though `.y-pill`/`.y-msel` exist. Candidates: `.y-value`, `.y-eyebrow`, `.y-section-title`, `.y-source`, `.y-skeleton`.

**11. Sky-condition thresholds and partly-cloudy codes duplicated between App and HeroCard**

`ICON_PARTLY = [23, 24, 29, 30]` (`App.jsx:31`) and `PARTLY_CODES` (`HeroCard.jsx:338`, re-created every render) are the same set, and the sensor thresholds (precip > 0.1 heavy, UV ≥ 5 or solar ≥ 450 sunny, solar < 150 cloudy) appear in both `resolveAutoTheme` (`App.jsx:59, 72-73`) and `deriveFromSensors` (`HeroCard.jsx:329-334, 343`). If one changes, the theme and the hero label disagree. One `src/utils/sky.js` with the codes and thresholds fixes both.

**12. `updatedAt` / time formatting duplicated, and hour formatters multiplying**

`new Date().toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12() })` is byte-identical at `HeroCard.jsx:288` and `ForecastTab.jsx:255` (each card's `useInsight` `accept`), with the same options in `AlertsSheet.jsx:9-11`; `RadarTab.jsx:91` ignores `getLocaleHour12` entirely. More broadly there are 7 hour formatters (`shortHour` '9p', `fmtHourShort` '9P', `fmtHourIso`/`fmtTimeTick` '9pm' with identical bodies, `fmtSunTime`/`fmtMoonTime` identical, `getBestWindow`'s '2 PM'), and the server parses the last one (`api/insight.js:228` `bestWindow.replace('Peak ', '')`).

**13. Profile mode and default-activity string literals with no constants**

`'station'`/`'preview'` appear in ~17 places across 6 files, and the `profile?.mode === 'station' && !!profile?.exploring` derivation is copied in `App.jsx:132`, `TopBar.jsx:64` and `useWeather.js:57`. (Source types are done: `SOURCE_TYPES` in `src/utils/sourceTypes.js`, 2026-11-17.) Default activity `'bbq'` is hard-coded at `App.jsx:110` and `ActivityScoreCard.jsx:134` instead of `ACTIVITIES[0].id`.

**14. Wrapped `localStorage` read idiom copied 9 times**

`try { return localStorage.getItem(K) || d } catch { return d }` appears at `App.jsx:107, 110, 111, 136`, `SettingsDrawer.jsx:62-63`, `StationForm.jsx:11, 13`, `RadarTab.jsx:96` — SettingsDrawer and StationForm repeat the same two reads. A `readStored(key, fallback)` in `storageKeys.js` would replace them. `StationForm.jsx:30-32` also hand-sets the `x-twc-key` header instead of using `apiFetch`.

**15. Duplicated rate limiting in `api/`**

Rate limiting is implemented twice in different styles (fixed window in `api/weather.js:7-29`, sliding log in `api/insight.js:8-29`) with the IP-extraction line duplicated (`insight.js`, `weather.js`); both share the clock-jump bug in `KnownBugs.md`, so one `api/lib/rateLimit.js` fixes it once. (The dead `hourly-forecast-twc`/`air-quality` routes and the stale 400 message were fixed 2026-11-17.)

**17. Pure modules with real logic but no tests**

`src/utils/weatherIcons.js` (`wmoToTwc`, 12 branches — the WMO 80/81 bug in `KnownBugs.md` would have been caught), `parseChangelog.js` and `apiFetch.js`. (`api/weather.js`, `api/insight.js`, `geocode.js` and `storageKeys.js` got tests 2026-11-17.) Also `utils/compass.js` sits alone at the repo root outside `src/`, imported mid-file by `format.js:24`.
