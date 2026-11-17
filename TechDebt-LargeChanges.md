# Tech Debt — Large Changes Sub-Report

Companion to `TechDebt.md` item 1 (first written 2026-07-17; item numbers updated 2026-11-17). This refactor is too large for an opportunistic `/debtpayer` pass — it touches multiple files and ~240 lines — so it is broken out here with a concrete plan and risk notes, pending a decision on how to handle it. Line numbers below are from the July scan; see `TechDebt.md` for current ones.

## A. Extract a shared `useInsight` hook (TechDebt item 1)

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
- `onError` reporting funnels through the hook — 2 of the 3 `componentError` report sites (TechDebt item 3) collapse into one, making the eventual "clear on success" fix a one-place change.

**Per-caller wrinkles to preserve:**

- HeroCard fetches year-over-year history (`fetchHistoryDaily`) before the POST — stays in a `buildBody` async callback or a pre-step.
- ActivityScoreCard has a 400 ms debounce, an in-session `iCache` ref keyed on score/temp buckets, and the `isNotableWeatherChange` bypass — the hook needs a `shouldBypassCache` escape hatch, or ActivityScoreCard keeps its ref cache in front of the hook.
- ForecastTab stores a reduced `{ narrative, updatedAt }` shape, not the raw response — `buildBody`/`mapResponse` callbacks cover this.

**Risk:** medium. Behavior-preserving but touches all three insight surfaces at once; each has subtle timing (debounce, notable-change bypass) that needs the existing `forecastHourlyLayout.test.js`-style unit coverage before the move. Best done on its own branch.

## Handling options

- **Track only** — leave both in `TechDebt.md`, act later via `/debtpayer`.
- **Do now, own branch** — it is a candidate for a dedicated branch off `main`.
- **Drop** — remove from tracking if judged not worth the churn.
