# YardObs — Bug Tracker

Scan the codebase for bugs and update `KnownBugs.md`.

## Usage

`/bugtracker` — scan the full codebase

## Steps

1. Read `KnownBugs.md` to see what is already tracked.
2. Spawn parallel Explore subagents covering the areas below — (a) hook/data layer + `api/`, (b) components/app shell, (c) `src/utils/` + any file added since the last scan (`git log --since=<Last updated date> --diff-filter=A --name-only -- src api`). Also skim `git log --since=<Last updated date>` for dependency upgrades (React, Recharts, Vite, react-leaflet) and check the library-compat targets below whenever one landed.
3. For every candidate finding, read the relevant file to verify the bug exists before recording it.
4. Update `KnownBugs.md`:
   - Add newly confirmed bugs not already tracked.
   - Remove bugs that are no longer present in the code.
   - Set `Last updated:` to today's date.
5. Update this skill file (`.claude/commands/bugtracker.md`) based on what the scan learned:
   - Remove or fix search targets that reference files, functions, or code paths that no longer exist.
   - If a target produced a false positive, correct or annotate it so the next run doesn't repeat the mistake.
   - Mark targets verified clean with the date, and note the guard/convention that satisfies them, so future scans check for regressions instead of rediscovering them.
   - Add newly confirmed bug patterns as targets when the same class of defect could recur elsewhere.
   - Keep the scope note accurate (files that exist, where credentials live, serverless surface).
6. Report a brief summary: N new bugs found, N resolved and removed, and any changes made to this skill.

## What counts as a bug

A concrete, verifiable defect — wrong behavior, a fetch that leaves state dangling, a date that renders wrong, a cache that returns corrupt data, or a silent failure. Not a style issue or a missing feature. Only record findings you have confirmed by reading the source file.

Scope note: this app has no auth or server-side settings layer. There is no Supabase, no `useAuth`/`useUserSettings` hook, no `AuthGate`, no `api/settings.js`, and no `api/lib/supabase.js`. The TWC API key lives in client `localStorage` and is sent via the `x-twc-key` header (`src/utils/apiFetch.js`). The only serverless files are `api/weather.js`, `api/insight.js`, and `api/lib/{cors,sanitize,validate,insightPersona}.js`. Do not scan for auth-layer patterns.

Stack: React 19, Recharts 2.15, react-leaflet 5, Vite 6, Vitest (`npm test`; tests live beside sources as `*.test.js`). A bug that a pure function in `src/utils/` or `api/lib/` already has a passing test for is usually a false positive — read the test before recording.

## Search targets — data and API layer

**`src/hooks/useWeather.js`:**

