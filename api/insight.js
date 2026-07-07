import Anthropic from '@anthropic-ai/sdk';

const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_SIZE = 500;

// Per-IP rate limiter — max 20 calls per TTL window per IP
const ipLog = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const window = ipLog.get(ip) ?? [];
  const recent = window.filter(ts => now - ts < CACHE_TTL_MS);
  if (recent.length >= 20) {
    ipLog.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipLog.set(ip, recent);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipLog) {
    if (!timestamps.some(ts => now - ts < CACHE_TTL_MS)) ipLog.delete(ip);
  }
  for (const [k, v] of cache) {
    if (now - v.ts >= CACHE_TTL_MS) cache.delete(k);
  }
}, CACHE_TTL_MS);

function evictOne() {
  const now = Date.now();
  let evictKey = null;
  let oldestTs = Infinity;
  for (const [k, v] of cache) {
    if (now - v.ts >= CACHE_TTL_MS) { evictKey = k; break; }
    if (v.ts < oldestTs) { oldestTs = v.ts; evictKey = k; }
  }
  if (evictKey !== null) cache.delete(evictKey);
}

import { applyCors } from './lib/cors.js';
import { degreesToCompass, aqiCategory } from '../src/utils/format.js';
import { formatTemp, formatWind, formatPrecipRate, formatPrecipTotal, formatPressure, convertTemp, tempUnitLabel } from '../src/utils/units.js';

function resolveUnits(body) {
  return body?.units === 'metric' ? 'metric' : 'imperial';
}

function isOverloaded(err) {
  return err.status === 529 || err.message?.startsWith('529');
}

function getCacheHit(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  return (Date.now() - hit.ts) < CACHE_TTL_MS ? hit : null;
}

function requireApiKey(res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'Insight service not configured' }); return null; }
  return apiKey;
}

function handleInsightError(res, err, tag, overloadedPayload) {
  const overloaded = isOverloaded(err);
  console.error(`[insight:${tag}] API error${overloaded ? ' (overloaded)' : ''}:`, err.message);
  if (overloaded) return res.status(200).json(overloadedPayload);
  return res.status(502).json({ error: 'Insight service error' });
}

// ── Activity insight ──────────────────────────────────────────────────────────

function activityCacheKey(stationId, actId, score, c, period) {
  const t = Math.round((c?.temp ?? 70) / 2) * 2;
  const w = Math.round((c?.windSpeed ?? 0) / 2) * 2;
  const s = Math.round(score / 5) * 5;
  return `act|${stationId}|${actId}|${s}|${t}|${w}|${period ?? 'daytime'}`;
}

