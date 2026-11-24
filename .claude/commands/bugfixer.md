# YardObs — Bug Fixer

Fix one bug from `KnownBugs.md`, verify the build, and remove the resolved entry.

## Usage

`/bugfixer` — fix the first listed bug
`/bugfixer [keyword]` — fix the bug whose title or description matches the keyword

## Steps

1. Read `KnownBugs.md`. If the file is empty or has no open items, report "Nothing to fix" and stop.
2. Select the target item: use the keyword argument if provided, otherwise pick the first listed bug.
3. **Classify the item** before writing any code:
   - If the bug requires a new API endpoint or significant new feature that doesn't exist yet, do NOT attempt to implement it. Report: "This bug requires a new feature — use `/feature-dev` to scaffold it first." Then stop.
   - Otherwise, proceed.
4. Read every source file the bug references. Understand exactly what is wrong before writing anything.
5. Implement the fix. Keep the change minimal — fix the stated defect, do not refactor surrounding code.
   - If the defective logic lives in (or can be minimally moved to) a pure function in `src/utils/` or `api/lib/`, add a focused regression test next to it (`*.test.js`, Vitest) that fails before the fix and passes after. Don't build test scaffolding for React components or handlers just to cover one fix.
6. Run verification:
   ```
   npm run build
   npm test
   ```
   If either fails, diagnose and fix before continuing. Do not mark the bug resolved while the build or tests are red.
   - Do **not** start the dev server, `vercel dev`, or a browser to verify — the user tests the running app manually. Say in the report what still needs a manual check (which tab, which interaction).
   - For `api/` bugs, exercise the logic through its unit test (e.g. `api/insight.test.js`, `api/lib/*.test.js`) rather than a live endpoint.
7. Update `KnownBugs.md`:
   - Remove the resolved bug entry.
   - Set `Last updated:` to today's date.
8. Report: what the bug was, what changed, which files were modified, build + test results, and what the user should check manually.

## What NOT to do

- Do not fix multiple bugs in one run — pick one and finish it completely.
- Do not refactor code beyond what is needed to fix the bug.
- Do not mark a bug as fixed without `npm run build` and `npm test` passing.
- Do not attempt bugs classified as "requires new feature" — flag them and stop.
- Do not add unrelated tests, comments, or cleanup — one regression test for the fixed defect is the limit.
- Do not commit, bump the version, or open a PR — that's `/release`.

## Project context

- No auth layer: no Supabase, Bearer tokens, `api/settings.js`, or `api/lib/crypto.js`. The TWC key is device-local (`localStorage`, sent as `x-twc-key` by `src/utils/apiFetch.js`).
- Serverless surface: `api/weather.js` (TWC/Open-Meteo/NWS proxy), `api/insight.js` (Claude insights), `api/lib/{cors,sanitize,validate,insightPersona}.js`.
- React 19 + Recharts 2. Recharts 2 resolves children with `react-is@18`, which can't see inside React 19 fragments — never wrap chart children (`<Line>`, `<Bar>`, …) in `<>…</>`; use keyed arrays (see `TrendsTab.jsx`).
