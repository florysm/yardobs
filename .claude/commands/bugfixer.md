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
6. Run verification:
   ```
   npm run build
   ```
   If the build fails, diagnose and fix before continuing. Do not mark the bug resolved while the build is red.
7. Update `KnownBugs.md`:
   - Remove the resolved bug entry.
   - Set `Last updated:` to today's date.
8. Report: what the bug was, what changed, which files were modified, build result.

## What NOT to do

- Do not fix multiple bugs in one run — pick one and finish it completely.
- Do not refactor code beyond what is needed to fix the bug.
- Do not mark a bug as fixed without running `npm run build`.
- Do not attempt bugs classified as "requires new feature" — flag them and stop.
- Do not add tests, comments, or unrelated cleanup as part of the fix.
