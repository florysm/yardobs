import { useEffect, useRef, useState } from 'react';
import { readInsightCache, writeInsightCache } from '../utils/insightCache';

// The one AI-insight flow: saved copy → POST /api/insight → save → show.
//
//   storageKey  localStorage key (from a STORAGE_KEYS builder)
//   enabled     false skips the effect and leaves the current insight in place
//   buildBody   async (signal) => request body; may do other fetches first
//   accept      (json) => the value to show and save, or null when the reply
//               has nothing to show (null is never saved, so the next run retries)
//   meta        () => extra data saved with the result (optional)
//   isStale     (meta) => true to ignore a saved copy that is still in date (optional)
//   debounceMs  wait before the request, so quick successive updates send one
//   deps        everything else that should re-run the lookup
//
// Returns { data, loading }. On failure data is null and loading false; the
// card shows its own "unavailable" text and the next run tries again.
export function useInsight({ storageKey, enabled = true, buildBody, accept, meta, isStale, debounceMs = 0, deps = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Callers pass fresh closures every render; the effect reads the latest ones.
  const fns = useRef();
  fns.current = { buildBody, accept, meta, isStale };

  useEffect(() => {
    // A request cancelled by the previous run must not leave loading stuck on.
    if (!enabled || !storageKey) { setLoading(false); return; }

    const saved = readInsightCache(storageKey);
    if (saved && !fns.current.isStale?.(saved.meta)) {
      setData(saved.data);
      setLoading(false);
      return;
    }

    setData(null);
    setLoading(true);
    const controller = new AbortController();
    const { signal } = controller;

    const timer = setTimeout(async () => {
      const { buildBody, accept, meta } = fns.current;
      let result = null;
      try {
        const body = await buildBody(signal);
        if (signal.aborted) return;
        const res = await fetch('/api/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        });
        if (!res.ok) throw new Error(`insight ${res.status}`);
        const json = await res.json();
        if (signal.aborted) return;
        result = accept(json);
        if (result != null) writeInsightCache(storageKey, result, meta?.());
      } catch (err) {
        if (signal.aborted || err?.name === 'AbortError') return;
        result = null;
      }
      if (signal.aborted) return;
      setData(result);
      setLoading(false);
    }, debounceMs);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [storageKey, enabled, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
