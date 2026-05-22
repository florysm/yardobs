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
   ```
   Fix any build failures before proceeding. If the item touched serverless functions in `api/`, also run `vercel dev` and manually spot-check the affected endpoint.
7. Update `TechDebt.md`:
   - Remove the resolved item.
   - Update scope counts on any related items whose affected-file counts changed.
   - Set `Last updated:` to today's date.
8. Report: what the item was, what changed, which files were modified, build result.

---

## Mechanical items — implement directly

A change is **mechanical** if it meets all of these:
- The transformation is deterministic (extract X from N files and put it in one place)
- No behavioral change — inputs/outputs stay identical, only the location of code moves
- The affected files are already known and listed in `TechDebt.md`

**Examples:** extracting a duplicated utility function, moving `calcFeelsLike` to `src/utils/`, consolidating localStorage key strings into a constants object, moving a constant array from two component files into `src/utils/`, extracting `StationForm` from `SettingsDrawer.jsx` into its own file, extracting a shared `setCorsHeaders(res)` helper into `api/lib/`.

**Process:** Read all affected files → make the changes → run `npm run build` → update `TechDebt.md`.

---

## Structural items — plan first, then implement

A change is **structural** if it involves:
- Introducing new shared infrastructure (ErrorBoundary, toast/notification system)
- Changing how state or errors flow through the component tree
- Replacing a pattern across multiple pages/components (e.g., adopting a centralized theme constant)
- Changes to `api/` that alter request/response shapes
- Connecting a new error source into the existing error-banner pipeline in `App.jsx` (e.g., wiring `useUserSettings` `error` state or auth errors into the bottom-banner display)

**Process:**
1. Read all affected files.
2. Write out a concrete plan: what changes in each file, in what order, and why.
3. **Stop and ask the user to confirm before writing any code.**
4. After confirmation, implement the changes file by file.
5. Run `npm run build`.
6. Update `TechDebt.md`.

---

## What NOT to do

- Do not address multiple debt items in one run — one item, fully completed.
- Do not refactor beyond the scope of the selected item.
- Do not remove an item from `TechDebt.md` without running `npm run build` first.
- Do not treat a structural item as mechanical to skip the confirmation step.
- Do not add tests, comments, or unrelated cleanup as part of the change.
