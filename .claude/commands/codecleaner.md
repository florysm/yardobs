# YardObs — Code Cleaner

Scan the codebase for tech debt and refactoring opportunities, then update `TechDebt.md`.

## Usage

`/codecleaner` — scan the full codebase

## Steps

1. Read `TechDebt.md` in full to see what is already tracked.
2. Spawn parallel Explore subagents (one for utilities/state, one for components/infrastructure) — give each the search targets from the relevant section below. Also list files added since `TechDebt.md`'s `Last updated` date (`git log --since=<date> --diff-filter=A --name-only -- src api`) and include them — new code is where new duplication shows up.
3. For every candidate, read the relevant files to confirm the issue and count exactly how many locations are affected.
4. Update `TechDebt.md`:
   - Add new items under the appropriate priority tier (High / Medium / Lower Priority).
   - Remove items that are no longer present in the code.
   - Update scope counts in existing items if they have changed.
   - Set `Last updated:` to today's date.
5. Report a brief summary: N new items, N resolved and removed, N scope counts updated.
6. If a search target below turned out to be stale (already fixed, or references code that no longer exists), update this file too — convert fixed items into invariant checks, delete dead references.

## What counts as tech debt

Concrete duplication, inconsistency, or missing abstraction — verifiable by reading the code. Minimum bar to record: the same problem appears in 2+ files, or a pattern is broken in a way that will cause real pain when extending the codebase. Do not record style preferences.

## Priority guidance

- **High**: will cause a bug or significant maintenance cost before the next feature is complete
- **Medium**: pain grows as the codebase grows — address within a few sprints
- **Lower Priority**: annoying but stable — address opportunistically

## Search targets — utilities and state

These are invariants the codebase currently satisfies (re-verified 2026-11-17). Verify each still holds; any drift is new debt.

**Single-definition utilities:**

- `fmt` and `degreesToCompass` are defined only in `src/utils/format.js`; `toDateStr` only in `src/utils/dateUtils.js`; `calcFeelsLike` only in `src/utils/weatherCalc.js` (pure, tested) — **except** `public/widget/yardobs-widget.js`, a standalone Scriptable script that can't import; its copies are expected and tracked as a parity-test gap (TechDebt item 9), not as duplication. Grep for any other second definition. Also flag new pure formulas inline in hooks/components instead of `src/utils/` (still inline as of 2026-11-17: `moonPhaseName`/`fmtDaylight` in ForecastTab, `dayPhase`/`yoyInsight` in TrendsTab, `deriveFromSensors` in HeroCard).
- Date helpers: `addDays` and a "last year" helper don't exist in `dateUtils.js` yet — tracked as item 5 (three different last-year computations). Once added, every last-year date must go through it.

**localStorage keys:**

- All keys live in `src/utils/storageKeys.js` (`STORAGE_KEYS` object plus the `insightKey`/`activityInsightKey`/`forecastDayInsightKey` builders). Grep `localStorage.getItem` / `setItem` / `removeItem` across all files — any call site passing a raw string literal instead of a `STORAGE_KEYS.*` constant or key builder is debt. (Holds 2026-11-17: 30 call sites, all via constants. The wrapped-read idiom is copied 9× — tracked as item 14.)

**Theme name literals:**

- Theme names derive from `THEME_IDS` / `WEATHER_THEME_IDS` / `DISPLAY_MODES` / `CONDITION_PREVIEWS` exported by `src/themes.js`. Grep for quoted `'sunny'`, `'cloudy'`, `'rainy'`, `'stormy'`, `'light'`, `'dark'` outside `themes.js` — any hit in JS/JSX is debt. Exception: the `body.theme-*` class selectors in `src/index.css` are irreducible (CSS cannot import the constant) and are not debt. (A comment mentioning theme names in `App.jsx:66` is a grep hit but not debt.)

**Duplicated formatting and constants (tracked in TechDebt.md, re-verify until fixed):**

- The `updatedAt` `toLocaleTimeString(...)` line duplicated in `HeroCard.jsx`/`ForecastTab.jsx`/`AlertsSheet.jsx`, plus 7 overlapping hour formatters — tracked as item 12. Once a `fmtUpdatedAt()` lands in `src/utils/format.js`, convert this into a single-definition invariant.
- The hPa↔inHg constant is single-sourced as `INHG_PER_HPA` in `units.js` (fixed 2026-11-17) — flag any raw `0.02953`. More generally: grep for repeated numeric literals that form conversion pairs across files.
- Client cache keys that must match server bucketing: only ForecastTab's `Math.round(aqi/25)*25` still mirrors the server (`bucket(aqi, 25)` in `api/insight.js`); the server's buckets go through one `bucket(v, step, fallback)` helper (2026-11-17). Flag any new client/server pair that must agree but isn't shared.

**Vocabularies and code tables (found 2026-11-17):**

- Weather-code mapping: 4 tables disagree (item 4). Once unified, the invariant is one WMO table in `src/utils/weatherIcons.js`; flag any new emoji/label lookup elsewhere.
- Day parts / time windows: `insightVocab.js` `DAY_PARTS` is meant to be the only vocabulary; TrendsTab `dayPhase`, the AQI 8a–8p window in the prompt text, and 4 rain-probability threshold sets break that (item 8).
- Sky thresholds / partly-cloudy codes duplicated App ↔ HeroCard (item 11).
- String literals with no constant: profile modes `'station'`/`'preview'`, default activity `'bbq'` (item 13). Source types are single-sourced as `SOURCE_TYPES` in `src/utils/sourceTypes.js` (2026-11-17) — flag any raw `'forecast_model'`/`'pws'` outside it.

## Search targets — components and infrastructure

**Component duplication (invariants to verify):**

