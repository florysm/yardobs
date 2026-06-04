import { applyCors } from './lib/cors.js';

const TWC_BASE = 'https://api.weather.com';

// ── Per-IP rate limiter: 30 requests per 5 minutes ────────────────────────────
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT     = 30;
const rateLimiter    = new Map();

function checkRateLimit(ip) {
  const now  = Date.now();
  const entry = rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// Periodic cleanup so the map doesn't grow unbounded in long-lived instances
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimiter) {
    if (now > entry.resetAt) rateLimiter.delete(ip);
  }
}, RATE_WINDOW_MS);

// ── Friendly error messages for common TWC status codes ───────────────────────
function twcErrorMessage(status) {
  if (status === 401) return 'Invalid API key — check your TWC API key in Settings';
  if (status === 403) return 'API access denied — check your TWC API key permissions';
  if (status === 429) return 'TWC API rate limit exceeded — try again in a few minutes';
  if (status === 204 || status === 404) return 'Station not found — check your station ID';
  return `Upstream error (${status})`;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? 'unknown';
  if (checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests — slow down and try again' });
  }

  const { type, date, lat, lon, stationId } = req.query;

  const apiKey = req.headers['x-twc-key'] || process.env.TWC_API_KEY;
  if (!apiKey) return res.status(401).json({ error: 'TWC_API_KEY not configured' });

  // ── Route dispatch ─────────────────────────────────────────────────────────
  let url;
  switch (type) {
    case 'current':
      if (!stationId) return res.status(400).json({ error: 'stationId required' });
      url = `${TWC_BASE}/v2/pws/observations/current?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&apiKey=${apiKey}`;
      break;
    case 'history':
      if (!stationId || !date) return res.status(400).json({ error: 'stationId and date required' });
      url = `${TWC_BASE}/v2/pws/history/hourly?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&date=${date}&apiKey=${apiKey}`;
      break;
    case 'history-recent':
      if (!stationId) return res.status(400).json({ error: 'stationId required' });
      url = `${TWC_BASE}/v2/pws/observations/hourly/7day?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&apiKey=${apiKey}`;
      break;
    case 'history-daily':
      if (!stationId || !date) return res.status(400).json({ error: 'stationId and date required' });
      url = `${TWC_BASE}/v2/pws/history/daily?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&date=${date}&apiKey=${apiKey}`;
      break;
    case 'forecast':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `${TWC_BASE}/v3/wx/forecast/daily/5day?geocode=${lat},${lon}&format=json&units=e&language=en-US&apiKey=${apiKey}`;
      break;
    case 'hourly-forecast':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,weathercode,apparent_temperature,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,uv_index&daily=sunrise,sunset&forecast_days=2&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`;
      break;
    case 'air-quality':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`;
      break;
    default:
      return res.status(400).json({ error: 'Invalid type. Use: current, history, history-daily, forecast, hourly-forecast, air-quality' });
  }

  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), 10_000);

  try {
    const upstream = await fetch(url, { signal: timeoutCtrl.signal });
    clearTimeout(timeoutId);
    const text = await upstream.text();

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: twcErrorMessage(upstream.status) });
    }

    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: 'Upstream non-JSON response', status: upstream.status, body: text.slice(0, 200) });
    }
    return res.status(200).json(data);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(502).json({ error: 'Weather service timed out — try again in a moment' });
    }
    return res.status(502).json({ error: 'Upstream fetch failed', detail: err.message });
  }
}
