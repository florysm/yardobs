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
import { clampBody } from './lib/sanitize.js';
import { degreesToCompass } from '../src/utils/format.js';
import { scoreGuide } from '../src/utils/insightVocab.js';
import { aqiLine, buildSystem } from './lib/insightPersona.js';
import { formatTemp, formatWind, formatPrecipRate, formatPrecipTotal, formatPressure, convertTemp, tempUnitLabel } from '../src/utils/units.js';

const MODEL = 'claude-haiku-4-5';

// No cache_control on the system prompts: Haiku 4.5's minimum cacheable prefix
// is 4096 tokens and these run a few hundred, so the markers never wrote an
// entry or produced a read.
function callModel({ apiKey, system, prompt, maxTokens, outputConfig }) {
  const client = new Anthropic({ apiKey, maxRetries: 3 });
  return client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
    ...(outputConfig ? { output_config: outputConfig } : {}),
  });
}

// A truncated response used to ship to the UI as though it were complete.
function textOf(msg, tag) {
  if (msg.stop_reason === 'max_tokens') {
    console.error(`[insight:${tag}] response truncated at max_tokens`);
  }
  return msg.content[0]?.text?.trim() ?? '';
}

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

function activityCacheKey(stationId, actId, score, c, period, outlook, bestWindow) {
  const t = Math.round((c?.temp ?? 70) / 2) * 2;
  const w = Math.round((c?.windSpeed ?? 0) / 2) * 2;
  const s = Math.round(score / 5) * 5;
  return `act|${stationId}|${actId}|${s}|${t}|${w}|${period ?? 'daytime'}|${outlook ?? 'none'}|${bestWindow ?? 'none'}`;
}

// "When should — or shouldn't — I go?" This is the only card that gives timing
// advice; Forecast describes the day and Backyard describes the moment.
const ACTIVITY_JOB = 'Your job on this card is to answer "when should — or shouldn\'t — I do this today?" '
  + 'The score and limiting factors describe conditions right now. Say whether now is a good time and why, using the limiting factors and their values; '
  + 'then use the rest-of-today outlook and the best window to say whether waiting would help or whether to skip it today. '
  + 'Only recommend a time that appears in the outlook or the best window. '
  + `Factor scores are 0–100 where higher = better conditions. Score guide: ${scoreGuide()}. `
  + 'If any single factor is below 25, treat it as the primary constraint and lead with it even if the overall score is moderate. '
  + 'Write exactly 2 sentences, then one short actionable tip (timing, gear, or a modification).';

const ACTIVITY_EXAMPLES = [
  'Gusts to 24 mph are what\'s holding a run back right now, even with a comfortable 58°. The wind settles through the afternoon and the best stretch is 3–6 PM, still dry. Tip: wait until after 3 and take the loop with the tailwind home.',
  'It\'s a good time to fire up the grill — 71° with a light breeze and clean air. Rain is likely after 8p, so this is the window. Tip: start now and plan to be wrapped up by 7.',
];

async function handleActivityInsight(req, res) {
  const { activity, activityLabel, score, factors, current: c,
          outlook, bestWindow, stationId, sourceType, period } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === 'forecast_model';
  const key = `${units}|${isPreview ? 'preview|' : ''}` + activityCacheKey(stationId ?? 'unknown', activity, score, c, period, outlook, bestWindow);

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

  const pavementLine = c?.pavementTemp != null
    ? `\n- Pavement temp (direct sun): ~${formatTemp(c.pavementTemp, units)}` : '';

  // Preview mode has a measured rain rate from Open-Meteo but no daily accumulation.
  const rainNow = `Raining now: ${formatPrecipRate(c?.precipRate ?? 0, units)}`;
  const rainLine = isPreview
    ? rainNow
    : `${rainNow}, ${formatPrecipTotal(c?.precipTotal ?? 0, units)} total today`;

  const outlookLine = outlook
    ? `Rest of today by part of day (${tempUnitLabel(units)}): ${outlook}`
    : 'Rest of today: no hourly forecast available — do not suggest a later time.';
  const windowLine = `Best window left today (by score): ${bestWindow ? bestWindow.replace('Peak ', '') : 'none — fewer than 3 daytime hours remain'}`;

  const prompt = `Time of day: ${period ?? 'unknown'}
Activity: ${activityLabel} — Score right now: ${score}/100
Limiting factors: ${topFactors}

Conditions right now:
- ${formatTemp(c?.temp, units)}, feels like ${formatTemp(c?.feelsLike, units)} (${feelsLikeLabel}), dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusts to ${formatWind(c?.windGust, units)}
- Humidity: ${c?.humidity ?? '?'}%, UV ${c?.uv ?? '?'}, ${aqiLine(c?.aqi)}
- ${rainLine}${pavementLine}

${outlookLine}
${windowLine}`;

  const system = buildSystem({ isPreview, job: ACTIVITY_JOB, examples: ACTIVITY_EXAMPLES });

  try {
    // 160 was tight for two sentences plus a tip, and truncation was silent.
    const msg = await callModel({ apiKey, system, prompt, maxTokens: 250 });
    const text = textOf(msg, 'activity');
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

// Enforced by the API rather than asked for in prose. Previously the response was
// stripped of markdown fences with a regex and JSON.parse'd in a try/catch that
// fell back to an empty narrative, so a malformed reply rendered as a blank card
// with no signal that anything had gone wrong.
const DAILY_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string' },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          type:  { type: 'string', enum: ['positive', 'caution', 'neutral'] },
          icon:  { type: 'string', enum: ALLOWED_ICONS },
        },
        required: ['label', 'type', 'icon'],
        additionalProperties: false,
      },
    },
  },
  required: ['narrative', 'tags'],
  additionalProperties: false,
};

