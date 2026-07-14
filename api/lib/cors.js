// Reflects the request Origin only when it's in the allowlist, and handles the
// OPTIONS preflight. The app calls /api on its own origin (same-origin, no CORS
// needed), so this allowlist only governs cross-origin callers — it's
// defense-in-depth against other sites invoking the proxies from a browser.
// Returns true if the request was fully handled (caller should return).
const ALLOWED_ORIGINS = new Set([
  'https://yardobs.app',
  'https://www.yardobs.app',
  'https://yardobs.vercel.app',
  'http://localhost:5173',
]);

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TWC-Key');
  }
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}
