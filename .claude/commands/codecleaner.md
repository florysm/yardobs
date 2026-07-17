# YardObs — Code Cleaner

Scan the codebase for tech debt and refactoring opportunities, then update `TechDebt.md`.

## Usage

`/codecleaner` — scan the full codebase

## Steps

1. Read `TechDebt.md` in full to see what is already tracked.
2. Spawn parallel Explore subagents (one for utilities/state, one for components/infrastructure) — give each the search targets from the relevant section below.
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

These are invariants the codebase currently satisfies (all re-verified 2026-07-17). Verify each still holds; any drift is new debt.

**Single-definition utilities:**

- `fmt` and `degreesToCompass` are defined only in `src/utils/format.js`; `toDateStr` only in `src/utils/dateUtils.js`; `calcFeelsLike` only in `src/utils/weatherCalc.js` (pure, tested). Grep for any second definition of these names — any copy counts as debt. Also flag new pure formulas that appear inline in hooks/components instead of `src/utils/`.

**localStorage keys:**

- All keys live in `src/utils/storageKeys.js` (`STORAGE_KEYS` object plus the `insightKey`/`activityInsightKey`/`forecastDayInsightKey` builders). Grep `localStorage.getItem` / `setItem` / `removeItem` across all files — any call site passing a raw string literal instead of a `STORAGE_KEYS.*` constant or key builder is debt.

**Theme name literals:**

- Theme names derive from `THEME_IDS` / `WEATHER_THEME_IDS` / `DISPLAY_MODES` / `CONDITION_PREVIEWS` exported by `src/themes.js`. Grep for quoted `'sunny'`, `'cloudy'`, `'rainy'`, `'stormy'`, `'light'`, `'dark'` outside `themes.js` — any hit in JS/JSX is debt. Exception: the `body.theme-*` class selectors in `src/index.css` are irreducible (CSS cannot import the constant) and are not debt. (A comment mentioning theme names in `App.jsx:66` is a grep hit but not debt.)

**Duplicated formatting and constants (found 2026-07-17 — tracked in TechDebt.md, re-verify until fixed):**

- The `updatedAt` `toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12() })` line is duplicated verbatim in `HeroCard.jsx` and `ForecastTab.jsx`, with the same option bag in `AlertsSheet.jsx` — tracked as TechDebt item 5. Once a `fmtUpdatedAt()` lands in `src/utils/format.js`, convert this into a single-definition invariant.
- The hPa↔inHg constant `0.02953` appears as a raw literal in both `src/hooks/useWeather.js` and `src/utils/units.js` (tracked as item 7). More generally: grep for repeated numeric literals that form conversion pairs across files.

## Search targets — components and infrastructure

**Component duplication (invariants to verify):**

- Metric tiles go through the shared `MetricCard` component (`src/components/MetricCard.jsx`); flag any new hand-written label/value/unit card JSX in `NowTab.jsx`, `ForecastTab.jsx`, `TrendsTab.jsx` that duplicates it. (Verified holding 2026-07-17.)
- Shared visual patterns use the `.y-*` utility classes defined in `src/index.css` (`.y-card`, `.y-metric`, `.y-label`, `.y-pill`, `.y-stat`, `.y-pref-row`); flag components re-implementing these with inline styles or ad-hoc class strings. (Verified holding 2026-07-17 — but the "API source" footer style object is duplicated verbatim in 3 tabs, tracked as TechDebt item 4; once a `.y-source` class lands, fold it into this invariant.)
- The AI-insight fetch flow (localStorage TTL read → cancel guard → POST `/api/insight` → persist → set state) is hand-rolled in `HeroCard.jsx`, `ForecastTab.jsx`, and `ActivityScoreCard.jsx` — tracked as TechDebt item 2 (large change, see `TechDebt-LargeChanges.md`). Once a `useInsight` hook lands, the invariant becomes: every `/api/insight` call site goes through the hook; flag any component fetching `/api/insight` directly.

**Constant arrays:**

- Activity lists live in `src/utils/activities.js` (`ACTIVITIES`); icon-code classification arrays (`ICON_STORMY`/`ICON_RAINY`/`ICON_CLOUDY`/`ICON_PARTLY`) live in `src/App.jsx`. Grep for array literals in component files that duplicate these or appear in 2+ places — they belong in `src/utils/` or a `src/constants.js`. (Test-local fixture arrays don't count.) Found 2026-07-17: `PARTLY_CODES` in `HeroCard.jsx` duplicates `ICON_PARTLY` — tracked as TechDebt item 6; STORMY/RAINY/CLOUDY remain single-sourced.

**Error handling (known weak spot — tracked in TechDebt.md):**

- Error surfacing funnels into one bottom banner in `App.jsx`, fed by `useWeather`'s `error` plus the `componentError` state that children set via `onError` callbacks (`RadarTab`, `HeroCard`, `ActivityScoreCard`, `NowTab` pass-through). `componentError` is never cleared — no dismissal, timeout, or clear-on-success. Re-verify on each scan: check whether a clear path has been added, whether new components joined the `onError` channel (update the scope count), and whether `ErrorBoundary` (which wraps every tab and renders inline fallbacks) has been kept around any newly added tabs. (Re-verified 2026-07-17: scope unchanged at 5 files / 6 report sites / 0 clear sites; all four tabs wrapped. Known and accepted: `HeroCard` renders outside the per-tab boundaries and relies on the top-level boundary in `main.jsx` — pre-existing, don't re-report.)

**API layer (invariants to verify):**

- `api/weather.js` route branches only build URLs; all branches converge on one shared fetch/status-check/parse path. Flag any new branch that adds its own `fetch` + status-check boilerplate.
- CORS is set only via `applyCors()` in `api/lib/cors.js`; flag any handler setting `Access-Control-*` headers manually.
- The `api/insight.js` in-memory cache is bounded: `CACHE_MAX_SIZE` enforced via `evictOne()` before every insert, plus a TTL sweep interval. Flag any new insert path that skips the size check, or any new in-memory cache elsewhere in `api/` without size/TTL bounds.

**Extraction candidates:**

- Grep component files for large (100+ line) self-contained inner components defined inline (like `StationForm` once was before extraction to `src/components/StationForm.jsx`) — if one has no closure dependencies on the parent, it is an extraction candidate. Found 2026-07-17: the sun/moon card IIFE in `ForecastTab.jsx` (~154 lines, only `lat`/`lon` deps) — tracked as TechDebt item 3 with the file's overall size (see `TechDebt-LargeChanges.md`).
- API-layer invariants above (single fetch path, `applyCors()` only, bounded insight cache) re-verified 2026-07-17 — all holding.

Note: YardObs has no server-side auth layer — no `api/settings.js`, `getUserFromRequest`, `useAuth`, or `useUserSettings`. The TWC key is device-local (`localStorage` via `StationForm`, sent as an `x-twc-key` header). Do not search for auth boilerplate unless such a layer is added.

## Entry format

Match the existing format in `TechDebt.md` — bold numbered title, description paragraph, affected file list with line numbers where relevant.
