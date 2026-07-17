import { applyCors } from './lib/cors.js';
import { validCoords, validStationId, validDate } from './lib/validate.js';

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

  // ── Input validation — reject malformed params before they reach upstream URLs
  if (!validCoords(lat, lon)) return res.status(400).json({ error: 'Invalid coordinates' });
  if (!validStationId(stationId)) return res.status(400).json({ error: 'Invalid station ID' });
  if (!validDate(date)) return res.status(400).json({ error: 'Invalid date' });

  // Every TWC/PWS endpoint uses the caller's own key (sent as X-TWC-Key by
  // station owners). There is deliberately no server-side fallback key: preview
  // mode is served entirely by Open-Meteo, so no shared credential is exposed to
  // anonymous traffic and no owner quota is spent on it.
  const apiKey = req.headers['x-twc-key'];
  const keylessTypes = new Set(['hourly-forecast', 'air-quality', 'alerts']);
  if (!apiKey && !keylessTypes.has(type)) {
    return res.status(401).json({ error: 'TWC API key required — add your station key in Settings.' });
  }

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
    case 'hourly-forecast-twc':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `${TWC_BASE}/v3/wx/forecast/hourly/2day?geocode=${lat},${lon}&format=json&units=e&language=en-US&apiKey=${apiKey}`;
      break;
    case 'hourly-forecast':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      // forecast_days=5 matches the TWC 5-day span, so every day the Forecast tab
      // shows also has an hourly curve to narrate from. Hourly consumers either
      // filter to today (getArcData, getForecastRainThreat) or slice (buildHours),
      // so the longer arrays are additive.
      //
      // The `daily` block is what preview mode uses for its 5-day forecast — it
      // rides along on this request rather than costing a second round trip.
      url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,weathercode,apparent_temperature,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,uv_index&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&forecast_days=5&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`;
      break;
    case 'air-quality':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      // Kept in step with the client's direct call in useWeather (fetchAirQuality):
      // `hourly=us_aqi` is what lets the Forecast tab report air quality per day.
      url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&hourly=us_aqi&forecast_days=5&timezone=auto`;
      break;
    case 'alerts':
      // Severe-weather alerts. NWS is free/keyless but US-only; the client
      // normalizes the response (src/utils/alerts.js) so another source can be
      // swapped in here later without touching the UI.
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
      break;
    default:
      return res.status(400).json({ error: 'Invalid type. Use: current, history, history-daily, forecast, hourly-forecast, air-quality, alerts' });
  }

  // NWS requires an identifying User-Agent; other upstreams ignore it.
  const fetchHeaders = type === 'alerts'
    ? { 'User-Agent': '(YardObs, https://yardobs.app)', 'Accept': 'application/geo+json' }
    : {};

  const timeoutCtrl = new AbortController();
  const timeoutId = setTimeout(() => timeoutCtrl.abort(), 10_000);

  try {
    const upstream = await fetch(url, { signal: timeoutCtrl.signal, headers: fetchHeaders });
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
