# YardObs — Release

Summarize unreleased changes in plain English, bring the documentation back in step with the code, write a CHANGELOG entry, bump the version, and push to deploy. Always confirms with the user before writing or publishing anything.

## Usage

`/release`

## Steps

### 1. Find unreleased commits

Run both commands to understand what's changed since the last release:

```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline
git diff $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --stat
```

If no commits are found (output is empty), report "Nothing to release since the last tag." and stop.

Read `CHANGELOG.md` to see the current latest version so you know what the next version number will be.

### 2. Verify the release is green

Before drafting or proposing anything, confirm the working tree is releasable:

```bash
npm test
npm run build
```

If either fails, report the failing output and **stop** — do not draft a changelog, bump the version, or push. Only continue once both are green. (Running tests is read-only; this does not count as modifying source files.)

### 3. Translate changes into plain English

Read the actual diff for context (`git diff <tag>..HEAD -- src/`) if the commit messages are sparse. Then write changelog bullets using the **Plain-English Guidelines** below.

Group bullets into the sections that apply: `Added`, `Fixed`, `Changed`. Omit any section that has no bullets.

### 4. Check the docs against the diff

Documentation drifts silently — nothing fails when the README describes an endpoint that no longer exists. Walk the **Documentation Drift Triggers** table below against the release diff and list every doc that is now factually wrong.

Derive this from the diff, not from memory. For each trigger that fires, open the named file and confirm whether it is actually stale before proposing an edit — a trigger firing means "go look", not "it's wrong".

Report findings as one of:
- **A specific proposed edit** — quote the current wording and the replacement.
- **No drift found** — say so explicitly, so the user knows the check ran rather than being skipped.

Two rules:
- **Only correct what the diff made untrue.** This step fixes stale docs; it is not a license to rewrite prose, restructure sections, or fix unrelated typos noticed in passing. If something is wrong but not caused by this diff, mention it and leave it alone.
- **Never touch `docs/TWCAPIDocs/`** — vendor API reference, not ours to edit. `docs/archive/` is a historical record; leave it stale on purpose.

### 5. Determine the bump type

Use the **Bump Type Rules** table below to decide `patch`, `minor`, or `major`.

### 6. Present the proposal for confirmation

Show the user **exactly** what will happen — do not write or push anything yet:

---

**Ready to release:**

Bump: `0.x.y → 0.x.z` (patch / minor / major — *one sentence explaining why*)

**Proposed CHANGELOG entry:**
```
## [0.x.z] - YYYY-MM-DD

### Added
- ...

### Fixed
- ...
```

**Documentation updates:** (or "None needed — checked README, .env.example.")
- `README.md` — *what is stale and what it becomes*
- `.env.example` — *what is stale and what it becomes*

Reply **yes** to release, or tell me what to adjust.

---

Wait for an explicit "yes" (or equivalent affirmative) before proceeding. If the user wants changes, revise the proposal and show it again. The doc edits are part of what is being confirmed — do not write them ahead of the "yes" either.

### 7. Write the CHANGELOG entry and the doc updates

Prepend the new version block to `CHANGELOG.md`, immediately after the title and introductory paragraph and before the previous latest version block. Preserve all existing content exactly.

Then apply the documentation edits confirmed in step 6 — exactly those, nothing more.

### 8. Commit the content

`npm version` **fails on a dirty working tree**, and step 7 just made it dirty. Commit first:

```bash
git add -A
git commit -m "$(cat <<'EOF'
X.Y.Z — <short summary>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

This is the pattern the repo already follows: a content commit carrying the changelog, docs, and code, followed by the version-bump commit the script creates (e.g. `99919c2` then `8590633` for 1.4.0).

If the tree is somehow still dirty after this, stop and report — do not force the version bump.

### 9. Run the release script

```bash
npm run release:patch    # for a patch bump
npm run release:minor    # for a minor bump
npm run release:major    # for a major bump
```

This bumps `package.json`, creates a git commit and tag, and pushes the current branch to GitHub.

### 10. Create a pull request

```bash
gh pr create --title "Release vX.Y.Z" --body "$(cat <<'EOF'
## Changes

- <paste changelog bullets here>

