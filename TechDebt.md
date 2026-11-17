# Tech Debt

Last updated: 2026-11-17

<!-- Run /codecleaner to populate this file. Run /debtpayer to address one item. -->
<!-- Item numbers are stable: resolved items are removed, not renumbered. -->

## High Priority

**1. AI-insight fetch + cache flow hand-rolled in 3 components, with 3 different failure policies**

The flow — read localStorage, TTL-gate on `INSIGHT_TTL_MS`, cancel guard, POST `/api/insight`, persist, set state, report failure — is reimplemented in three components (~238 lines total), and the copies have drifted into real bugs (see `KnownBugs.md`: blank/"API busy" results pinned for an hour; HeroCard stuck loading). Differences: cancellation is a closure flag (HeroCard), a token object mirrored in a redundant ref (ForecastTab), or an `AbortController` + 400 ms debounce (ActivityScoreCard — the only one that aborts the request); only ForecastTab and ActivityScoreCard reset loading on a cache hit; HeroCard caches any 200 including `{narrative:''}`, ForecastTab caches only non-empty narratives, ActivityScoreCard caches `''` in its in-memory `iCache` on error; stored shapes differ (`{data, ts}` vs `{insight, ts, conditions}`); `insightId` is derived three ways (`stationId || current?.neighborhood || 'preview'` / `stationId || 'preview'` / `current?.stationId ?? 'preview'`). Client cache keys also hand-copy the server's bucketing (`Math.round(aqi/25)*25`, `Math.round(score/5)*5`, `Math.round(temp/2)*2`). Raised to High because the drift is now producing user-visible bugs. Extraction target: a `useInsight` hook (or `postInsight`/`readCachedInsight` helpers) with one success/failure policy — which also centralizes the `onError` sites from item 3. Large change — see `TechDebt-LargeChanges.md`.

Affected locations (3 files):

- `src/components/HeroCard.jsx:260-326` — daily insight
- `src/components/ForecastTab.jsx:273-353` — forecast-day insight
- `src/components/ActivityScoreCard.jsx:172-261` — activity insight

## Medium Priority

**2. api/insight.js handlers repeat the same cache/call/respond pipeline 3 times**

The activity, daily and forecast-day handlers each repeat: `resolveUnits` + `isPreview = sourceType === 'forecast_model'`, a hand-built key with the same `` `${units}|${isPreview ? 'preview|' : ''}` `` prefix and `Math.round(x/2)*2` buckets (5 copies), `getCacheHit` → `requireApiKey` → `callModel` → `textOf` → `if (cache.size >= CACHE_MAX_SIZE) evictOne(); cache.set(...)` → respond → `handleInsightError` with the same "API is busy" text. Hit/response shapes differ per handler (`hit.text`→`{insight}`, `hit.data`→object, `hit.text`→`{narrative}`), which is part of why the client copies (item 1) diverged. A `cacheSet()` helper and a shared `runCachedInsight({ key, build, parse })` would collapse it.

- `api/insight.js:142-205` (activity), `api/insight.js:258-334` (daily), `api/insight.js:365-415` (forecast-day); evict-then-set at `:199`, `:328`, `:409`; busy text at `:204`, `:333`, `:414`

**3. `componentError` banner state is set but never cleared**

Child components report failures through `onError` into one `componentError` state in `App.jsx`, but nothing ever resets it — no dismiss, no timeout, no clear-on-success — so one transient failure leaves the red banner up all session. `useWeather`'s `error` clears on refetch; `componentError` does not. Also: the report at `HeroCard.jsx:290` can never fire (`fetchHistoryDaily` swallows its own errors and returns null), and ForecastTab's insight reports nothing on failure, unlike the other two cards.

Affected locations (4 files, 3 report sites, 0 clear sites):

- `src/App.jsx:109` — state; `src/App.jsx:232,246` — `onError={setComponentError}` to HeroCard and NowTab (→ ActivityScoreCard, `NowTab.jsx:38`); `src/App.jsx:316-322` — banner
- `src/components/HeroCard.jsx:290,317`
- `src/components/ActivityScoreCard.jsx:256`

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

`new Date().toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12() })` is byte-identical at `HeroCard.jsx:310` and `ForecastTab.jsx:335`, with the same options in `AlertsSheet.jsx:9-11`; `RadarTab.jsx:91` ignores `getLocaleHour12` entirely. More broadly there are 7 hour formatters (`shortHour` '9p', `fmtHourShort` '9P', `fmtHourIso`/`fmtTimeTick` '9pm' with identical bodies, `fmtSunTime`/`fmtMoonTime` identical, `getBestWindow`'s '2 PM'), and the server parses the last one (`api/insight.js:175` `bestWindow.replace('Peak ', '')`).

**13. Profile mode and source-type string literals with no constants**

`'station'`/`'preview'` appear in ~17 places across 6 files, and the `profile?.mode === 'station' && !!profile?.exploring` derivation is copied in `App.jsx:132`, `TopBar.jsx:64` and `useWeather.js:57`. `'forecast_model'`/`'pws'` appear in 8 places client and server. Default activity `'bbq'` is hard-coded at `App.jsx:110` and `ActivityScoreCard.jsx:134` instead of `ACTIVITIES[0].id`.

**14. Wrapped `localStorage` read idiom copied 9 times**

`try { return localStorage.getItem(K) || d } catch { return d }` appears at `App.jsx:107, 110, 111, 136`, `SettingsDrawer.jsx:62-63`, `StationForm.jsx:11, 13`, `RadarTab.jsx:96` — SettingsDrawer and StationForm repeat the same two reads. A `readStored(key, fallback)` in `storageKeys.js` would replace them. `StationForm.jsx:30-32` also hand-sets the `x-twc-key` header instead of using `apiFetch`.

**15. Duplicated rate limiting in `api/`**

Rate limiting is implemented twice in different styles (fixed window in `api/weather.js:7-29`, sliding log in `api/insight.js:8-29`) with the IP-extraction line duplicated (`insight.js`, `weather.js`); both share the clock-jump bug in `KnownBugs.md`, so one `api/lib/rateLimit.js` fixes it once. (The dead `hourly-forecast-twc`/`air-quality` routes and the stale 400 message were fixed 2026-11-17.)

**17. Pure modules with real logic but no tests**

`src/utils/weatherIcons.js` (`wmoToTwc`, 12 branches — the WMO 80/81 bug in `KnownBugs.md` would have been caught), `parseChangelog.js`, `storageKeys.js` (key builders that cache invalidation depends on), and `apiFetch.js`. (`api/weather.js` and `geocode.js` got tests 2026-11-17.) Also `utils/compass.js` sits alone at the repo root outside `src/`, imported mid-file by `format.js:24`.
