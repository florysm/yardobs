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

// ── NWS helpers ───────────────────────────────────────────────────────────────
function parseMph(str) {
  if (!str) return null;
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

function nwsFeelsLike(p) {
  const t = p.temperature, h = p.relativeHumidity?.value, w = parseMph(p.windSpeed);
  if (t == null) return null;
  if (t >= 80 && h != null) {
    const hi = -42.379 + 2.04901523*t + 10.14333127*h - 0.22475541*t*h
      - 0.00683783*t*t - 0.05481717*h*h + 0.00122874*t*t*h
      + 0.00085282*t*h*h - 0.00000199*t*t*h*h;
    return Math.round(hi);
  }
  if (t <= 50 && w != null && w > 3) {
    return Math.round(35.74 + 0.6215*t - 35.75*Math.pow(w, 0.16) + 0.4275*t*Math.pow(w, 0.16));
  }
  return t;
}

const NWS_WMO = {
  skc: 0, few: 1, sct: 2, bkn: 3, ovc: 3,
  wind_skc: 0, wind_few: 1, wind_sct: 2, wind_bkn: 3, wind_ovc: 3,
  fog: 45, haze: 51, smoke: 45, dust: 45,
  rain: 61, rain_showers: 80, rain_showers_hi: 82,
  fzra: 66, rain_fzra: 66, rain_snow: 67, rain_sleet: 67,
  snow: 71, blizzard: 71, snow_sleet: 77, sleet: 77, snow_fzra: 77,
  tsra: 95, tsra_sct: 95, tsra_hi: 99,
  tornado: 99, hurricane: 99, tropical_storm: 95,
  hot: 0, cold: 0,
};

function nwsIconToWmo(iconUrl) {
  if (!iconUrl) return null;
  const match = iconUrl.match(/\/icons\/land\/(?:day|night)\/([a-z_]+)/);
  return NWS_WMO[match?.[1]] ?? null;
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
    case 'hourly-forecast-nws': {
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      const nwsCtrl = new AbortController();
      const nwsTid = setTimeout(() => nwsCtrl.abort(), 10_000);
      const nwsOpts = { headers: { 'User-Agent': 'YardObs/1.0 (yardobs.app)' }, signal: nwsCtrl.signal };
      try {
        const ptRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`, nwsOpts);
        if (!ptRes.ok) return res.status(ptRes.status).json({ error: 'NWS location lookup failed' });
        const ptData = await ptRes.json();
        const hourlyUrl = ptData.properties?.forecastHourly;
        if (!hourlyUrl) return res.status(502).json({ error: 'NWS hourly URL missing' });
        const hRes = await fetch(`${hourlyUrl}?units=us`, nwsOpts);
        if (!hRes.ok) return res.status(hRes.status).json({ error: 'NWS hourly fetch failed' });
        const hData = await hRes.json();
        const periods = (hData.properties?.periods ?? []).slice(0, 48);
        return res.status(200).json({
          hourly: {
            time:                      periods.map(p => p.startTime),
            temperature_2m:            periods.map(p => p.temperature),
            apparent_temperature:      periods.map(p => nwsFeelsLike(p)),
            precipitation_probability: periods.map(p => p.probabilityOfPrecipitation?.value ?? 0),
            weathercode:               periods.map(p => nwsIconToWmo(p.icon)),
            wind_speed_10m:            periods.map(p => parseMph(p.windSpeed)),
            wind_gusts_10m:            periods.map(p => parseMph(p.windGust)),
            relative_humidity_2m:      periods.map(p => p.relativeHumidity?.value ?? null),
            uv_index:                  periods.map(() => null),
          },
        });
      } catch (err) {
        if (err.name === 'AbortError') return res.status(502).json({ error: 'Weather service timed out — try again in a moment' });
        return res.status(502).json({ error: 'Upstream fetch failed', detail: err.message });
      } finally {
        clearTimeout(nwsTid);
      }
    }
    case 'hourly-forecast-twc':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `${TWC_BASE}/v3/wx/forecast/hourly/2day?geocode=${lat},${lon}&format=json&units=e&language=en-US&apiKey=${apiKey}`;
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
