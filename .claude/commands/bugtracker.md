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
5. Report a brief summary: N new bugs found, N resolved and removed.

## What counts as a bug

A concrete, verifiable defect — wrong behavior, a fetch that leaves state dangling, a date that renders wrong, a cache that returns corrupt data, or a silent failure. Not a style issue or a missing feature. Only record findings you have confirmed by reading the source file.

## Search targets — data and API layer

**`src/hooks/useWeather.js`:**
- `useEffect` callbacks that reference state variables or props without listing them in the dependency array — stale closures in the 5-min polling loop can silently serve outdated readings
- `fetch` calls inside `useEffect` that start but have no `AbortController` cleanup — if the component unmounts mid-request, the `setState` call inside `.then()` will fire on a dead component and trigger a React warning (and potential state corruption if the component remounts quickly)
- `if (stationId)` / `if (lat && lon)` guards that silently skip a fetch with no user-visible feedback — user sees a blank panel with no indication of why

**`api/insight.js` / `api/weather.js`:**
- `catch` blocks that swallow exceptions silently — no `console.error` and no error payload returned to the client
- In-memory cache TTL logic that computes elapsed time using `Date.now()` — verify it guards against a device clock that jumps backward (negative elapsed time would never expire the cache)
- Missing or insufficient validation on query parameters read directly by the handler (`stationId`, `type`, `date`) — a missing or malformed param should return a 400, not a 500 or silent empty response
- `api/insight.js` cache object grows unbounded: entries are added but never evicted — long-running serverless instances accumulate stale keys

## Search targets — components and app shell

**`src/components/*.jsx`:**
- `new Date(dateString)` where `dateString` is a `YYYY-MM-DD` value — parsed as midnight UTC, displays as the previous day for users west of UTC; use `new Date(dateString + 'T00:00:00')` or date-fns `parseISO` instead
- `useEffect` deps arrays that include object or array literals created inline — they produce a new reference on every render, causing the effect to run in an infinite loop or on every render cycle
- State updates called after an `await` / `.then()` inside an effect that has no unmount guard — common in async data fetches without an `isMounted` ref or `AbortController`

**`src/App.jsx`:**
- `document.body.className` assigned from multiple code paths without a single canonical setter — rapid theme changes (e.g., auto-theme resolving at the same time a user toggles the settings drawer) can leave the body class in an intermediate state
- `localStorage.getItem(...)` on mount without a `try/catch` and without handling `null` — corrupted or missing localStorage data throws or returns `null` silently

**`src/themes.js` / `src/index.css`:**
- Theme `body.theme-*` CSS variable blocks placed inside an `@layer base` or any `@layer` rule — Tailwind's unlayered utilities win the cascade and silently override them; blocks must remain unlayered
- Recharts `stroke` / `fill` / `color` attributes set to `var(--some-css-variable)` — SVG presentation attributes cannot resolve CSS custom properties; must use resolved hex values from `CHART_COLORS` in `src/themes.js`

## Search targets — auth and settings layer

**`src/hooks/useAuth.js`:**
- `onAuthStateChange` registers a subscription — verify the `useEffect` cleanup calls `subscription.unsubscribe()`; if absent, listeners accumulate on every re-mount (event leak)
- When `supabase` is `null` (dev mode, no VITE_SUPABASE vars), verify `setUser(null)` is called before returning; if absent, `isLoading` stays `true` and the app hangs

**`src/hooks/useUserSettings.js`:**
- `loadSettings()` is `async` and called from a `useEffect` that re-runs when `session` changes — if session changes before the request resolves, the stale response overwrites newer state; look for an AbortController or generation-counter guard; absence is a bug
- `error` state is returned from the hook but check whether `App.jsx` actually destructures and displays it; if not, settings load/save errors are silently swallowed

**`src/components/AuthGate.jsx`:**
- `handleSubmit` is `async` — if the component unmounts while the OTP request is in flight, `setStatus` / `setErrorMsg` fire on a dead component; look for an `isMounted` ref or unmount guard; absence is a bug

**`src/utils/apiFetch.js`:**
- `supabase.auth.getSession()` is wrapped in a `try/catch {}` with an empty catch body — if `getSession()` rejects, the error is swallowed and `fetch()` proceeds without an Authorization header; server returns 401 which surfaces as `Error: HTTP 401`, hiding the real auth failure; the empty catch is the defect

**`api/weather.js` (auth mode credential resolution):**
- If `ENCRYPTION_KEY` rotates after keys were stored, `decrypt()` throws — verify the surrounding try/catch returns a meaningful 500 with a message rather than an unhandled propagation
- Dev mode branch: if `stationId` query param is missing when `TWC_API_KEY` is set, verify the route returns a clear 400 rather than a silent 500

**`api/settings.js`:**
- POST handler: when first-time save omits `twcApiKey`, verify the 400 error message is actually surfaced in the `StationForm` UI and not silently discarded
- Input validation for `stationId`: verify empty or whitespace-only strings are rejected (`.trim()` should be applied before the falsy check)

**`api/lib/supabase.js`:**
- `getUserFromRequest` extracts the token by slicing after `'Bearer '` — a header value of `'Bearer '` with no token produces an empty string; verify `client.auth.getUser('')` behavior; if it returns a non-null user or throws instead of returning null, this is a security bug

## Entry format

New entries must follow this format:

```
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
```
