# YardObs — Release

Summarize unreleased changes in plain English, write a CHANGELOG entry, bump the version, and push to deploy. Always confirms with the user before writing or publishing anything.

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

### 2. Translate changes into plain English

Read the actual diff for context (`git diff <tag>..HEAD -- src/`) if the commit messages are sparse. Then write changelog bullets using the **Plain-English Guidelines** below.

Group bullets into the sections that apply: `Added`, `Fixed`, `Changed`. Omit any section that has no bullets.

### 3. Determine the bump type

Use the **Bump Type Rules** table below to decide `patch`, `minor`, or `major`.

### 4. Present the proposal for confirmation

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

Reply **yes** to release, or tell me what to adjust.

---

Wait for an explicit "yes" (or equivalent affirmative) before proceeding. If the user wants changes, revise the proposal and show it again.

### 5. Write the CHANGELOG entry

Prepend the new version block to `CHANGELOG.md`, immediately after the title and introductory paragraph and before the previous latest version block. Preserve all existing content exactly.

### 6. Run the release script

```bash
npm run release:patch    # for a patch bump
npm run release:minor    # for a minor bump
npm run release:major    # for a major bump
```

This bumps `package.json`, creates a git commit and tag, and pushes to GitHub. Vercel picks up the push and deploys automatically — no additional deploy step is needed.

### 7. Report

Confirm:
- New version number and tag created
- What's in the release (the changelog bullets)
- That Vercel deployment has been triggered (it will be live in ~1–2 minutes)

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

## Bump Type Rules

| Type | Use when the changes include… |
|------|-------------------------------|
| `patch` | Bug fixes, visual polish, copy tweaks, performance improvements, internal refactors with no UX change |
| `minor` | Any new user-facing feature, new tab/view/section, new setting or control, meaningful new capability |
| `major` | Breaking change to auth or data storage, removal of a feature users depend on, complete redesign of core flows |

When in doubt between patch and minor, choose minor. When in doubt between minor and major, ask the user.

---

## What NOT to do

- Do not write to `CHANGELOG.md` or run any release command before the user confirms.
- Do not fabricate changelog entries — derive every bullet from the actual diff and commits.
- Do not modify any source files (`.jsx`, `.js`, `.css`) — this skill only touches `CHANGELOG.md` and runs the release script.
- Do not skip the confirmation step even if the changes seem straightforward.
- Do not run `npm run release:*` more than once per invocation.
- Do not invent a version number — always derive it by incrementing the current `package.json` version according to the chosen bump type.