- Metric tiles go through the shared `MetricCard` component (`src/components/MetricCard.jsx`); flag any new hand-written label/value/unit card JSX in `NowTab.jsx`, `ForecastTab.jsx`, `TrendsTab.jsx` that duplicates it. (Holds narrowly 2026-11-17 — TrendsTab `DeltaCell`/`.y-stat` tiles and HeroCard's stat strip are near-misses.)
- Shared visual patterns use the `.y-*` utility classes defined in `src/index.css` (`.y-card`, `.y-metric`, `.y-label`, `.y-pill`, `.y-msel`, `.y-stat`, `.y-pref-row`); flag components re-implementing these with inline styles. BROKEN 2026-11-17 — repeated inline objects (mono value ×7, tiny labels ×9, section headers ×3, API-source footer ×3, skeleton ×3, chips ×2) tracked as item 10. When counting, grep the exact style-object text; a recount is the scope update.
- The AI-insight flow goes through `useInsight` (`src/hooks/useInsight.js`, 2026-11-17) on the client and `runCachedInsight` in `api/insight.js` on the server. Invariants: no component fetches `/api/insight` or reads/writes insight localStorage directly (use the hook and `readInsightCache`/`writeInsightCache`); no handler calls `callModel` or writes `cache` outside `runCachedInsight`/`cacheSet`; insight keys and the `stationId` sent use `insightScope(current)`.
- Large components: TrendsTab (~788 lines, item 6) and HeroCard (~470 after `useInsight`). ForecastTab dropped to ~400 lines after `SunMoonCard` was extracted (2026-11-17). Re-measure each scan; flag any other component crossing ~500 lines with mixed fetching + rendering.

**Constant arrays:**

- Activity lists live in `src/utils/activities.js` (`ACTIVITIES`); icon-code classification arrays (`ICON_STORMY`/`ICON_RAINY`/`ICON_CLOUDY`/`ICON_PARTLY`) live in `src/App.jsx`. Grep for array literals in component files that duplicate these or appear in 2+ places — they belong in `src/utils/` or a `src/constants.js`. (Test-local fixture arrays don't count.) `PARTLY_CODES` in `HeroCard.jsx` duplicates `ICON_PARTLY`, together with the sky thresholds — tracked as item 11; STORMY/RAINY/CLOUDY remain single-sourced.

**Error handling (known weak spot — tracked in TechDebt.md):**

- Error surfacing: the bottom banner in `App.jsx` shows only `useWeather`'s `error` (which clears on refetch). Cards own their failure state ("Insight unavailable right now") — `componentError`/`onError` were removed 2026-11-17. Flag any new global error state without a clear path, and check `ErrorBoundary` still wraps every tab. (Known and accepted: `HeroCard` renders outside the per-tab boundaries and relies on the top-level boundary in `main.jsx` — don't re-report.)

**API layer (invariants to verify):**

- `api/weather.js` route branches only build URLs; all branches converge on one shared fetch/status-check/parse path. Flag any new branch that adds its own `fetch` + status-check boilerplate.
- CORS is set only via `applyCors()` in `api/lib/cors.js`; flag any handler setting `Access-Control-*` headers manually.
- The `api/insight.js` in-memory cache is bounded: `CACHE_MAX_SIZE` enforced via `evictOne()` before every insert, plus a TTL sweep interval. Flag any new insert path that skips the size check, or any new in-memory cache elsewhere in `api/` without size/TTL bounds.
- Proxy routes must have a caller (dead `hourly-forecast-twc`/`air-quality` removed 2026-11-17). Grep `type=<route>` in `src/` for each `case`, and keep `ROUTE_TYPES` in `api/weather.js` in step with the switch.
- One rate limiter: currently two different implementations (item 15) — once `api/lib/rateLimit.js` exists, flag any handler rolling its own.

**Extraction candidates:**

- Grep component files for large (100+ line) self-contained inner components or pure-function blocks defined inline (like `StationForm` once was) — if one has no closure dependencies on the parent, it is an extraction candidate. Tracked 2026-11-17: TrendsTab's `dayPhase`/`lyObsAtCurrentHour`/`yoyInsight` block (125 lines, item 6).
- API-layer invariants above (single fetch path, `applyCors()` only, bounded insight cache) re-verified 2026-11-17 — all holding.

**Tests and tooling:**

- Pure helpers in `src/utils/` and `api/lib/` are expected to have a sibling `*.test.js` (Vitest). Flag a non-trivial pure module (date math, scoring, parsing, prompt building) that has none — tracked 2026-11-17 as item 17: `weatherIcons.js`, `parseChangelog.js` and `apiFetch.js` (`geocode.js`, `storageKeys.js`, `insightCache.js`, `api/weather.js` and `api/insight.js` tested since). All of `api/lib` is tested. Record only where real logic is untested, not plain data tables (`activities.js`, `utils/compass.js`).
- Dependency drift: a library pinned to a major that no longer matches its peers (e.g. Recharts 2 + `react-is@18` under React 19 — see `/bugtracker`'s library-compat targets). Record as debt if the mismatch needs a workaround convention in the code.

**AI insight layer (added after 2026-07-17):**

- `api/lib/insightPersona.js` (server persona/prompt rules) and `src/utils/insightVocab.js` / `src/utils/outlook.js` (client-side vocabulary and outlook building) — flag prompt fragments, thresholds, or wording lists defined in both places, which will drift.

Note: YardObs has no server-side auth layer — no `api/settings.js`, `getUserFromRequest`, `useAuth`, or `useUserSettings`. The TWC key is device-local (`localStorage` via `StationForm`, sent as an `x-twc-key` header). Do not search for auth boilerplate unless such a layer is added.

## Entry format

Match the existing format in `TechDebt.md` — bold numbered title, description paragraph, affected file list with line numbers where relevant.
