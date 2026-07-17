# Tech Debt — Large Changes Sub-Report

Companion to `TechDebt.md` items 3 and 4 (2026-07-17 scan). These two refactors are too large for an opportunistic `/debtpayer` pass — each touches multiple files or moves 150+ lines — so they are broken out here with a concrete plan and risk notes, pending a decision on how to handle them.

## A. Extract a shared `useInsight` hook (TechDebt item 3)

**Scope:** 3 components, ~200 lines net-touched, plus a new hook file.

The duplicated flow in `HeroCard.jsx:274-338`, `ForecastTab.jsx:326-396`, and `ActivityScoreCard.jsx:167-256` is: read localStorage → TTL-gate → cancel-guard → POST `/api/insight` → persist `{data, ts}` → set state → report failure.

**Proposed shape:**

```js
// src/hooks/useInsight.js
useInsight({ lsKey, enabled, buildBody, onError, debounceMs })
// → { insight, loading }
```

- localStorage read + `INSIGHT_TTL_MS` gate and the `{data, ts}` write become the hook's job (keys still built by callers via `STORAGE_KEYS` builders).
- One cancellation idiom (AbortController) replaces the three divergent ones (`cancelled` flag / cancel-token ref / AbortController).
- `onError` reporting funnels through the hook — 3 of the 6 `componentError` report sites (TechDebt item 2) collapse into one, making the eventual "clear on success" fix a one-place change.

**Per-caller wrinkles to preserve:**

- HeroCard fetches year-over-year history (`fetchHistoryDaily`) before the POST — stays in a `buildBody` async callback or a pre-step.
- ActivityScoreCard has a 400 ms debounce, an in-session `iCache` ref keyed on score/temp buckets, and the `isNotableWeatherChange` bypass — the hook needs a `shouldBypassCache` escape hatch, or ActivityScoreCard keeps its ref cache in front of the hook.
- ForecastTab stores a reduced `{ narrative, updatedAt }` shape, not the raw response — `buildBody`/`mapResponse` callbacks cover this.

**Risk:** medium. Behavior-preserving but touches all three insight surfaces at once; each has subtle timing (debounce, notable-change bypass) that needs the existing `forecastHourlyLayout.test.js`-style unit coverage before the move. Best done on its own branch.

## B. Split ForecastTab.jsx / extract `<SunMoonCard>` (TechDebt item 4)

**Scope:** 1 file (~660 lines) → 2–3 files; ~154 lines move.

`ForecastTab.jsx:499-653` is an inline IIFE with only `lat`/`lon` as closure deps — the same profile `StationForm` had before its extraction. The sun card (514-549) and moon card (598-623) repeat the arc scaffold: `cx=100, cy=84, r=74`, identical track path, baseline line, progress clamp, dot trig.

**Proposed steps:**

1. Extract `src/components/SunMoonCard.jsx` taking `{ lat, lon }` — moves the IIFE, `resolveMoonWindow`, `moonPhaseName`, `MoonPhaseIcon`, `fmtSunTime`/`fmtMoonTime`/`fmtDaylight` helpers with it.
2. Inside the new file, fold the two cards' shared arc scaffold into one small `<ArcProgress>` (track + progress path + dot slot) — removes the ~30-line duplication.
3. Optional follow-up: move `buildTrajectory`/`buildPrecipWindow` (pure prompt builders) to `src/utils/`, where they become testable — leaving ForecastTab with layout + data wiring only.

**Risk:** low-to-medium. Step 1 is mechanical (no closure deps besides `lat`/`lon`). Caution: this file has uncommitted hourly-overlap layout work on the current branch (`steve/hourlyoverlap`) — do this extraction only after that lands, to avoid churning the same file in two directions.

## Handling options

- **Track only** — leave both in `TechDebt.md`, act later via `/debtpayer`.
- **Do now, own branch** — either item is a candidate for a dedicated branch off `main` after `steve/hourlyoverlap` merges.
- **Drop** — remove from tracking if judged not worth the churn.
