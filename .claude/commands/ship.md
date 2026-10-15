# YardObs — Ship

Prepare a feature branch to merge: summarize its changes in plain English, bring the documentation back in step with the code, write the CHANGELOG entry, bump the version, and open a PR whose title carries the version. Run it **on the feature branch, right before the PR** — the version bump and changelog travel in the same PR as the change that caused them. Always confirms with the user before writing or publishing anything.

Every merge to `main` deploys to Vercel, so the PR you open here *is* the release. There is no separate release PR.

## Usage

`/ship` — prepare the current branch and open the PR.
`/ship tag` — after the PR has been merged: create the git tag and GitHub release, and check the deploy.

## Steps (`/ship`)

### 1. Check where you are

```bash
git branch --show-current
git status --short
git fetch origin --tags
```

- If the current branch is `main`, stop — ship from a feature branch.
- Note any uncommitted or untracked files. Everything the release should include will be committed in step 8; anything that should *not* ship (scratch files, local config such as `.claude/launch.json`) must stay out of the commit. If something looks unintended, ask.
- If the branch is behind `origin/main`, merge it in now (`git merge origin/main`), so the changelog and version are computed against what is actually on `main`. If the merge conflicts in `package.json` or `CHANGELOG.md`, resolve it by keeping `main`'s content and re-deriving this branch's version and entry afterward.

### 2. Find everything unreleased

"Unreleased" means everything since the last tag — including changes already merged to `main` that were never given a version, plus this branch's own commits and working-tree changes.

```bash
LAST=$(git describe --tags --abbrev=0)
git log $LAST..HEAD --oneline
git diff $LAST --stat
```

Read `CHANGELOG.md` and the `package.json` version. The next version is derived from the **latest tag on `origin/main`**, never from memory or from this branch's `package.json` alone.

If there are no commits and no working-tree changes since the last tag, report "Nothing to ship." and stop.

### 3. Verify the tree is green

```bash
npm test
npm run build
```

If either fails, report the output and **stop** — no changelog, no version bump, no PR. Running tests is read-only.

### 4. Translate changes into plain English

Read the actual diff (`git diff $LAST -- src/ api/`) if commit messages are sparse. Write changelog bullets using the **Plain-English Guidelines** below, grouped into `Added`, `Fixed`, `Changed` (omit empty sections).

### 5. Check the docs against the diff

Documentation drifts silently — nothing fails when the README describes something that no longer exists. Walk the **Documentation Drift Triggers** table against the diff and list every doc that is now factually wrong.

Derive this from the diff, not from memory. A trigger firing means "go look", not "it's wrong" — open the file and confirm before proposing an edit. Report each as:
- **A specific proposed edit** — quote the current wording and the replacement.
- **No drift found** — say so, naming the files you checked.

Rules:
- **Only correct what the diff made untrue.** Not a license to rewrite prose, restructure sections, or fix unrelated typos. Mention other problems and leave them alone.
- **Never touch `docs/TWCAPIDocs/`** (vendor reference) or `docs/archive/` (historical record, stale on purpose).

### 6. Determine the bump type

Use the **Bump Type Rules** below. Compute the new version from the latest tag's version.

### 7. Present the proposal for confirmation

Show exactly what will happen — write and push nothing yet:

---

**Ready to ship:**

Version: `X.Y.Z → X.Y.W` (patch / minor / major — *one sentence why*)
PR title: `vX.Y.W — <short summary>`
Files that will be committed: *(list from `git status`, flagging anything unusual)*

**Proposed CHANGELOG entry:**
```
## [X.Y.W] - YYYY-MM-DD

### Added
- ...
```

**Documentation updates:** (or "None needed — checked README.md, .env.example.")

Reply **yes** to ship, or tell me what to adjust.

---

Wait for an explicit "yes". Revise and re-show if the user wants changes. The doc edits are part of what is being confirmed.

### 8. Write, bump, and commit

1. Prepend the new block to `CHANGELOG.md` (after the title and intro, before the previous latest block); preserve everything else.
2. Apply exactly the doc edits confirmed in step 7.
3. Bump the version **without tagging or pushing**:
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```
4. Stage the specific files (review `git status`; do not blindly `git add -A`), then commit once:
   ```bash
   git commit -m "vX.Y.W — <short summary>

   <the Co-Authored-By trailer your environment specifies>"
   ```

Do **not** use `npm run release:*` — those scripts tag and push from the branch, which leaves the tag on a commit that never lands on `main` after a merge.

### 9. Push and open the PR

```bash
git push -u origin HEAD
gh pr create --title "vX.Y.W — <short summary>" --body "$(cat <<'EOF'
## vX.Y.W

<changelog bullets>

