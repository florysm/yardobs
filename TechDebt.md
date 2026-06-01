# Tech Debt

Last updated: 2026-06-01

<!-- Run /codecleaner to populate this file. Run /debtpayer to address one item. -->

## High Priority

**1. NowTab and ForecastTab have no ErrorBoundary**

TrendsTab and RadarTab are both wrapped in `<ErrorBoundary>` in App.jsx (lines 181 and 210), but NowTab (line 170) and ForecastTab (line 206) are not. A render error inside either core tab — for example, from malformed API data — will propagate upward and crash the entire app with a blank white screen. Adding an `ErrorBoundary` wrapper around each tab costs three lines and eliminates the blast radius.

- `src/App.jsx:170` — NowTab, no ErrorBoundary
- `src/App.jsx:206` — ForecastTab, no ErrorBoundary

## Medium Priority

**2. StationForm defined inline inside SettingsDrawer**

`StationForm` (lines 29–132 of SettingsDrawer.jsx, 104 lines) is defined as a module-level function inside the same file as `SettingsDrawer`. It has no closure dependencies on SettingsDrawer state — it receives only `initialStationId` and `onSave` as props. The size and self-contained logic make it a clear extraction candidate (`src/components/StationForm.jsx`). As long as it lives inline the component cannot be tested or reused in isolation, and SettingsDrawer.jsx runs to ~408 lines.

- `src/components/SettingsDrawer.jsx:29–132` — StationForm definition

**3. Inconsistent component error-handling strategies**

Components surface errors through at least three incompatible patterns, leaving no canonical model for new work:

- **`onError` callback prop** — HeroCard, ActivityScoreCard, and NowTab call `onError?.(message)` to bubble errors up to App.jsx's bottom banner.
- **Local `errorMsg` state** — SettingsDrawer and StationForm manage their own inline error display and never surface to the app-level banner.
- **Silent drop** — ForecastTab has no error path; data failures render as empty/blank sections with no user feedback.

New contributors will pick a pattern inconsistently, and errors in the local-state components are invisible to the app-level error banner.

- `src/components/HeroCard.jsx` — onError callback
- `src/components/ActivityScoreCard.jsx` — onError callback
- `src/components/SettingsDrawer.jsx:33,44,50,57,68` — local errorMsg state
- `src/components/ForecastTab.jsx` — no error handling

## Lower Priority

**4. Pure utilities defined inside `useWeather.js`**

`calcFeelsLike` (lines 8–34) implements the NWS Rothfusz heat index and wind chill formulas. `toDateStr` (lines 36–38) converts a Date to a compact string. Both are pure functions with zero React dependencies but live in the hook file, where they are invisible to the rest of the app. `calcFeelsLike` belongs in `src/utils/` (alongside other formula-based helpers), and `toDateStr` belongs in `src/utils/format.js`. `TrendsTab.jsx` already imports `toDateStr` from `useWeather` — a sign that the placement is already confusing consumers.

- `src/hooks/useWeather.js:8–38` — calcFeelsLike, toDateStr
- `src/components/TrendsTab.jsx:5` — imports toDateStr from a hook file

**5. `windDirStr` in `api/insight.js` duplicates `degreesToCompass`**

`api/insight.js:41–42` defines its own `windDirStr()` using `COMPASS_DIRS[Math.round(deg / 22.5) % 16]` — the same expression as `degreesToCompass()` in `src/utils/format.js:10`. Both files import from `utils/compass.js` for the `COMPASS_DIRS` array, but insight.js wraps it in a private function rather than sharing the exported helper. If the rounding logic ever changes, both must be updated.

- `api/insight.js:41–42` — private windDirStr wrapper
- `src/utils/format.js:8–11` — exported degreesToCompass

**6. CORS headers manually duplicated across API routes**

`api/weather.js:38` and `api/insight.js:249` each independently set `Access-Control-Allow-Origin: *` and handle the OPTIONS preflight. Any new route must copy this pattern, and a CORS policy change requires touching every route file. A two-line helper in `api/lib/` would centralize this.

- `api/weather.js:38`
- `api/insight.js:249`

**7. Suspense fallback JSX duplicated in App.jsx**

Identical loading-spinner markup appears at lines 182–185 (TrendsTab) and 211–214 (RadarTab). A style change requires updating both. Extracting to a `LazyTabFallback` component or constant would make the fallback a single edit.

- `src/App.jsx:182–185`
- `src/App.jsx:211–214`

**8. `WEATHER_THEMES` set in SettingsDrawer duplicates theme IDs from themes.js**

`SettingsDrawer.jsx:7` declares `const WEATHER_THEMES = new Set(['sunny', 'cloudy', 'rainy', 'stormy'])` — a manual copy of the weather theme names already defined as keys in the `THEMES` object in `src/themes.js`. If a new weather theme is added to themes.js, this set must be manually updated or the preview-dot logic silently diverges.

- `src/components/SettingsDrawer.jsx:7`
- `src/themes.js:2–35` — authoritative theme key definitions
