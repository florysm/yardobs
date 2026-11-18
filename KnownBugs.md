# Known Bugs

Last updated: 2026-11-17

<!-- Run /bugtracker to populate this file. Run /bugfixer to fix one item. -->

<!-- Entry format:
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
-->

**Per-IP rate limiters never recover if the host clock jumps backward**

A backward clock jump breaks elapsed-time math (the insight cache had the same bug, fixed 2026-11-17 with an `age >= 0` check). `isRateLimited` in `api/insight.js` filters timestamps with `now - ts < CACHE_TTL_MS`; after a backward clock jump every stored timestamp counts as "recent" indefinitely (and the sweep keeps them), so a capped IP stays 429'd. `checkRateLimit` in `api/weather.js` only resets when `now > entry.resetAt`; a backward jump leaves `resetAt` in the future and `count` never resets. Fix is a shared guard that treats negative elapsed as expired.

- File: `api/insight.js:12` (isRateLimited filter), `api/insight.js:24` (ipLog sweep), `api/weather.js:14` (checkRateLimit reset condition)
- Impact: user-visible
