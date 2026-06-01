# Contributing to YardObs

Thanks for your interest in contributing! YardObs is a personal hobby project, and contributions — big or small — are genuinely appreciated. This guide covers everything you need to get started.

## Reporting Bugs

Open a [GitHub issue](https://github.com/florysm/yardobs/issues) and include:

- Your browser and OS
- Your PWS station ID (or whether you're using Preview Mode)
- Steps to reproduce the issue
- What you expected to happen vs. what actually happened

Screenshots or console errors are a huge help.

## Suggesting Features

Open an issue tagged `enhancement`. Focus on the use case — what you're trying to do and why the app doesn't quite get you there — rather than just the feature itself. That context makes it much easier to discuss and prioritize.

## Development Setup

See the [Getting Started section of the README](README.md#getting-started) for full setup instructions. The short version:

```bash
git clone https://github.com/florysm/yardobs.git
cd yardobs
npm install
cp .env.example .env   # fill in your keys
npx vercel dev         # runs frontend + serverless functions together
```

> Use `vercel dev`, not `npm run dev` — the serverless functions in `api/` need to run alongside the frontend for API calls to work.

## Making a Pull Request

1. Fork the repo on GitHub and clone your fork
2. Branch off `main` using a descriptive name: `feature/your-thing` or `fix/your-thing`
3. Make your changes and test them locally
4. Open a PR against `main` with a clear description of what changed and why

A few things that make review go faster:

- **One concern per PR** — fixes and unrelated cleanups should be separate
- **Match the existing style** — no linter is enforced, but try to look like the code around you
- **Keep it scoped** — prefer focused PRs over sweeping refactors unless the refactor was discussed in an issue first

## Questions

Open an issue, or reach out via [Ko-fi](https://ko-fi.com/yardobs) if you'd prefer a less formal channel.
