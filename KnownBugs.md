# Known Bugs

Last updated: 2026-06-01


<!-- Run /bugtracker to populate this file. Run /bugfixer to fix one item. -->

<!-- Entry format:
**Short description**

What goes wrong, why, and under what condition.

- File: `path/to/file.jsx:lineNumber`
- Impact: [user-visible / data loss / silent failure / crash]
-->

**Empty catch in apiFetch swallows localStorage errors**

`localStorage.getItem()` is wrapped in a `try/catch {}` with an empty body. If localStorage throws (private/incognito mode, storage quota, iframe restrictions), the error is silently discarded and the request proceeds without the `X-TWC-Key` header. The server then returns a 401 which surfaces as `Error: HTTP 401`, obscuring the real cause.

- File: `src/utils/apiFetch.js:8`
- Impact: silent failure

---

**`ipLog` rate-limiter map grows unbounded**

`isRateLimited()` filters old timestamps out of each IP's array on every call, but never deletes the IP key itself from the `ipLog` Map. Every unique IP address ever seen adds a permanent key (holding an increasingly empty array). On long-running serverless instances this is an unbounded memory leak.

- File: `api/insight.js:8-16`
- Impact: silent failure (memory leak on long-running instances)

---

**Insight cache can slightly exceed `CACHE_MAX_SIZE` under concurrent load**

The size check (`if (cache.size >= CACHE_MAX_SIZE) evictOne()`) runs synchronously, but `cache.set()` runs after an `await` for the Anthropic API call. Multiple concurrent requests can each pass the size check before any of them calls `cache.set()`, each then adding an entry, causing the cache to exceed the 500-entry cap by the number of concurrent in-flight requests.

- File: `api/insight.js:124` and `api/insight.js:235`
- Impact: silent failure (bounded cache guarantee violated under concurrent load)

---

**`setInsight()` fires without unmount guard in `.then()` callback**

In `ActivityScoreCard`, the fetch cleanup aborts the controller on unmount (`controller.abort()`), and `.finally()` correctly checks `controller.signal.aborted` before calling `setInsightLoading(false)`. However, the `.then()` callback at line 555 calls `setInsight(text)` unconditionally. If the response arrives just before unmount — after the fetch resolves but before the cleanup runs — `setInsight` fires on a dead component.

- File: `src/components/ActivityScoreCard.jsx:555`
- Impact: silent failure (React warning, state update on unmounted component)
