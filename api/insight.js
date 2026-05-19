import Anthropic from '@anthropic-ai/sdk';

const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_SIZE = 500;

import { COMPASS_DIRS } from '../utils/compass.js';

function aqiCategory(v) {
  if (v == null) return 'unknown';
  if (v <= 50)  return 'Good';
  if (v <= 100) return 'Moderate';
  if (v <= 150) return 'Unhealthy for Sensitive Groups';
  if (v <= 200) return 'Unhealthy';
  return 'Very Unhealthy / Hazardous';
}

function windDirStr(deg) {
  return deg != null ? COMPASS_DIRS[Math.round(deg / 22.5) % 16] : 'variable';
}

function isOverloaded(err) {
  return err.status === 529 || err.message?.startsWith('529');
}

// ── Activity insight ──────────────────────────────────────────────────────────

function activityCacheKey(stationId, actId, score, c) {
  const t = Math.round((c?.temp ?? 70) / 2) * 2;
  const w = Math.round((c?.windSpeed ?? 0) / 2) * 2;
  const s = Math.round(score / 5) * 5;
  return `act|${stationId}|${actId}|${s}|${t}|${w}`;
}

async function handleActivityInsight(req, res) {
  const { activity, activityLabel, score, factors, current: c,
          firstRainyHour, lastRainyHour, stationId } = req.body ?? {};
  const key = activityCacheKey(stationId ?? 'unknown', activity, score, c);

  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.ts : Infinity;
  if (age >= 0 && age < CACHE_TTL_MS) {
    return res.status(200).json({ insight: hit.text });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Insight service not configured' });

  const topFactors = [...(factors ?? [])]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(f => `${f.name} (${f.score}/100)`)
    .join(', ');

  const feelsLikeLabel = (c?.feelsLike ?? c?.temp ?? 70) < (c?.temp ?? 70)
    ? 'wind chill' : 'heat index';

  const dir = windDirStr(c?.windDir);

  const forecastProb = c?.forecastMaxProb ?? 0;
  const forecastLine = forecastProb >= 20
    ? `${forecastProb}% chance of rain in today's forecast`
    : 'no rain expected today';
  const rainWindow = firstRainyHour != null
    ? `Rain window: ${firstRainyHour}:00–${lastRainyHour + 1}:00 (hours with ≥50% probability)`
    : 'Rain window: none expected';
  const pavementLine = c?.pavementTemp != null
    ? `\n- Pavement temp (direct sun): ~${c.pavementTemp}°F` : '';

  const prompt = `Activity: ${activityLabel} — Overall score: ${score}/100
Limiting factors: ${topFactors}
${rainWindow}

Conditions right now:
- ${c?.temp ?? '?'}°F, feels like ${c?.feelsLike ?? '?'}°F (${feelsLikeLabel}), dew point ${c?.dewPoint ?? '?'}°F
- Wind: ${c?.windSpeed ?? '?'} mph ${dir}, gusts to ${c?.windGust ?? '?'} mph
- Humidity: ${c?.humidity ?? '?'}%, UV ${c?.uv ?? '?'}, AQI ${c?.aqi ?? '?'} (${aqiCategory(c?.aqi)})
- Rain: ${c?.precipRate ?? 0}"/hr now, ${c?.precipTotal ?? 0}" today; ${forecastLine}${pavementLine}

In 2 sentences: assess conditions using the limiting factors and specific values. End with one actionable tip (timing, gear, or modification).`;

  const ACTIVITY_SYSTEM = 'You are a concise, practical weather advisor for YardObs, a personal backyard weather station app. You write for someone standing at their back door deciding whether to go outside. Be direct. Use the actual measured numbers. Never start with the activity name. Return exactly 2 plain sentences followed by one actionable tip — no bullets, headers, or sign-off phrases. Factor scores are 0–100 where higher = better conditions. Score guide: 80–100 = excellent, 60–79 = good, 40–59 = marginal, 20–39 = poor, 0–19 = very poor. If any single factor is below 25, treat it as the primary constraint and lead with it even if the overall score is moderate.';

  try {
    const client = new Anthropic({ apiKey, maxRetries: 3 });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 160,
      system: [{ type: 'text', text: ACTIVITY_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.text?.trim() ?? '';
    if (cache.size >= CACHE_MAX_SIZE) cache.delete(cache.keys().next().value);
    cache.set(key, { text, ts: Date.now() });
    return res.status(200).json({ insight: text });
  } catch (err) {
    const overloaded = isOverloaded(err);
    console.error(`[insight:activity] API error${overloaded ? ' (overloaded)' : ''}:`, err.message);
    if (overloaded) return res.status(200).json({ insight: 'Insight temporarily unavailable — API is busy. Try again in a moment.' });
    return res.status(502).json({ error: 'Insight service error' });
  }
}

// ── Daily backyard insight ────────────────────────────────────────────────────

const ALLOWED_ICONS = [
  'thermometer','wind','droplet','umbrella','snowflake','flame','sun',
  'alert-triangle','trending-up','trending-down','circle-check','cloud','leaf','gauge',
];

async function handleDailyInsight(req, res) {
  const { stationId, date, current: c, yoyReadings, forecastSummary } = req.body ?? {};
  const tempBucket    = Math.round((c?.temp ?? 70) / 2) * 2;
  const precipBucket  = Math.round((forecastSummary?.maxPrecipProb ?? 0) / 20) * 20;
  const key = `daily|${stationId}|${date}|${tempBucket}|${precipBucket}`;

  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.ts : Infinity;
  if (age >= 0 && age < CACHE_TTL_MS) {
    return res.status(200).json(hit.data);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Insight service not configured' });

  const dir = windDirStr(c?.windDir);

  const yoyDelta = (() => {
    const yoy = Array.isArray(yoyReadings) ? yoyReadings[0] : null;
    if (!yoy || c?.temp == null) return '';
    const avg = yoy.imperial?.tempAvg ?? yoy.imperial?.temp ?? null;
    if (avg == null) return '';
    const diff = Math.round(c.temp - avg);
    const precip = yoy.imperial?.precipTotal ?? 0;
    return diff !== 0
      ? `\nVs. last year same date: ${diff > 0 ? '+' : ''}${diff}°F on temp, ${precip}" precip.`
      : '\nSame date last year was nearly identical in temperature.';
  })();

  let forecastContext = '';
  if (forecastSummary?.totalForecastHours > 0) {
    const { maxPrecipProb, rainyHoursCount, totalForecastHours } = forecastSummary;
    forecastContext = `\n- Today's rain forecast: peak ${maxPrecipProb}% probability, ${rainyHoursCount} of ${totalForecastHours} forecast hours above 50% chance`;
  }

  const prompt = `Station: ${stationId} — ${date}

Right now:
- Temp: ${c?.temp ?? '?'}°F (feels ${c?.feelsLike ?? '?'}°F), humidity ${c?.humidity ?? '?'}%, dew point ${c?.dewPoint ?? '?'}°F
- Wind: ${c?.windSpeed ?? '?'} mph ${dir}, gusting ${c?.windGust ?? '?'} mph
- Pressure: ${c?.pressure ?? '?'} inHg
- UV index: ${c?.uv ?? '?'}, AQI ${c?.aqi ?? '?'} (${aqiCategory(c?.aqi)})
- Rain: ${c?.precipRate ?? 0}"/hr, ${c?.precipTotal ?? 0}" today${forecastContext}${yoyDelta}

Return:
{
  "narrative": "2-3 sentences. Lead with the most notable condition. ${yoyDelta ? 'Reference the year-over-year difference in the final sentence.' : 'No year-over-year data — omit any comparisons.'} Knowledgeable-neighbor tone, second person.",
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

  const DAILY_SYSTEM = 'You are a hyperlocal weather insight engine for YardObs. Return valid JSON only — no markdown fences, no preamble. Write in second person using actual measured values. Each tag must cover a distinct aspect of conditions — never repeat the same theme across tags.';

  try {
    const client = new Anthropic({ apiKey, maxRetries: 3 });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
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

    if (cache.size >= CACHE_MAX_SIZE) cache.delete(cache.keys().next().value);
    cache.set(key, { data, ts: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    const overloaded = isOverloaded(err);
    console.error(`[insight:daily] API error${overloaded ? ' (overloaded)' : ''}:`, err.message);
    if (overloaded) return res.status(200).json({ narrative: 'Insight temporarily unavailable — API is busy. Try again in a moment.', tags: [] });
    return res.status(502).json({ error: 'Insight service error' });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (req.body?.type === 'daily') return handleDailyInsight(req, res);
  return handleActivityInsight(req, res);
}