async function handleActivityInsight(req, res) {
  const { activity, activityLabel, score, factors, current: c,
          firstRainyHour, lastRainyHour, stationId, sourceType, period } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === 'forecast_model';
  const key = `${units}|${isPreview ? 'preview|' : ''}` + activityCacheKey(stationId ?? 'unknown', activity, score, c, period);

  const hit = getCacheHit(key);
  if (hit) return res.status(200).json({ insight: hit.text });

  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const topFactors = [...(factors ?? [])]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(f => `${f.name} (${f.score}/100)`)
    .join(', ');

  const feelsLikeLabel = (c?.feelsLike ?? c?.temp ?? 70) < (c?.temp ?? 70)
    ? 'wind chill' : 'heat index';

  const dir = degreesToCompass(c?.windDir) || 'variable';

  const forecastProb = c?.forecastMaxProb ?? 0;
  const forecastLine = forecastProb >= 20
    ? `${forecastProb}% chance of rain in today's forecast`
    : 'no rain expected today';
  const rainWindow = firstRainyHour != null
    ? `Rain window: ${firstRainyHour}:00–${lastRainyHour + 1}:00 (hours with ≥50% probability)`
    : 'Rain window: none expected';
  const pavementLine = c?.pavementTemp != null
    ? `\n- Pavement temp (direct sun): ~${formatTemp(c.pavementTemp, units)}` : '';

  // Preview mode omits actual rain rate/total since Open-Meteo doesn't provide them
  const rainLine = isPreview
    ? `Forecast rain risk: ${forecastLine}`
    : `Rain: ${formatPrecipRate(c?.precipRate ?? 0, units)} now, ${formatPrecipTotal(c?.precipTotal ?? 0, units)} today; ${forecastLine}`;

  const prompt = `Time of day: ${period ?? 'daytime'}
Activity: ${activityLabel} — Overall score: ${score}/100
Limiting factors: ${topFactors}
${rainWindow}

Conditions right now:
- ${formatTemp(c?.temp, units)}, feels like ${formatTemp(c?.feelsLike, units)} (${feelsLikeLabel}), dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusts to ${formatWind(c?.windGust, units)}
- Humidity: ${c?.humidity ?? '?'}%, UV ${c?.uv ?? '?'}, AQI ${c?.aqi ?? '?'} (${aqiCategory(c?.aqi) ?? 'unknown'})
- ${rainLine}${pavementLine}

In 2 sentences: assess conditions using the limiting factors and specific values. End with one actionable tip (timing, gear, or modification).`;

  const ACTIVITY_SYSTEM_STATION = 'You are a concise, practical weather advisor for YardObs, a personal backyard weather station app. You write for someone standing at their back door deciding whether to go outside. Be direct. Use the actual measured numbers. Never start with the activity name. Return exactly 2 plain sentences followed by one actionable tip — no bullets, headers, or sign-off phrases. Factor scores are 0–100 where higher = better conditions. Score guide: 80–100 = excellent, 60–79 = good, 40–59 = marginal, 20–39 = poor, 0–19 = very poor. If any single factor is below 25, treat it as the primary constraint and lead with it even if the overall score is moderate.';
  const ACTIVITY_SYSTEM_PREVIEW = 'You are a concise, practical weather advisor for YardObs. Help someone decide whether conditions are right for outdoor activities using city-level forecast data. Be direct. Use actual forecast values. Never start with the activity name. Return exactly 2 plain sentences followed by one actionable tip — no bullets, headers, or sign-off phrases. Factor scores are 0–100 where higher = better conditions. Score guide: 80–100 = excellent, 60–79 = good, 40–59 = marginal, 20–39 = poor, 0–19 = very poor. If any single factor is below 25, treat it as the primary constraint and lead with it even if the overall score is moderate.';
  const ACTIVITY_SYSTEM = isPreview ? ACTIVITY_SYSTEM_PREVIEW : ACTIVITY_SYSTEM_STATION;

  try {
    const client = new Anthropic({ apiKey, maxRetries: 3 });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 160,
      system: [{ type: 'text', text: ACTIVITY_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.text?.trim() ?? '';
    if (cache.size >= CACHE_MAX_SIZE) evictOne();
    cache.set(key, { text, ts: Date.now() });
    return res.status(200).json({ insight: text });
  } catch (err) {
    return handleInsightError(res, err, 'activity', { insight: 'Insight temporarily unavailable — API is busy. Try again in a moment.' });
  }
}

// ── Daily backyard insight ────────────────────────────────────────────────────

const ALLOWED_ICONS = [
  'thermometer','wind','droplet','umbrella','snowflake','flame','sun',
  'alert-triangle','trending-up','trending-down','circle-check','cloud','leaf','gauge',
];

async function handleDailyInsight(req, res) {
  const { stationId, date, current: c, yoyReadings, forecastSummary, sourceType, period } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === 'forecast_model';
  const tempBucket    = Math.round((c?.temp ?? 70) / 2) * 2;
  const precipBucket  = Math.round((forecastSummary?.maxPrecipProb ?? 0) / 20) * 20;
  const key = `${units}|${isPreview ? 'preview|' : ''}daily|${stationId}|${date}|${tempBucket}|${precipBucket}|${period ?? 'morning'}`;

  const hit = getCacheHit(key);
  if (hit) return res.status(200).json(hit.data);

  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const dir = degreesToCompass(c?.windDir) || 'variable';

  // No year-over-year data in preview mode (no historical data available)
  const yoyDelta = (() => {
    if (isPreview) return '';
    const yoy = Array.isArray(yoyReadings) ? yoyReadings[0] : null;
    if (!yoy || c?.temp == null) return '';
    const avg = yoy.imperial?.tempAvg ?? yoy.imperial?.temp ?? null;
    if (avg == null) return '';
    const diff = Math.round(convertTemp(c.temp, units) - convertTemp(avg, units));
    const precip = yoy.imperial?.precipTotal ?? 0;
    return diff !== 0
      ? `\nVs. last year same date: ${diff > 0 ? '+' : ''}${diff}${tempUnitLabel(units)} on temp, ${formatPrecipTotal(precip, units)} precip.`
      : '\nSame date last year was nearly identical in temperature.';
  })();

  let forecastContext = '';
  if (forecastSummary?.totalForecastHours > 0) {
    const { maxPrecipProb, rainyHoursCount, totalForecastHours } = forecastSummary;
    forecastContext = `\n- Today's rain forecast: peak ${maxPrecipProb}% probability, ${rainyHoursCount} of ${totalForecastHours} forecast hours above 50% chance`;
  }

  // Preview mode: no rain rate/total; use forecast context only
  const rainLine = isPreview
    ? (forecastContext ? '' : '\n- No rain expected today')
    : `\n- Rain: ${formatPrecipRate(c?.precipRate ?? 0, units)}, ${formatPrecipTotal(c?.precipTotal ?? 0, units)} today`;

  const locationLabel = isPreview ? 'Location' : 'Station';
  const yoyInstruction = isPreview
    ? 'No year-over-year data available — omit any comparisons.'
    : (yoyDelta ? 'Reference the year-over-year difference in the final sentence.' : 'No year-over-year data — omit any comparisons.');

  const prompt = `${locationLabel}: ${stationId} — ${date}
Time of day: ${period ?? 'daytime'}

Right now:
- Temp: ${formatTemp(c?.temp, units)} (feels ${formatTemp(c?.feelsLike, units)}), humidity ${c?.humidity ?? '?'}%, dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusting ${formatWind(c?.windGust, units)}
- Pressure: ${formatPressure(c?.pressure, units)}
- UV index: ${c?.uv ?? '?'}, AQI ${c?.aqi ?? '?'} (${aqiCategory(c?.aqi) ?? 'unknown'})${rainLine}${forecastContext}${yoyDelta}

Return:
{
  "narrative": "2-3 sentences. Lead with the most notable condition. ${yoyInstruction} Knowledgeable-neighbor tone, second person.",
  "tags": [
    { "label": "2-3 words", "type": "positive|caution|neutral", "icon": "one of: ${ALLOWED_ICONS.join('|')}" }
  ]
}

Rules for tags:
- Exactly 3-4 tags
- Each tag covers a different aspect: e.g. temperature, precipitation, wind, air quality
- No two tags should convey the same theme
- type=caution only when a value is genuinely limiting or hazardous
Return only the JSON object, no markdown, no other text.`;

  const DAILY_SYSTEM_STATION = 'You are a hyperlocal weather insight engine for YardObs. Return valid JSON only — no markdown fences, no preamble. Write in second person using actual measured values. Each tag must cover a distinct aspect of conditions — never repeat the same theme across tags.';
  const DAILY_SYSTEM_PREVIEW = 'You are a weather insight engine for YardObs. Return valid JSON only — no markdown fences, no preamble. Write in second person using forecast values for the area. Each tag must cover a distinct aspect of conditions — never repeat the same theme across tags.';
  const DAILY_SYSTEM = isPreview ? DAILY_SYSTEM_PREVIEW : DAILY_SYSTEM_STATION;

  try {
    const client = new Anthropic({ apiKey, maxRetries: 3 });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: [{ type: 'text', text: DAILY_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });

    let data = { narrative: '', tags: [] };
    try {
      const raw = msg.content[0]?.text?.trim() ?? '{}';
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      data = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[insight:daily] JSON parse error:', parseErr.message);
    }

    if (cache.size >= CACHE_MAX_SIZE) evictOne();
    cache.set(key, { data, ts: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    return handleInsightError(res, err, 'daily', { narrative: 'Insight temporarily unavailable — API is busy. Try again in a moment.', tags: [] });
  }
}

// ── Forecast-day insight ──────────────────────────────────────────────────────

async function handleForecastDayInsight(req, res) {
  const { stationId, date, dayLabel, tempMax, tempMin, pop, icon } = req.body ?? {};
  const units = resolveUnits(req.body);
  const key = `${units}|fcday|${stationId ?? 'preview'}|${date}`;

  const hit = getCacheHit(key);
  if (hit) return res.status(200).json({ narrative: hit.text });

  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  const SYSTEM = 'You are a concise weather outlook writer for YardObs. Write in second person. Given a daily forecast summary, write 2–3 sentences describing what the day will feel like and what to expect. Lead with the most notable condition. Be practical and specific. No bullets, headers, or sign-off phrases. Return only the narrative text.';

  const prompt = `Day: ${dayLabel ?? date}
Forecast: high ${formatTemp(tempMax, units)} / low ${formatTemp(tempMin, units)}
Conditions: ${icon ?? ''}
Precipitation chance: ${pop ?? 0}%

Write 2–3 sentences describing this forecast day.`;

  try {
    const client = new Anthropic({ apiKey, maxRetries: 3 });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 180,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.text?.trim() ?? '';
    if (cache.size >= CACHE_MAX_SIZE) evictOne();
    cache.set(key, { text, ts: Date.now() });
    return res.status(200).json({ narrative: text });
  } catch (err) {
    return handleInsightError(res, err, 'forecast-day', { narrative: 'Insight temporarily unavailable — API is busy. Try again in a moment.' });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });

  if (req.body?.type === 'daily')        return handleDailyInsight(req, res);
  if (req.body?.type === 'forecast-day') return handleForecastDayInsight(req, res);
  return handleActivityInsight(req, res);
}