- `useEffect` callbacks that reference state variables or props without listing them in the dependency array — stale closures in the 5-min polling loop can silently serve outdated readings. (Verified sound as of 2026-07-17: the polling effect's deps `[fetchCurrent, fetchAlerts]` are complete and both callbacks are memoized with correct deps — check regressions only.)
- Race conditions on station/location switch: an in-flight request for the old location that is not aborted (or generation-guarded) when the data source changes can resolve late and overwrite newer state — including `locationRef.current`, which the forecast/AQ/alert fetches key off. (Fixed in `13ff7fe`: a fresh `AbortController` per `dataSourceKey`, aborted on change, and every fetcher passes `abortRef.current?.signal` — check that new fetchers pass the signal too.)
- Fetchers whose cache only records successes (`historyDailyRef`, `history`) — a failed or aborted fetch is never retried by effects whose deps don't change, so the panel can stay empty for the session. Flag only if you can name the trigger that leaves it stuck.
- Caches keyed by date only (`history`, `historyDaily`, insight localStorage keys) must also be keyed or cleared by data source, and "today" must never be cached as final. Fixed 2026-11-17: history state is tagged with its owning station (`owner`) and only exposed when it matches; `historyCacheUsable()` in `dateUtils.js` refetches not-yet-final days after 15 min. Insight localStorage keys go through `insightScope(current)` (`src/utils/insightCache.js`, 2026-11-17): station ID for station data, rounded coordinates for forecast-model data — App's `stationId` stays the HOME station while exploring, so never key place-specific data on it. Check any new cache for both gaps.
- Data-source switch: the reset effect must clear everything derived from the old source (`locationRef`, `current`, history caches), not just forecast/hourly/AQ/alerts — otherwise App's refetch effect reloads the old location under the new controller (fixed 2026-11-17 by clearing `locationRef`). Each fetcher must take `abortRef.current?.signal` ONCE at the start and check `signal.aborted` before writing state — re-reading the ref after an await picks up the next source's controller. Inner `catch {}` blocks must re-throw `AbortError`.
- Fetches that skip `res.ok` (raw `fetch(...).then(r => r.json())`) store error bodies as data — `fetchAirQuality` fixed 2026-11-17; flag any new one.
- Upstream 204/empty bodies: `api/weather.js` maps them to `{ observations: [] }` (history) or 404 (current) before `JSON.parse` — covered by `api/weather.test.js`.
- Truthiness guards on coordinates or IDs: `if (!lat || !lon)` rejects a valid coordinate of exactly `0` (equator/prime meridian) — guards must use `== null`. Also flag guards that skip a fetch silently with no `setError`, leaving a blank panel with no explanation. (Fixed 2026-11-17 — both `useWeather.js` guards now use `== null`; check regressions only.)
- Note: React 18+ makes `setState` after unmount a silent no-op — do not record it as a bug by itself. The recordable defect is a stale response overwriting newer state while mounted.

**`api/insight.js` / `api/weather.js`:**

- `catch` blocks that swallow exceptions silently — no `console.error` and no error payload returned to the client. (Verified clean 2026-11-17: `handleInsightError` logs and returns 503 on overload / 502 otherwise; `weather.js` returns structured 502s — check regressions only.)
- In-memory TTL logic (insight cache, per-IP rate limiter) that computes elapsed time as `Date.now() - ts` (or compares `now` against a stored future deadline like `resetAt`) — a backward clock jump makes elapsed negative / leaves the deadline in the future, which never expires the entry. (Insight cache fixed 2026-11-17 via `isFresh()` — `age >= 0 && age < TTL` — in `getCacheHit`, the sweep and `evictOne`; client-side `readInsightCache` does the same. The rate limiters — insight `isRateLimited`/`ipLog` and weather `checkRateLimit` — are tracked in `KnownBugs.md`. Flag only new absolute-time comparisons.)
- Handlers that cache or persist a failure result as success. Fixed end-to-end 2026-11-17: every handler goes through `runCachedInsight`, whose `parse()` returns null for nothing-to-show (→ 502, not cached), overload is a 503, and on the client `useInsight` saves only what `accept()` returns non-null (entries carry a version, so pre-fix entries read as misses). Invariant: a failure is never a 200, and nothing reaches `writeInsightCache` without passing `accept`. Covered by `api/insight.test.js` and `src/utils/insightCache.test.js`.
- Query-param validation: a missing or malformed `stationId`, `type`, `date`, `lat`, or `lon` must return a 400, not a 500 or silent empty response. (`weather.js` validates via `validCoords`/`validStationId`/`validDate` around lines 52–54 plus per-route required-param checks — verify any newly added route or param goes through the same validators.)
- Insight cache boundedness: `CACHE_MAX_SIZE` + `evictOne()` + the interval sweep keep the map capped — verify a new cache write path still evicts, and that the `ipLog` rate-limiter map is also swept. (Verified sound 2026-11-17: the single insert path is `cacheSet()`, which evicts; both maps swept in the interval; per-handler key prefixes `act|`/`daily|`/`fcday|` prevent collisions — check regressions only.)
- Note: query params arrive as strings, so `!lat || !lon` on `req.query` values does NOT reject the string `"0"` — the falsy-zero coordinate bug is client-side only. Do not flag server-side query-param truthiness checks for that reason.

## Search targets — components and app shell

**`src/components/*.jsx`:**

- `new Date(dateString)` where `dateString` is a bare `YYYY-MM-DD` — parsed as midnight UTC, renders as the previous day west of UTC. Codebase convention is to pin to local noon (`+ 'T12:00'` / `'T12:00:00'`, see `ForecastTab.jsx` and `TrendsTab.jsx`), and `toDateStr` in `src/utils/dateUtils.js` uses local getters. Flag any new parse that skips the suffix.
- `useEffect` deps arrays that include object or array literals created inline — new reference every render, effect runs every render cycle.
- Async effects fetching data without a cancellation guard against stale responses. Codebase convention is a `cancelled` flag or `AbortController` checked before every state write (see `HeroCard.jsx`, `ForecastTab.jsx`, `RadarTab.jsx`, `ActivityScoreCard.jsx`, `LocationSearchInput.jsx`) — flag any new async effect without one. The concern is stale data overwriting fresh data, not unmount warnings (see React 18 note above). (Re-verified clean 2026-11-17 except the new loading/color items below. Earlier verification 2026-07-17: date parses pin to local noon, single `body.className` setter (now `App.jsx:154`), all `localStorage` reads wrapped, all fetching effects guarded, no inline-literal deps, Recharts uses resolved `chartColors` hex, theme blocks unlayered — check regressions only.)
- String-concatenating alpha onto a color (`color + '66'`, `` `${c}22` ``) is only valid when `color` is a 6-digit hex. `scoreColor()` returns `var(--…)`, so `ActivityScoreCard`'s non-peak bars were invalid CSS (fixed 2026-11-17 with `opacity`). `chartColors.*` are hex, so `${chartColors.accent}22` is fine — check the source of every concatenated color.
- Loading flags: every early-return path in an effect that set `loading` (cache hit, guard) must also clear it. Effects that do `Promise.all(...).finally(() => setLoading(false))` need a cancelled flag so a stale run can't clear a newer run's loading. Fixed 2026-11-17: insight loading lives in `useInsight` (clears on cache hit and on disable), Trends loading in `useTrendsData` (cancelled flag, no history-object deps) — flag new loading flags outside these hooks that skip either rule. Also flag effect deps on a whole cache object (`history`, `historyDaily`): every write re-runs the effect.
- Leaflet: `MapContainer` reads `center` only on mount, and a tile-layer effect that rebuilds layers must re-apply visibility itself — don't rely on a separate `[frameIndex]` effect that may not re-run (RadarTab refresh blanking — fixed 2026-11-17: the build effect calls `showFrame` itself).
- Hourly series fetched with `timezone=auto` are location-local; matching them against the device clock (`now.getHours()`, `toISODate()`, `new Date(t)`) is wrong in Explore mode across zones (tracked 2026-11-17). Flag new code that does it.
- Hourly-scroll pixel-width layout in `ForecastTab.jsx` (`groupWidthPx`, track width sum): verified correct 2026-07-17 — the 56px flex basis matches border-box sizing because Tailwind preflight is enabled (`tailwind.config.js` does not disable `corePlugins`). If preflight is ever disabled, the 1px `.fc-card` border falls outside the 56px and every group silently under-sizes, reintroducing the hourly overlap — re-check this coupling whenever `tailwind.config.js` or `.fc-card` borders change.

**`src/App.jsx`:**

- `document.body.className` must have a single canonical setter — currently one effect keyed on `activeTheme` (~line 147). Flag any second code path that writes it.
- `localStorage.getItem(...)` without a `try/catch` and `null` handling — corrupted or missing data throws or silently returns `null`. All current reads (`initProfile`, the `useState` initializers) are wrapped — flag new unwrapped reads.

**`src/themes.js` / `src/index.css`:**

- Theme `body.theme-*` CSS variable blocks placed inside an `@layer base` or any `@layer` rule — Tailwind's unlayered utilities win the cascade and silently override them; blocks must remain unlayered (a comment above the blocks in `index.css` says so).
- Recharts components must take resolved hex values from `CHART_COLORS` in `src/themes.js` (passed down as `chartColors`), not `var(--...)` strings — the resolved values are what make charts re-render with new colors on theme change. Do NOT flag `var(--...)` in fill/stroke on plain decorative inline SVG (sun arc, activity ring, etc.) — `var()` resolves fine in inline-SVG presentation attributes; that pattern is intentional and working.

## Search targets — library compatibility (React 19)

- **Recharts children inside fragments.** Recharts 2 finds `<Line>`/`<Bar>`/`<Area>`/`<XAxis>`… with `react-is@18`, whose `isFragment()` returns false for React 19 elements — anything wrapped in `<>…</>` (or `<Fragment>`) inside a chart is silently not drawn, no error. Found 2026-11-17 in `TrendsTab.jsx` (7d/30d temperature High/Low lines and their YoY pair); fixed by switching to keyed arrays. Grep every file importing `recharts` for `<>` / `Fragment` inside a chart. Quick check of the root cause: `node -e "const R=require('react'),is=require('react-is');console.log(is.isFragment(R.createElement(R.Fragment)))"` prints `false` while the mismatch exists.
- Other libraries that inspect React elements (`react-is`, `React.Children`, `element.type` checks, `defaultProps` on function components — removed in React 19) — flag any dependency or local code relying on them.

(Library-compat targets verified clean 2026-11-17: Recharts imported only in `TrendsTab.jsx`, no fragments inside charts; no `defaultProps`/string refs/legacy context/`findDOMNode` anywhere — check regressions only.)

## Search targets — newer utilities (added after 2026-07-17)

- `src/utils/keyExpiry.js` + `KeyExpiryBanner.jsx`: verified clean 2026-11-17 (local-midnight `new Date(y, m-1, d)` + `Math.round` absorb DST; corrupt dates return null) — check regressions only.
- `src/utils/radarFrames.js`: verified clean 2026-11-17 (always 12 observed frames + forecast frames; `now` passed in) — regressions only.
- `src/utils/widgetScript.js`: verified clean 2026-11-17 (`JSON.stringify` inserted via a replacement function handles quotes, backslashes, `$&`, `*/`) — regressions only.
- `src/utils/outlook.js`: device-clock hour key is tracked (time-zone entry). Still open, not recorded: a day part whose temps/probs are all null emits a dangling `"evening (6p–9p) "` into the prompt; DST-day labeling with Open-Meteo `timezone=auto` is unconfirmed (needs a live fetch across a DST date).
- Pure-function edge cases found 2026-11-17: `units.js` "-0°C" and `geocode.js` "°N" fallback are fixed (`fixed()` in `format.js`, `coordLabel()`, both tested) — every new number formatter should go through `fixed()`; `weatherIcons.js` WMO 80/81 → heavy rain was fixed 2026-11-17 (one `WMO_TO_TWC` table, every code tested). Known but not recorded (only reachable with bad input): `aqiCategory('')` → 'Good', `aqiCategory(NaN)` → 'Hazardous', `degreesToCompass(-20)` → undefined, `shortHour(NaN)` → "NaNa", `dayPartRange(19, null)` → "evening into null" (no callers). Promote one if a real caller can feed it bad input.
- `api/lib/insightPersona.js` / `api/insight.js` prompt builders: `Activity: ${activityLabel}` and `${f.name} (${scoreBand(f.score)})` can print "undefined"/"null" on malformed bodies — crafted input only, not recorded.

## Entry format

New entries must follow this format:

```text
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
```
