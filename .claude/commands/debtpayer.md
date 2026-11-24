# YardObs — Debt Payer

Address one tech debt item from `TechDebt.md`, run checks, and update the file.

## Usage

`/debtpayer` — address the first High-priority item
`/debtpayer [keyword]` — address the item whose title matches the keyword

## Steps

1. Read `TechDebt.md` in full. If no open items exist, report "Nothing to address" and stop.
2. Select the target item: use the keyword argument if provided, otherwise pick the first item under **High Priority**.
3. Read every source file the item references to understand the full scope of the change.
4. **Classify the item** (see criteria below) as **mechanical** or **structural**.
5. Follow the path for that classification (see below).
6. Run verification after all changes are made:
   ```
   npm run build
   npm test
   ```
   Fix any failures before proceeding. Existing tests must keep passing unchanged for a mechanical item — if a test needs editing, the change wasn't purely mechanical. Do **not** start the dev server, `vercel dev`, or a browser — the user tests the running app manually; list in the report what they should check.
7. Update `TechDebt.md`:
   - Remove the resolved item.
   - Update scope counts on any related items whose affected-file counts changed.
   - Set `Last updated:` to today's date.
8. Report: what the item was, what changed, which files were modified, build + test results, and what to check manually.

---

## Mechanical items — implement directly

A change is **mechanical** if it meets all of these:
- The transformation is deterministic (extract X from N files and put it in one place)
- No behavioral change — inputs/outputs stay identical, only the location of code moves
- The affected files are already known and listed in `TechDebt.md`

**Examples:** extracting a duplicated formatter (e.g. `fmtUpdatedAt()`) into `src/utils/format.js`, exporting a shared constant (e.g. `HPA_PER_INHG`) used in two files, moving a duplicated constant array (e.g. the partly-cloudy icon codes) into one module, replacing a duplicated inline style object with a `.y-*` class in `src/index.css`.

**Process:** Read all affected files → make the changes → if you created a new pure helper in `src/utils/`, add a small test beside it → run `npm run build` and `npm test` → update `TechDebt.md`.

---

## Structural items — plan first, then implement

A change is **structural** if it involves:
- Introducing new shared infrastructure (ErrorBoundary, toast/notification system)
- Changing how state or errors flow through the component tree
- Replacing a pattern across multiple pages/components (e.g., adopting a centralized theme constant)
- Changes to `api/` that alter request/response shapes
- Adding a new app-wide error surface (the bottom banner in `App.jsx` shows only `useWeather`'s `error`; cards show their own failure state — `componentError` was removed 2026-11-17)
- Anything with a breakdown in `TechDebt-LargeChanges.md` 

**Process:**
1. Read all affected files (and the item's section in `TechDebt-LargeChanges.md`, if any).
2. Write out a concrete plan: what changes in each file, in what order, and why.
3. **Stop and ask the user to confirm before writing any code.**
4. After confirmation, implement the changes file by file.
5. Run `npm run build` and `npm test`.
6. Update `TechDebt.md` (and remove the item's section from `TechDebt-LargeChanges.md` once done).

---

## What NOT to do

- Do not address multiple debt items in one run — one item, fully completed.
- Do not refactor beyond the scope of the selected item.
- Do not remove an item from `TechDebt.md` without `npm run build` and `npm test` passing first.
- Do not treat a structural item as mechanical to skip the confirmation step.
- Do not add unrelated tests, comments, or cleanup as part of the change.
- Do not commit, bump the version, or open a PR — that's `/release`.
