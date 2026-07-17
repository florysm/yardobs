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
import { degreesToCompass, aqiCategory } from '../src/utils/format.js';
import { aqiPhrase, scoreGuide, dayPartGuide, dayPartRange, shortHour } from '../src/utils/insightVocab.js';
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

// Shared by every prompt that names a time of day. The glossary is rendered from
// the same table the code uses (dayPartGuide), and the explicit prohibition is
// there because it is the exact mistake observed: "thunderstorms Sunday morning
// between midnight and 3 a.m." — technically a.m., but nobody says that.
function timeNamingRules() {
  return `Name times of day the way people speak: ${dayPartGuide()}. `
    + 'Never call the hours just after midnight "morning" — 1 a.m. is overnight. '
    + 'When a period is already named for you, use that name rather than inventing your own.';
}

// Hands the model the exact wording to use for an AQI reading. Two independent
// calls previously described the same AQI 86 as "solid" and "decent"; worse, the
// score guide told them 86/100 was "excellent" when EPA calls it Moderate.
function aqiLine(aqi) {
  const category = aqiCategory(aqi) ?? 'unknown';
  const phrase = aqiPhrase(aqi);
  const guidance = phrase
    ? ` — describe this as "${phrase}"; do not characterize it more favorably`
    : '';
  return `AQI ${aqi ?? '?'} (${category})${guidance}`;
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
  // Named rather than emitted as raw 24-hour clock time ("0:00–3:00"), which
  // invites the same midnight-is-morning slip as the forecast-day prompt.
  const rainWindow = firstRainyHour != null
    ? `Rain window: ${dayPartRange(firstRainyHour, lastRainyHour)} (${shortHour(firstRainyHour)}–${shortHour(lastRainyHour + 1)}, hours with ≥50% probability)`
    : 'Rain window: none expected';
  const pavementLine = c?.pavementTemp != null
    ? `\n- Pavement temp (direct sun): ~${formatTemp(c.pavementTemp, units)}` : '';

  // Preview mode has a measured rain rate from Open-Meteo but no daily accumulation.
  const rainNow = `Raining now: ${formatPrecipRate(c?.precipRate ?? 0, units)}`;
  const rainLine = isPreview
    ? `${rainNow}; ${forecastLine}`
    : `${rainNow}, ${formatPrecipTotal(c?.precipTotal ?? 0, units)} total today; ${forecastLine}`;

  const prompt = `Time of day: ${period ?? 'daytime'}
Activity: ${activityLabel} — Overall score: ${score}/100
Limiting factors: ${topFactors}
${rainWindow}

Conditions right now:
- ${formatTemp(c?.temp, units)}, feels like ${formatTemp(c?.feelsLike, units)} (${feelsLikeLabel}), dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusts to ${formatWind(c?.windGust, units)}
- Humidity: ${c?.humidity ?? '?'}%, UV ${c?.uv ?? '?'}, ${aqiLine(c?.aqi)}
- ${rainLine}${pavementLine}

In 2 sentences: assess conditions using the limiting factors and specific values. End with one actionable tip (timing, gear, or modification).`;

  // Score guide is generated from the same thresholds the UI renders (scoreBand),
  // so the model and the card can't describe the same number differently.
  const SHARED_RULES = `Be direct. Never start with the activity name. Return exactly 2 plain sentences followed by one actionable tip — no bullets, headers, or sign-off phrases. Factor scores are 0–100 where higher = better conditions. Score guide: ${scoreGuide()}. If any single factor is below 25, treat it as the primary constraint and lead with it even if the overall score is moderate. The rain figure is what is falling right now; a rain window later in the day is a risk to plan around, not a present condition. Where a characterization is prescribed for a value, use it verbatim rather than a more flattering synonym. ${timeNamingRules()}`;
  const ACTIVITY_SYSTEM = isPreview
    ? `You are a concise, practical weather advisor for YardObs. Help someone decide whether conditions are right for outdoor activities using city-level forecast data. Use actual forecast values. ${SHARED_RULES}`
    : `You are a concise, practical weather advisor for YardObs, a personal backyard weather station app. You write for someone standing at their back door deciding whether to go outside. Use the actual measured numbers. ${SHARED_RULES}`;

  try {
    // 160 was tight for two sentences plus a tip, and truncation was silent.
    const msg = await callModel({ apiKey, system: ACTIVITY_SYSTEM, prompt, maxTokens: 250 });
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

  // Preview mode has a measured rain rate but no daily accumulation.
  const rainLine = isPreview
    ? `\n- Raining now: ${formatPrecipRate(c?.precipRate ?? 0, units)}`
    : `\n- Raining now: ${formatPrecipRate(c?.precipRate ?? 0, units)}, ${formatPrecipTotal(c?.precipTotal ?? 0, units)} total today`;

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
- UV index: ${c?.uv ?? '?'}, ${aqiLine(c?.aqi)}${rainLine}${forecastContext}${yoyDelta}

narrative: 2-3 sentences. Lead with the most notable condition. ${yoyInstruction} Knowledgeable-neighbor tone, second person.
tags: exactly 3-4, each label 2-3 words. Each tag covers a different aspect — e.g. temperature, precipitation, wind, air quality — and no two convey the same theme. Use type=caution only when a value is genuinely limiting or hazardous.`;

  const DAILY_RULES = 'Each tag must cover a distinct aspect of conditions — never repeat the same theme across tags. The rain figure is what is falling right now; a rain forecast later in the day is a risk to plan around, not a present condition. Where a characterization is prescribed for a value, use it verbatim rather than a more flattering synonym. '
    + timeNamingRules();
  const DAILY_SYSTEM = isPreview
    ? `You are a weather insight engine for YardObs. Write in second person using forecast values for the area. ${DAILY_RULES}`
    : `You are a hyperlocal weather insight engine for YardObs. Write in second person using actual measured values. ${DAILY_RULES}`;

  try {
    const msg = await callModel({
      apiKey, system: DAILY_SYSTEM, prompt, maxTokens: 400,
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

async function handleForecastDayInsight(req, res) {
  const { stationId, date, dayLabel, tempMax, tempMin, pop, conditions,
          trajectory, precipWindow, aqi, sourceType } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === 'forecast_model';

  // The key was previously just the date, so a day's narrative was frozen for the
  // full TTL regardless of forecast revisions. Bucket on the values that shape the
  // text — including the trajectory, or two different curves would collide.
  const hiBucket = Math.round((tempMax ?? 70) / 2) * 2;
  const loBucket = Math.round((tempMin ?? 50) / 2) * 2;
  const popBucket = Math.round((pop ?? 0) / 20) * 20;
  // Bucketed at 25 so a crossing between EPA categories always changes the key.
  const aqiBucket = aqi == null ? 'na' : Math.round(aqi / 25) * 25;
  const key = `${units}|${isPreview ? 'preview|' : ''}fcday|${stationId ?? 'preview'}|${date}|${hiBucket}|${loBucket}|${popBucket}|${aqiBucket}|${trajectory ?? 'none'}`;

  const hit = getCacheHit(key);
  if (hit) return res.status(200).json({ narrative: hit.text });

  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  // Two rules earn their place here. The anti-fabrication one: given only a
  // high/low the model infers a diurnal shape and asserts "temperatures drop to
  // 61 as evening approaches" on a day still in the 80s at 10pm. The naming one:
  // it reads 12a–3a as a.m. and calls it "morning".
  const SYSTEM = 'You are a concise weather outlook writer for YardObs. Write in second person. Given a daily forecast, write 2–3 sentences describing what the day will feel like and what to expect. Lead with the most notable condition. Be practical and specific. No bullets, headers, or sign-off phrases. Return only the narrative text. Only state a temperature at a specific time of day if the hourly trajectory shows it — never infer one from the high and low. The daily low typically occurs near dawn, not in the evening. If no hourly trajectory is provided, describe the day in general terms and do not attach temperatures to times of day. '
    // Pleasant temperatures are not sufficient grounds for "a great day to be
    // outside" — this prompt recommended exactly that while the air was Unhealthy.
    + 'Air quality is part of whether a day is good to be outdoors: never recommend spending time outside without accounting for it. If air quality is worse than Moderate, it is the most notable condition and must lead. '
    + timeNamingRules();

  const trajectoryLine = trajectory
    ? `Hourly temperatures (${tempUnitLabel(units)}): ${trajectory}`
    : 'Hourly temperatures: not available for this day — do not state temperatures at specific times.';
  // A trajectory but no window means we checked every hour and found none likely —
  // that's "dry", not "unknown". Only plead ignorance when hourly data is missing.
  const precipLine = precipWindow
    ? `Rain likely ${precipWindow}`
    : trajectory
      ? `No rain expected — peak chance ${pop ?? 0}%`
      : `Peak rain chance: ${pop ?? 0}% (no hourly timing available)`;
  // Without this the model recommended an "ideal day to spend time outside" on a
  // day whose air was Unhealthy — it simply had no air-quality data to weigh.
  const aqiLineText = aqi != null
    ? `Air quality, worst of the 8a–8p stretch: ${aqiLine(aqi)}`
    : 'Air quality: no forecast available for this day — do not comment on air quality.';

  const prompt = `Day: ${dayLabel ?? date}
Forecast: high ${formatTemp(tempMax, units)} / low ${formatTemp(tempMin, units)}
Conditions: ${conditions || 'not specified'}
${trajectoryLine}
${precipLine}
${aqiLineText}

Write 2–3 sentences describing this forecast day.`;

  try {
    const msg = await callModel({ apiKey, system: SYSTEM, prompt, maxTokens: 250 });
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
