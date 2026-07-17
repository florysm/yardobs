# YardObs — Bug Tracker

Scan the codebase for bugs and update `KnownBugs.md`.

## Usage

`/bugtracker` — scan the full codebase

## Steps

1. Read `KnownBugs.md` to see what is already tracked.
2. Spawn parallel Explore subagents covering the two areas below — hook/data layer and components/API.
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

Scope note: this app has no auth or server-side settings layer. There is no Supabase, no `useAuth`/`useUserSettings` hook, no `AuthGate`, no `api/settings.js`, and no `api/lib/supabase.js`. The TWC API key lives in client `localStorage` and is sent via the `x-twc-key` header (`src/utils/apiFetch.js`). The only serverless files are `api/weather.js`, `api/insight.js`, and `api/lib/{cors,sanitize,validate}.js`. Do not scan for auth-layer patterns.

## Search targets — data and API layer

**`src/hooks/useWeather.js`:**

- `useEffect` callbacks that reference state variables or props without listing them in the dependency array — stale closures in the 5-min polling loop can silently serve outdated readings. (Verified sound as of 2026-07-17: the polling effect's deps `[fetchCurrent, fetchAlerts]` are complete and both callbacks are memoized with correct deps — check regressions only.)
- Race conditions on station/location switch: an in-flight request for the old location that is not aborted (or generation-guarded) when the data source changes can resolve late and overwrite newer state — including `locationRef.current`, which the forecast/AQ/alert fetches key off. (Currently tracked in `KnownBugs.md` — the single mount-scoped AbortController is never re-aborted between fetches.)
- Truthiness guards on coordinates or IDs: `if (!lat || !lon)` rejects a valid coordinate of exactly `0` (equator/prime meridian) — guards must use `== null`. Also flag guards that skip a fetch silently with no `setError`, leaving a blank panel with no explanation. (The falsy-zero instances at lines 88 and 135 are currently tracked in `KnownBugs.md`.)
- Note: React 18 makes `setState` after unmount a silent no-op — do not record it as a bug by itself. The recordable defect is a stale response overwriting newer state while mounted.

**`api/insight.js` / `api/weather.js`:**

- `catch` blocks that swallow exceptions silently — no `console.error` and no error payload returned to the client. (Verified clean as of 2026-07-17: `handleInsightError` logs and returns 502; `weather.js` returns structured 502s — check regressions only.)
- In-memory TTL logic (insight cache, per-IP rate limiter) that computes elapsed time as `Date.now() - ts` (or compares `now` against a stored future deadline like `resetAt`) — a backward clock jump makes elapsed negative / leaves the deadline in the future, which never expires the entry. (All four known instances are now tracked in `KnownBugs.md`: insight `getCacheHit` + interval sweep, insight `isRateLimited`/`ipLog`, and weather `checkRateLimit`. Flag only new absolute-time comparisons.)
- Handlers that cache or persist a failure result as success: the daily insight handler caches its empty default (`{ narrative: '', tags: [] }`) with a 200 when JSON parsing fails, poisoning the cache for the full TTL (tracked in `KnownBugs.md`, 2026-07-17). The activity and forecast-day handlers cache non-empty partial text on truncation — the correct pattern. Check any new handler: on a parse/truncation failure it must either skip the cache write or cache something non-empty.
- Query-param validation: a missing or malformed `stationId`, `type`, `date`, `lat`, or `lon` must return a 400, not a 500 or silent empty response. (`weather.js` validates via `validCoords`/`validStationId`/`validDate` around lines 52–54 plus per-route required-param checks — verify any newly added route or param goes through the same validators.)
- Insight cache boundedness: `CACHE_MAX_SIZE` + `evictOne()` + the interval sweep keep the map capped — verify a new cache write path still evicts, and that the `ipLog` rate-limiter map is also swept. (Verified sound 2026-07-17: all three insert paths evict at lines ~196/316/386, both maps swept in the interval, per-handler key prefixes `act|`/`daily|`/`fcday|` prevent collisions — check regressions only.)
- Note: query params arrive as strings, so `!lat || !lon` on `req.query` values does NOT reject the string `"0"` — the falsy-zero coordinate bug is client-side only. Do not flag server-side query-param truthiness checks for that reason.

## Search targets — components and app shell

**`src/components/*.jsx`:**

- `new Date(dateString)` where `dateString` is a bare `YYYY-MM-DD` — parsed as midnight UTC, renders as the previous day west of UTC. Codebase convention is to pin to local noon (`+ 'T12:00'` / `'T12:00:00'`, see `ForecastTab.jsx` and `TrendsTab.jsx`), and `toDateStr` in `src/utils/dateUtils.js` uses local getters. Flag any new parse that skips the suffix.
- `useEffect` deps arrays that include object or array literals created inline — new reference every render, effect runs every render cycle.
- Async effects fetching data without a cancellation guard against stale responses. Codebase convention is a `cancelled` flag or `AbortController` checked before every state write (see `HeroCard.jsx`, `ForecastTab.jsx`, `RadarTab.jsx`, `ActivityScoreCard.jsx`, `LocationSearchInput.jsx`) — flag any new async effect without one. The concern is stale data overwriting fresh data, not unmount warnings (see React 18 note above). (All component targets in this section verified clean 2026-07-17: date parses pin to local noon, single `body.className` setter at `App.jsx:148`, all `localStorage` reads wrapped, all fetching effects guarded, no inline-literal deps, Recharts uses resolved `chartColors` hex, theme blocks unlayered — check regressions only.)
- Hourly-scroll pixel-width layout in `ForecastTab.jsx` (`groupWidthPx`, track width sum): verified correct 2026-07-17 — the 56px flex basis matches border-box sizing because Tailwind preflight is enabled (`tailwind.config.js` does not disable `corePlugins`). If preflight is ever disabled, the 1px `.fc-card` border falls outside the 56px and every group silently under-sizes, reintroducing the hourly overlap — re-check this coupling whenever `tailwind.config.js` or `.fc-card` borders change.

**`src/App.jsx`:**

- `document.body.className` must have a single canonical setter — currently one effect keyed on `activeTheme` (~line 147). Flag any second code path that writes it.
- `localStorage.getItem(...)` without a `try/catch` and `null` handling — corrupted or missing data throws or silently returns `null`. All current reads (`initProfile`, the `useState` initializers) are wrapped — flag new unwrapped reads.

**`src/themes.js` / `src/index.css`:**

- Theme `body.theme-*` CSS variable blocks placed inside an `@layer base` or any `@layer` rule — Tailwind's unlayered utilities win the cascade and silently override them; blocks must remain unlayered (a comment above the blocks in `index.css` says so).
- Recharts components must take resolved hex values from `CHART_COLORS` in `src/themes.js` (passed down as `chartColors`), not `var(--...)` strings — the resolved values are what make charts re-render with new colors on theme change. Do NOT flag `var(--...)` in fill/stroke on plain decorative inline SVG (sun arc, activity ring, etc.) — `var()` resolves fine in inline-SVG presentation attributes; that pattern is intentional and working.

## Entry format

New entries must follow this format:

```text
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
```
