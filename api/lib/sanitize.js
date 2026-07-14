// Bounds a request body before it's assembled into an LLM prompt, so a crafted
// payload can't inflate token usage (string length, array length, object width,
// and nesting depth are all capped). Numbers/booleans pass through untouched.
// Side-effect-free for unit testing.
export function clampBody(v, depth = 0) {
  if (depth > 5) return null;
  if (typeof v === 'string') return v.slice(0, 500);
  if (Array.isArray(v)) return v.slice(0, 20).map(x => clampBody(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).slice(0, 40)) out[k] = clampBody(v[k], depth + 1);
    return out;
  }
  return v;
}