// "What's it doing right now?" — what you'd feel stepping out the back door.
// It looks ahead only a few hours; the rest of the day is the Forecast card's.
const DAILY_JOB = 'Your job on this card is to answer "what\'s it doing right now?" — what the reader would feel stepping out the back door. '
  + 'Lead with the most notable current condition. Mention the next few hours only if the data shows a change in them, and never describe later in the day. '
  + 'Use type=caution on a tag only when a value is genuinely limiting or hazardous. Each tag covers a distinct aspect of conditions — never repeat a theme across tags.';

const DAILY_EXAMPLES = [
  'It\'s a raw 47° with a north wind that makes it feel closer to 41. Skies are dry for now, but rain is likely within the next couple of hours.',
  'A calm, comfortable 68° out back with clean air and barely a breeze. Nothing much changes over the next few hours.',
];

async function handleDailyInsight(req, res) {
  const { stationId, date, current: c, yoyReadings, lookahead, sourceType, period } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === 'forecast_model';
  const tempBucket = Math.round((c?.temp ?? 70) / 2) * 2;
  const key = `${units}|${isPreview ? 'preview|' : ''}daily|${stationId}|${date}|${tempBucket}|${period ?? 'unknown'}|${lookahead ?? 'steady'}`;

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

  // Preview mode has a measured rain rate but no daily accumulation.
  const rainLine = isPreview
    ? `\n- Raining now: ${formatPrecipRate(c?.precipRate ?? 0, units)}`
    : `\n- Raining now: ${formatPrecipRate(c?.precipRate ?? 0, units)}, ${formatPrecipTotal(c?.precipTotal ?? 0, units)} total today`;

  const lookaheadLine = `\n\nNext 3 hours: ${lookahead ?? 'no notable change'}`;

  const locationLabel = isPreview ? 'Location' : 'Station';
  const yoyInstruction = isPreview
    ? 'No year-over-year data available — omit any comparisons.'
    : (yoyDelta ? 'Reference the year-over-year difference in the final sentence.' : 'No year-over-year data — omit any comparisons.');

  const prompt = `${locationLabel}: ${stationId} — ${date}
Time of day: ${period ?? 'unknown'}

Right now:
- Temp: ${formatTemp(c?.temp, units)} (feels ${formatTemp(c?.feelsLike, units)}), humidity ${c?.humidity ?? '?'}%, dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusting ${formatWind(c?.windGust, units)}
- Pressure: ${formatPressure(c?.pressure, units)}
- UV index: ${c?.uv ?? '?'}, ${aqiLine(c?.aqi)}${rainLine}${lookaheadLine}${yoyDelta}

narrative: 2-3 sentences. ${yoyInstruction}
tags: exactly 3-4, each label 2-3 words, each covering a different aspect (e.g. temperature, precipitation, wind, air quality).`;

  const system = buildSystem({ isPreview, job: DAILY_JOB, examples: DAILY_EXAMPLES });

  try {
    const msg = await callModel({
      apiKey, system, prompt, maxTokens: 400,
      outputConfig: { format: { type: 'json_schema', schema: DAILY_SCHEMA } },
    });

    // The schema guarantees shape; a truncated response is the one way this can
    // still fail to parse, and textOf logs that case.
    let data = { narrative: '', tags: [] };
    try {
      data = JSON.parse(textOf(msg, 'daily') || '{}');
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

// "What will the day do?" Describes; never plans. For today it covers only
// what's still ahead — current conditions are the Backyard card's job, and
// timing advice is the Activity card's ("plan indoor activities for the
// evening" over an 11pm shower was this card overreaching).
function forecastJob(isToday) {
  const scope = isToday
    ? 'This is the rest of today, starting now: cover only what is still ahead and do not describe current conditions. '
    : '';
  return 'Your job on this card is to answer "what will the day do?" '
    + scope
    + 'Walk through how it unfolds using the outlook, which is already split into parts of the day; attach each condition to the part it is listed under. '
    + 'Describe rather than plan: leave activity and timing advice to the reader, beyond a word about gear such as an umbrella or a jacket. '
    // Pleasant temperatures alone once earned "a great day to be outside" while the air was Unhealthy.
    + 'Air quality is part of whether a day is pleasant outdoors; if it is worse than Moderate, it is the most notable condition and must lead. '
    + 'If no outlook is provided, describe the day in general terms and do not attach temperatures or rain to times of day. '
    + 'Write 2–3 sentences.';
}

const FORECAST_EXAMPLES = [
  'The afternoon stays dry and tops out in the mid 60s before the evening cools into the upper 50s. Rain becomes likely after 11p, so keep an umbrella handy if you\'re out late.',
  'A chilly start in the 40s gives way to a pleasant, sunny afternoon near 62. It stays dry from start to finish, and the air is clean.',
];

async function handleForecastDayInsight(req, res) {
  const { stationId, date, dayLabel, tempMax, tempMin, pop, conditions,
          outlook, isToday, dayPart, aqi, sourceType } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === 'forecast_model';

  // Today is keyed to the part of the day so it regenerates as each passes;
  // the outlook string carries the forecast itself, so a revision changes it.
  const hiBucket = Math.round((tempMax ?? 70) / 2) * 2;
  const loBucket = Math.round((tempMin ?? 50) / 2) * 2;
  const popBucket = Math.round((pop ?? 0) / 20) * 20;
  // Bucketed at 25 so a crossing between EPA categories always changes the key.
  const aqiBucket = aqi == null ? 'na' : Math.round(aqi / 25) * 25;
  const part = isToday ? (dayPart ?? 'today') : 'day';
  const key = `${units}|${isPreview ? 'preview|' : ''}fcday|${stationId ?? 'preview'}|${date}|${part}|${hiBucket}|${loBucket}|${popBucket}|${aqiBucket}|${outlook ?? 'none'}`;

  const hit = getCacheHit(key);
  if (hit) return res.status(200).json({ narrative: hit.text });

  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  // Today's high may already be behind us, and the outlook says what's left.
  const dayLine = isToday && outlook
    ? `Day: Today — the rest of the day, from ${dayPart ?? 'now'}`
    : `Day: ${dayLabel ?? date}\nForecast: high ${formatTemp(tempMax, units)} / low ${formatTemp(tempMin, units)}`;
  const outlookLine = outlook
    ? `Outlook by part of day (${tempUnitLabel(units)}): ${outlook}`
    : `Outlook: no hourly detail for this day — peak rain chance ${pop ?? 0}%. Do not attach temperatures or rain to times of day.`;
  // Without this the model recommended an "ideal day to spend time outside" on a
  // day whose air was Unhealthy — it simply had no air-quality data to weigh.
  const aqiLineText = aqi != null
    ? `Air quality, worst of the 8a–8p stretch: ${aqiLine(aqi)}`
    : 'Air quality: no forecast available for this day — do not comment on air quality.';

  const prompt = `${dayLine}
Conditions: ${conditions || 'not specified'}
${outlookLine}
${aqiLineText}`;

  const system = buildSystem({ isPreview, job: forecastJob(!!isToday), examples: FORECAST_EXAMPLES });

  try {
    const msg = await callModel({ apiKey, system, prompt, maxTokens: 250 });
    const text = textOf(msg, 'forecast-day');
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

  req.body = clampBody(req.body);

  if (req.body?.type === 'daily')        return handleDailyInsight(req, res);
  if (req.body?.type === 'forecast-day') return handleForecastDayInsight(req, res);
  return handleActivityInsight(req, res);
}
