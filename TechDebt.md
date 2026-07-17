# Tech Debt

Last updated: 2026-07-17

<!-- Run /codecleaner to populate this file. Run /debtpayer to address one item. -->

## High Priority

**1. Four open Dependabot security alerts, all in the vite build toolchain**

vite 5.4.21 (and the esbuild 0.21.5 it bundles) carries 4 open alerts (1 high, 3 moderate): `server.fs.deny` bypass on Windows (high, GHSA alert #7), NTLMv2 hash disclosure via UNC paths on Windows (#8), path traversal in optimized-deps `.map` handling (#2), and esbuild dev-server CORS exposure (#1). All are **dev-only** — vite is a devDependency, nothing vulnerable ships in the built site — and the two worst are Windows-only, so real-world risk on macOS is low. All four are patched at **vite 6.4.3**. Dependabot's PR #17 instead jumps to vite 8.0.16, a triple-major upgrade that moves to the Rolldown bundler and likely needs a `@vitejs/plugin-react` bump — do not merge it blind. Fix: a dedicated branch bumping `vite` to `^6.4.3` (or a deliberate 7.x), verify `npm test`, `npm run build`, and the dev server, then close PR #17. The other Dependabot PRs (#5, #6, #7, #8, #9 — React 19, Tailwind 4, react-leaflet 5, Anthropic SDK) are routine version bumps unrelated to the alerts; each is a separate migration decision.

Affected locations:

- `package.json` — `"vite": "^5.4.10"` (resolves to 5.4.21)
- Dependabot: <https://github.com/florysm/yardobs/security/dependabot> and PR #17

## Medium Priority

**2. `componentError` banner state is set but never cleared**

Child components report transient failures through an `onError` callback that funnels into a single `componentError` state in `App.jsx`, but no code path ever resets it to `null` — there is no dismissal control, no timeout, and no clear-on-retry. One transient failure (e.g., a radar tile fetch hiccup) leaves the red bottom banner on screen for the rest of the session, even after the underlying feature recovers. The companion `error` from `useWeather` clears on successful refetch; `componentError` does not. Fix belongs alongside a small centralized error/notification design decision: dismissable banner, auto-expiry, or clear-on-success from each reporting component.

Affected locations (5 files, 6 report sites, 0 clear sites):

- `src/App.jsx:108` — state declaration; `src/App.jsx:223,237,278` — `onError={setComponentError}` passed to HeroCard, NowTab (→ ActivityScoreCard), RadarTab; `src/App.jsx:308-316` — banner render
- `src/components/RadarTab.jsx:119` — `onError?.('Radar data unavailable')`
- `src/components/HeroCard.jsx:304,329` — historical data / daily insight failures
- `src/components/ActivityScoreCard.jsx:251` — activity insight failure

**3. AI-insight fetch + cache flow hand-rolled in 3 components**

The same flow — read localStorage, TTL-gate with `Date.now() - ts < INSIGHT_TTL_MS`, set a cancel guard, POST `/api/insight`, write `{data, ts}` back to localStorage, set state, report failure — is reimplemented independently in three components. The localStorage read + TTL check is nearly byte-identical between HeroCard and ForecastTab; each copy also uses a *different* cancellation idiom (`cancelled` flag vs. cancel-token ref vs. AbortController). The only shared pieces are the `STORAGE_KEYS` key builders. A fourth insight surface would copy the block a fourth time. Extraction target: a `useInsight` hook (or `readCachedInsight`/`fetchInsight` helpers) — which would also centralize the `onError` reporting sites from item 2. Large change — see `TechDebt-LargeChanges.md` for the breakdown.

Affected locations (3 files):

- `src/components/HeroCard.jsx:274-338` — daily insight
- `src/components/ForecastTab.jsx:326-396` — forecast-day insight
- `src/components/ActivityScoreCard.jsx:167-256` — activity insight

**4. ForecastTab.jsx (~660 lines) mixes several jobs; sun and moon cards duplicate the arc scaffold**

The file combines hourly grouping + iOS-Safari pixel-width layout, the `buildTrajectory`/`buildPrecipWindow` prompt builders, moon-phase math + `MoonPhaseIcon`, the sun/moon SVG cards, and the day-insight fetch effect. Within it, the sun card and moon card repeat the same arc scaffold (`cx=100, cy=84, r=74`, identical track path, baseline, progress clamp `Math.max(0, Math.min(0.9999, raw))`, and dot trig) — ~30 near-identical lines each. The whole sun/moon section (`ForecastTab.jsx:499-653`, ~154 lines) is an inline IIFE whose only closure deps are `lat`/`lon` — a self-contained `<SunMoonCard>` extraction candidate in the same vein as the past `StationForm` extraction. Large change — see `TechDebt-LargeChanges.md` for the breakdown.

Affected locations:

- `src/components/ForecastTab.jsx:499-653` — sun/moon IIFE (arc scaffold duplicated at 514-549 and 598-623)
- `src/components/ForecastTab.jsx` overall — ~660 lines, multiple concerns

## Lower Priority

**5. "API source" footer style object duplicated verbatim in 3 tabs**

The byte-identical inline style object `{textAlign:'center', fontSize:10, color:'var(--tm)', fontFamily:'var(--font-mono)', padding:'6px 0 4px', letterSpacing:'0.3px'}` wraps the data-source attribution line in each tab. Belongs in a `.y-source` utility class (or a tiny `<SourceFooter>`).

- `src/components/NowTab.jsx:68`
- `src/components/ForecastTab.jsx:655`
- `src/components/TrendsTab.jsx:784`

**6. `updatedAt` timestamp formatting duplicated verbatim — 2 files, plus a drifting option bag**

`new Date().toLocaleTimeString(navigator.language, { hour: 'numeric', minute: '2-digit', hour12: getLocaleHour12() })` is byte-identical at `src/components/HeroCard.jsx:322` and `src/components/ForecastTab.jsx:381`; `src/components/AlertsSheet.jsx:9-11` uses the same option bag inside a `toLocaleString` call. Belongs in `src/utils/format.js` as a `fmtUpdatedAt()` next to the other locale-aware formatters.

**7. Partly-cloudy icon-code set defined twice, feeding the same "actually sunny" override**

`const ICON_PARTLY = [23, 24, 29, 30]` in `src/App.jsx:30` and `const PARTLY_CODES = new Set([23, 24, 29, 30])` in `src/components/HeroCard.jsx:350` are the same TWC icon-code set, and both feed the UV/solar sunny-override logic (App `resolveAutoTheme` vs. HeroCard `derived`). If one is edited without the other, theme and hero-label classification silently drift apart. Single export (e.g. from a shared constants module alongside the other ICON_* arrays) removes the risk. The other icon arrays (STORMY/RAINY/CLOUDY) remain single-sourced in App.jsx.

**8. hPa↔inHg constant `0.02953` as a raw literal in 2 files**

`src/hooks/useWeather.js:163` multiplies by it; `src/utils/units.js:73` divides by it. The comment at `units.js:68-70` explicitly acknowledges the pairing, but changing one literal without the other silently breaks the round-trip. A single exported `HPA_PER_INHG` constant removes the risk. Low severity since it's documented.
