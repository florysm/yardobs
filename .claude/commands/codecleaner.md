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

## What counts as tech debt

Concrete duplication, inconsistency, or missing abstraction — verifiable by reading the code. Minimum bar to record: the same problem appears in 2+ files, or a pattern is broken in a way that will cause real pain when extending the codebase. Do not record style preferences.

## Priority guidance

- **High**: will cause a bug or significant maintenance cost before the next feature is complete
- **Medium**: pain grows as the codebase grows — address within a few sprints
- **Lower Priority**: annoying but stable — address opportunistically

## Search targets — utilities and state

**Utility duplication:**
- `fmt`, `toDateStr`, `degreesToCompass` — grep for any definitions outside `src/utils/format.js`; any copy counts as debt
- `calcFeelsLike` is defined inline inside `src/hooks/useWeather.js` — it is a pure formula with no React dependencies and belongs in `src/utils/`

**localStorage key strings:**
- Grep for `localStorage.getItem` / `localStorage.setItem` / `localStorage.removeItem` across all files — count how many distinct key string literals exist and whether they are defined in one place; scattered string literals are a rename/typo hazard

**Theme name literals:**
- String literals `'sunny'`, `'cloudy'`, `'rainy'`, `'stormy'`, `'light'`, `'dark'` — grep for occurrences in `App.jsx`, `themes.js`, `index.css`, and components; they should derive from a single exported constant, not be copy-pasted

## Search targets — components and infrastructure

**Component duplication:**
- Inline metric/card JSX blocks (e.g., a `<div>` containing a label + value + unit) copy-pasted across `NowTab.jsx`, `ForecastTab.jsx`, `TrendsTab.jsx` — count how many copies exist
- `className` string values copy-pasted across components that already have a matching `.y-card`, `.y-metric`, `.y-label`, `.y-pill` utility class defined in `index.css`

**Constant arrays:**
- Activity type lists, icon code arrays, condition label arrays — grep for array literals in component files that appear in 2+ places; they belong in `src/utils/` or a `src/constants.js`

**Missing infrastructure:**
- `<ErrorBoundary>` in `App.jsx` — the two lazy-loaded tabs (`TrendsTab`, `RadarTab`) are wrapped in `<Suspense>` but not in an error boundary; a render error inside either tab will crash the entire app with a blank white screen
- No centralized error/notification system — individual components have no way to surface inline errors; everything funnels through the single bottom-banner state in `App.jsx`

**API layer:**
- Repeated `fetch(url)` + response status check boilerplate across `api/weather.js` route branches — count duplicated patterns; candidate for a shared internal helper
- `api/insight.js` in-memory cache: entries are added on every new request but never evicted — no max-size limit or LRU policy; long-running serverless instances will accumulate stale entries indefinitely

## Entry format

Match the existing format in `TechDebt.md` — bold numbered title, description paragraph, affected file list with line numbers where relevant.