<the PR attribution line your environment specifies>
EOF
)"
```

### 10. Report

Confirm: the version, the PR URL, which docs were updated (or that none needed it), and that **merging deploys to Vercel**. Remind the user to run `/ship tag` after merging.

## Steps (`/ship tag`)

Run after the PR is merged.

1. `git fetch origin --tags` and confirm the PR is merged: `gh pr view <number> --json state,mergeCommit`. If it is not merged, stop.
2. Read the version from `package.json` on `origin/main` (`git show origin/main:package.json`) and confirm no tag for it exists yet.
3. Create the tag and release on the merged commit, using the CHANGELOG block as notes:
   ```bash
   gh release create vX.Y.W --target main --title "vX.Y.W" --notes "<changelog bullets>"
   ```
4. Check the Vercel deployment for the merge commit is green (`gh api repos/{owner}/{repo}/commits/<sha>/status`, or the Vercel connector if available) and report it.

---

## Plain-English Guidelines

Write for a non-technical user who uses the app, not a developer reading code.

| Instead of… | Write… |
|-------------|--------|
| "Refactored LocationSetup component" | "Improved how the app remembers your location" |
| "Fixed null pointer in useWeather hook" | "Fixed a crash that could happen when loading weather data" |
| "Added PWS station ID validation" | "Added clearer error messages when entering your weather station ID" |
| "Updated CSS variables for theme" | "Polished the app's appearance in dark and light modes" |
| "Migrated auth to Supabase" | "Upgraded sign-in to be more reliable" |

Rules:
- One bullet per distinct user-visible change. Combine internal changes that affect the same feature.
- Lead with the user impact: what they can now do, or what no longer breaks.
- Fold purely internal refactors and dependency bumps into a related bullet, or a single short "Changed" bullet.
- One sentence per bullet.

---

## Documentation Drift Triggers

Mechanical checks so the same diff gives the same result every run. Grep the diff for the left column; if it fires, open the file in the middle column and verify the claim in the right column.

| If the diff… | Check | Because it documents |
|---|---|---|
| adds, removes, or renames a `case '<type>':` in `api/weather.js` | `README.md` → **API Reference** | a table of every `type` param, its source, and whether it needs a key |
| changes which routes need auth (the `x-twc-key` / `keylessTypes` logic) | `README.md` → **API Reference**, **Getting Started** | which modes work without a key |
| adds or removes a `process.env.*` or `import.meta.env.*` read | `README.md` → **Environment Variables**, `.env.example` | the full list of env vars |
| changes the fields requested from an upstream API (Open-Meteo `hourly=` / `daily=` / `current=`, TWC endpoints) | `README.md` → **API Reference** | what each route returns |
| adds or deletes a file under `src/` or `api/` | `README.md` → **Project Structure** | an annotated file tree |
| adds a `type:` to the `api/insight.js` router | `README.md` → **API Reference** → `POST /api/insight` | the insight modes |
| adds a user-facing feature, tab, or setting | `README.md` → **Features** | the bullet list users read first |
| changes `src/themes.js` or the `body.theme-*` blocks | `README.md` → **Theming** | the theme list and how switching works |
| changes `STORAGE_KEYS` or what is persisted locally | `README.md` → **What is this?** | the privacy claim about what stays in the browser |
| changes `package.json` dependencies or major versions of React, Vite, Leaflet, Tailwind, Recharts | `README.md` → **Tech Stack** table | the framework and library versions |
| changes a third-party data or tile provider | `README.md` → **Features**, **Tech Stack**, **Acknowledgments** | which services the app depends on and credits |
| changes the dev-server or deploy steps (`vercel.json`, scripts, CI, `.claude/launch.json` conventions) | `README.md` → **Fork and Run Locally**, **Deploy Your Own Instance** | the setup instructions |

If the diff touches something that clearly belongs in the docs but no row covers it, say so in the proposal and suggest adding a row here.

---

## Bump Type Rules

| Type | Use when the changes include… |
|------|-------------------------------|
| `patch` | Bug fixes, visual polish, copy tweaks, performance improvements, dependency bumps, internal refactors with no UX change |
| `minor` | Any new user-facing feature, new tab/view/section, new setting or control, meaningful new capability |
| `major` | Breaking change to auth or data storage, removal of a feature users depend on, complete redesign of core flows |

When in doubt between patch and minor, choose minor. When in doubt between minor and major, ask the user.

---

## What NOT to do

- Do not proceed past step 3 if `npm test` or `npm run build` fails.
- Do not write to `CHANGELOG.md`, edit any doc, bump the version, push, or open a PR before the user confirms.
- Do not run `/ship` from `main`.
- Do not create or push a tag from a feature branch — tags are created after the merge, by `/ship tag`.
- Do not use `npm run release:*`.
- Do not fabricate changelog entries — derive every bullet from the actual diff and commits.
- Do not commit local-only files (for example `.claude/launch.json`, `.env`). Stage deliberately.
- Do not modify source files (`.jsx`, `.js`, `.css`). This skill writes only `CHANGELOG.md`, the version in `package.json` / `package-lock.json`, and the documentation files named in step 5. **If a doc is wrong because the code is wrong, say so and stop** — that is a separate change.
- Do not edit `docs/TWCAPIDocs/` or `docs/archive/`.
- Do not treat the doc check as license to rewrite prose.
- Do not claim a doc check happened without doing it; if no drift is found, name the files you checked.
- Do not invent a version number — derive it from the latest tag by the chosen bump type.
- Do not skip the confirmation step even if the changes seem straightforward.