EOF
)"
```

Use the changelog bullets from step 3 as the PR body. The title should be `Release vX.Y.Z` with the new version number.

### 11. Report

Confirm:
- New version number and tag created
- Which documentation files were updated, or that none needed it
- The PR URL — the user will merge it when ready
- Vercel deployment will trigger automatically after the PR is merged

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
- One bullet per distinct user-visible change. Combine two internal changes that affect the same feature into one bullet.
- Lead with the user impact: what they can now do, or what no longer breaks.
- Skip purely internal refactors with no user-visible effect (don't omit them — just fold them into a related functional bullet if one exists, or drop them).
- Keep bullets to one sentence each.

---

## Documentation Drift Triggers

Mechanical checks, so the same diff produces the same result every run. Grep the release diff for the left column; if it fires, open the file in the middle column and verify the claim in the right column still holds.

| If the diff… | Check | Because it documents |
|---|---|---|
| adds, removes, or renames a `case '<type>':` in `api/weather.js` | `README.md` → **API Reference** | a table of every `type` param, its source, and whether it needs a key |
| changes which routes need auth (the `x-twc-key` / `keylessTypes` logic) | `README.md` → **API Reference**, **Getting Started** | which modes work without a key |
| adds or removes a `process.env.*` read | `README.md` → **Environment Variables**, `.env.example` | the full list of required env vars |
| changes the fields requested from an upstream API (Open-Meteo `hourly=` / `daily=` / `current=`, TWC endpoints) | `README.md` → **API Reference** | what each route returns |
| adds or deletes a file under `src/` or `api/` | `README.md` → **Project Structure** | an annotated file tree |
| adds a `type:` to the `api/insight.js` router | `README.md` → **API Reference** → `POST /api/insight` | the insight modes |
| adds a user-facing feature, tab, or setting | `README.md` → **Features** | the bullet list users read first |
| changes `src/themes.js` or the `body.theme-*` blocks | `README.md` → **Theming** | the theme list and how switching works |
| changes `STORAGE_KEYS` or what is persisted locally | `README.md` → **What is this?** | the privacy claim about what stays in the browser |
| changes the dev-server or deploy steps (`vercel.json`, scripts, CI) | `README.md` → **Fork and Run Locally**, **Deploy Your Own Instance** | the setup instructions |

**Worked example.** A release that removed the server-side `TWC_API_KEY` fallback fired three rows — auth logic, `process.env.*`, and upstream fields. It left six stale mentions across `README.md` and one in `.env.example`, including a documented env var that nothing read any more. Nothing failed; the tests passed and the build was green. Only reading the docs against the diff catches that class of thing.

If the diff touches something that clearly belongs in the docs but no row covers it, say so in the proposal and suggest adding a row here.

---

## Bump Type Rules

| Type | Use when the changes include… |
|------|-------------------------------|
| `patch` | Bug fixes, visual polish, copy tweaks, performance improvements, internal refactors with no UX change |
| `minor` | Any new user-facing feature, new tab/view/section, new setting or control, meaningful new capability |
| `major` | Breaking change to auth or data storage, removal of a feature users depend on, complete redesign of core flows |

When in doubt between patch and minor, choose minor. When in doubt between minor and major, ask the user.

---

## What NOT to do

- Do not proceed past step 2 if `npm test` or `npm run build` fails — never cut a release on a red tree.
- Do not write to `CHANGELOG.md`, edit any doc, or run any release command before the user confirms.
- Do not fabricate changelog entries — derive every bullet from the actual diff and commits.
- Do not modify source files (`.jsx`, `.js`, `.css`). This skill writes only `CHANGELOG.md` and the documentation files named in step 4, and runs the release script. **If a doc is wrong because the code is wrong, say so and stop — do not "fix" it by editing the code.** That is a separate change needing its own review.
- Do not edit `docs/TWCAPIDocs/` (vendor reference) or `docs/archive/` (historical record — stale by design).
- Do not treat the doc check as license to rewrite prose. Correct only what this diff made untrue; report anything else you notice and leave it.
- Do not claim a doc check happened without doing it. If no drift is found, say which files you checked.
- Do not skip the confirmation step even if the changes seem straightforward.
- Do not run `npm run release:*` more than once per invocation.
- Do not invent a version number — always derive it by incrementing the current `package.json` version according to the chosen bump type.
