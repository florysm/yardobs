import { applyCors } from './lib/cors.js';
import { clientIp, createRateLimiter } from './lib/rateLimit.js';

// Receives error reports from the app (src/utils/reportError.js) and writes
// each one to the function log, so a crash on a device we can't attach a
// debugger to (an iOS 10 iPad) shows up in Vercel's runtime logs. Nothing is
// stored. Reports carry the error, where it happened, the app version and the
// browser; no key, station data or setup link (both ends scrub them).

// Per IP: a crash loop shouldn't flood the log.
const rateLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

const LIMITS = { message: 500, stack: 4000, componentStack: 4000, where: 120, version: 40, ua: 300, path: 200, size: 20 };

// Anything shaped like a TWC key (32 letters/digits) or a setup link fragment.
export function scrub(text) {
  return String(text)
    .replace(/#setup[=&][^\s"')]*/g, '#setup…')
    .replace(/\b[A-Za-z0-9]{32}\b/g, '[redacted]');
}

export function cleanReport(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const [field, max] of Object.entries(LIMITS)) {
    const v = body[field];
    if (v == null || v === '') continue;
    out[field] = scrub(v).slice(0, max);
  }
  return out.message ? out : null;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (rateLimiter.hit(clientIp(req))) return res.status(429).json({ error: 'Too many reports' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const report = cleanReport(body);
  if (!report) return res.status(400).json({ error: 'Missing message' });

  // One line per report, prefixed so it's easy to search for in the logs.
  console.error('[client-error]', JSON.stringify(report));
  return res.status(204).end();
}
