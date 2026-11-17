# Tech Debt — Large Changes Sub-Report

Companion to `TechDebt.md` for refactors too large for an opportunistic `/debtpayer` pass: each gets a concrete plan and risk notes here, pending a decision on how to handle it.

_No open items._ The last one — section A, extracting a shared `useInsight` hook (TechDebt item 1) — landed 2026-11-17 as `src/hooks/useInsight.js`, together with the shared `runCachedInsight` pipeline in `api/insight.js` (item 2).

## Handling options

- **Track only** — leave it in `TechDebt.md`, act later via `/debtpayer`.
- **Do now, own branch** — a candidate for a dedicated branch off `main`.
- **Drop** — remove from tracking if judged not worth the churn.
