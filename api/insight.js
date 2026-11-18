import Anthropic from '@anthropic-ai/sdk';

const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_SIZE = 500;

// Per IP: 20 calls per cache TTL (15 min). See api/lib/rateLimit.js.
const rateLimiter = createRateLimiter({ limit: 20, windowMs: CACHE_TTL_MS });

// Age-based freshness. A negative age (the host clock jumped backward) counts as
// expired; otherwise such an entry would pass the check forever.
function isFresh(ts, now = Date.now()) {
  const age = now - ts;
  return age >= 0 && age < CACHE_TTL_MS;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (!isFresh(v.ts, now)) cache.delete(k);
  }
}, CACHE_TTL_MS);

function evictOne() {
  const now = Date.now();
  let evictKey = null;
  let oldestTs = Infinity;
  for (const [k, v] of cache) {
    if (!isFresh(v.ts, now)) { evictKey = k; break; }
    if (v.ts < oldestTs) { oldestTs = v.ts; evictKey = k; }
  }
  if (evictKey !== null) cache.delete(evictKey);
}

import { applyCors } from './lib/cors.js';
import { clientIp, createRateLimiter } from './lib/rateLimit.js';
import { SOURCE_TYPES } from '../src/utils/sourceTypes.js';
import { clampBody } from './lib/sanitize.js';
import { degreesToCompass } from '../src/utils/format.js';
import { scoreBand, AQI_WINDOW_LABEL } from '../src/utils/insightVocab.js';
import { aqiLine, buildSystem } from './lib/insightPersona.js';
import { formatTemp, formatWind, formatPrecipRate, formatPrecipTotal, formatPressure, convertTemp, tempUnitLabel } from '../src/utils/units.js';

const MODEL = 'claude-haiku-5-5';

// Short narratives over data already summarized in code: thinking buys nothing
// here and its tokens count toward max_tokens, so it's off (Haiku 5.5 accepts
// disabled thinking at effort low/medium/high only).
//
// No cache_control: the system prompts sit near Haiku 5.5's 512-token minimum
// and traffic is light, so 5-minute cache writes would rarely be read back — at
// $0.10/MTok input it isn't worth the complexity.
function callModel({ apiKey, system, prompt, maxTokens, outputConfig }) {
  const client = new Anthropic({ apiKey, maxRetries: 3 });
  return client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'disabled' },
    // Merged, not replaced: the daily card adds its JSON schema `format` here.
    output_config: { effort: 'low', ...outputConfig },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
}

// A truncated response used to ship to the UI as though it were complete.
// Read the text block by type: content[0] isn't guaranteed to be text.
function textOf(msg, tag) {
  if (msg.stop_reason === 'max_tokens') {
    console.error(`[insight:${tag}] response truncated at max_tokens`);
  }
  // Haiku 5.5 runs safety classifiers with no server-side fallback; a false
  // positive on a weather summary should degrade to "unavailable", not junk.
  if (msg.stop_reason === 'refusal') {
    console.error(`[insight:${tag}] refusal`, msg.stop_details?.category ?? '');
    return '';
  }
  return msg.content.find(b => b.type === 'text')?.text?.trim() ?? '';
}

function resolveUnits(body) {
  return body?.units === 'metric' ? 'metric' : 'imperial';
}

function isOverloaded(err) {
  return err.status === 529 || err.message?.startsWith('529');
}

// Rounds a reading to a step so small changes share a cache entry.
function bucket(v, step, fallback) {
  return Math.round((v ?? fallback) / step) * step;
}

// Every key starts with the units and, for forecast-model data, a preview marker.
function keyPrefix(units, isPreview) {
  return `${units}|${isPreview ? 'preview|' : ''}`;
}

function getCacheHit(key) {
  const hit = cache.get(key);
  return hit && isFresh(hit.ts) ? hit : null;
}

function cacheSet(key, data) {
  if (cache.size >= CACHE_MAX_SIZE && !cache.has(key)) evictOne();
  cache.set(key, { data, ts: Date.now() });
}

function requireApiKey(res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: 'Insight service not configured' }); return null; }
  return apiKey;
}

// Failures are never 200s: clients cache whatever succeeds, so a "busy" message
// or a blank narrative sent as a success used to stay on the card for an hour.
function handleInsightError(res, err, tag) {
  const overloaded = isOverloaded(err);
  console.error(`[insight:${tag}] API error${overloaded ? ' (overloaded)' : ''}:`, err.message);
  if (overloaded) return res.status(503).json({ error: 'Insight service busy' });
  return res.status(502).json({ error: 'Insight service error' });
}

// The shared cache → model → respond pipeline. `build()` returns the model call
// ({ system, prompt, maxTokens, outputConfig }) and runs only on a cache miss.
// `parse(text)` turns the reply into the response body, or null when there is
// nothing worth showing (refusal, truncation, bad JSON) — that is a 502 and is
// not cached, so the next view retries.
async function runCachedInsight(res, { tag, key, build, parse }) {
  const hit = getCacheHit(key);
  if (hit) return res.status(200).json(hit.data);

  const apiKey = requireApiKey(res);
  if (!apiKey) return;

  try {
    const msg = await callModel({ apiKey, ...build() });
    const data = parse(textOf(msg, tag));
    if (!data) {
      console.error(`[insight:${tag}] empty result, not cached`);
      return res.status(502).json({ error: 'Insight unavailable' });
    }
    cacheSet(key, data);
    return res.status(200).json(data);
  } catch (err) {
    return handleInsightError(res, err, tag);
  }
}

// ── Activity insight ──────────────────────────────────────────────────────────

function activityCacheKey(stationId, actId, score, c, period, outlook, bestWindow) {
  const t = bucket(c?.temp, 2, 70);
  const w = bucket(c?.windSpeed, 2, 0);
  const s = bucket(score, 5, 0);
  return `act|${stationId}|${actId}|${s}|${t}|${w}|${period ?? 'daytime'}|${outlook ?? 'none'}|${bestWindow ?? 'none'}`;
}

// "When should — or shouldn't — I go?" This is the only card that gives timing
// advice; Forecast describes the day and Backyard describes the moment.
const ACTIVITY_JOB = 'Your job on this card is to answer "when should — or shouldn\'t — I do this today?" '
  + 'The overall rating and the factors describe conditions right now. The score is printed on the card beside you, so never quote a score or a rating number — talk about the weather behind it. '
  + 'Speak to this particular activity: say what the conditions mean for doing it (paws on hot pavement for a dog walk, sweat and breathing for sports, wind on the flame for a grill, dry soil or wilting for gardening), not just whether they are pleasant. '
  + 'Open with the condition that matters most for the activity — never with "Right now is a good time" or the activity\'s name. '
  + 'When conditions are excellent, say what makes them so for this activity and how long they last according to the outlook; when they are not, name what is holding it back and whether waiting helps or it is better to skip today. '
  + 'Only recommend a time that appears in the outlook or the best window. '
  + 'If any factor is rated very poor, it is the primary constraint: lead with it even if the overall rating is fair. '
  + 'Write exactly 2 sentences, then one short actionable tip starting "Tip:" (timing, gear, or a modification).';

const ACTIVITY_EXAMPLES = [
  'Gusts to 24 mph are what\'s holding a run back, even with a comfortable 58°. The wind settles through the afternoon and the best stretch is 3–6 PM, still dry. Tip: wait until after 3 and finish with the tailwind home.',
  'Seventy-two with a light breeze is easy on paws and people alike, and the pavement hasn\'t had a chance to bake. It holds like this through the afternoon before cooling into the evening. Tip: bring water anyway — 69% humidity wears a dog down faster than you\'d think.',
  'A light breeze won\'t fight the coals and the air is clean, so smoke drifts off rather than hanging around the patio. Rain is likely after 8p, which makes this afternoon the window. Tip: get the grill lit by 5 and plan to eat outside before it turns.',
];

async function handleActivityInsight(req, res) {
  const { activity, activityLabel, score, factors, current: c,
          outlook, bestWindow, stationId, sourceType, period } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === SOURCE_TYPES.FORECAST_MODEL;
  const key = keyPrefix(units, isPreview) + activityCacheKey(stationId ?? 'unknown', activity, score, c, period, outlook, bestWindow);

  return runCachedInsight(res, {
    tag: 'activity',
    key,
    build: () => buildActivityCall({ activityLabel, score, factors, c, outlook, bestWindow, period, units, isPreview }),
    parse: text => (text ? { insight: text } : null),
  });
}

function buildActivityCall({ activityLabel, score, factors, c, outlook, bestWindow, period, units, isPreview }) {
  const topFactors = [...(factors ?? [])]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(f => `${f.name} (${scoreBand(f.score)})`)
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
Activity: ${activityLabel} — overall right now: ${scoreBand(score) ?? 'unknown'}
Weakest factors: ${topFactors}

Conditions right now:
- ${formatTemp(c?.temp, units)}, feels like ${formatTemp(c?.feelsLike, units)} (${feelsLikeLabel}), dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusts to ${formatWind(c?.windGust, units)}
- Humidity: ${c?.humidity ?? '?'}%, UV ${c?.uv ?? '?'}, ${aqiLine(c?.aqi)}
- ${rainLine}${pavementLine}

${outlookLine}
${windowLine}`;

  const system = buildSystem({ isPreview, job: ACTIVITY_JOB, examples: ACTIVITY_EXAMPLES });

  // 160 was tight for two sentences plus a tip, and truncation was silent.
  // Haiku 5.5's tokenizer counts the same text as ~30% more tokens.
  return { system, prompt, maxTokens: 350 };
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

// "What's it doing right now?" — what you'd feel stepping outside. The station
// may sit on a roof or a fence post, so the voice says "your yard", not "out back".
// It looks ahead only a few hours; the rest of the day is the Forecast card's.
const DAILY_JOB = 'Your job on this card is to answer "what\'s it doing right now?" — what the reader would feel stepping outside. '
  + 'Lead with the most notable current condition. Mention the next few hours only if the data shows a change in them, and never describe later in the day. '
  + 'When nothing is falling and the next few hours are dry, leave rain out entirely. '
  + 'Use "but" or "though" only between facts that pull against each other; never set the absence of rain against an unrelated change such as warming. '
  + 'Use type=caution on a tag only when a value is genuinely limiting or hazardous. Each tag covers a distinct aspect of conditions — never repeat a theme across tags.';

// Only a real station can speak for the reader's yard; preview data is city-level.
const YARD_LINE = 'If you place the conditions, say "in your yard" or "at your place" — not "out back".';

const DAILY_EXAMPLES = [
  'It\'s a raw 47° with a north wind that makes it feel closer to 41. Skies are dry for now, but rain is likely within the next couple of hours.',
  'A calm, comfortable 68° in your yard with clean air and barely a breeze. Nothing much changes over the next few hours.',
  'A crisp 41° under clear skies, with a light west breeze. It warms into the upper 40s over the next few hours.',
];

async function handleDailyInsight(req, res) {
  const { stationId, placeName, date, current: c, yoyReadings, lookahead, sourceType, period } = req.body ?? {};
  const units = resolveUnits(req.body);
  const isPreview = sourceType === SOURCE_TYPES.FORECAST_MODEL;
  const key = keyPrefix(units, isPreview) + `daily|${stationId}|${date}|${bucket(c?.temp, 2, 70)}|${period ?? 'unknown'}|${lookahead ?? 'steady'}`;

  return runCachedInsight(res, {
    tag: 'daily',
    key,
    build: () => buildDailyCall({ stationId, placeName, date, c, yoyReadings, lookahead, period, units, isPreview }),
    parse: parseDaily,
  });
}

// The schema guarantees shape; a truncated response is the one way this can
// still fail to parse, and textOf logs that case.
function parseDaily(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    return data?.narrative ? data : null;
  } catch (err) {
    console.error('[insight:daily] JSON parse error:', err.message);
    return null;
  }
}

function buildDailyCall({ stationId, placeName, date, c, yoyReadings, lookahead, period, units, isPreview }) {
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

  // Rain is only in the prompt when there is some. A standing "Raining now:
  // 0.00 in/hr" line got answered — "nothing is falling right now, but…" —
  // even on a dry day. Preview has a rain rate but no daily accumulation.
  const rate = c?.precipRate ?? 0;
  const total = isPreview ? 0 : (c?.precipTotal ?? 0);
  const rainLine = rate > 0
    ? `\n- Raining now: ${formatPrecipRate(rate, units)}${isPreview ? '' : `, ${formatPrecipTotal(total, units)} total today`}`
    : total > 0
      ? `\n- Not raining now; ${formatPrecipTotal(total, units)} fell earlier today`
      : '';

  const lookaheadLine = `\n\nNext 3 hours: ${lookahead ?? 'no notable change'}`;

  const locationLabel = isPreview ? 'Location' : 'Station';
  const yoyInstruction = isPreview
    ? 'No year-over-year data available — omit any comparisons.'
    : (yoyDelta ? 'Reference the year-over-year difference in the final sentence.' : 'No year-over-year data — omit any comparisons.');

  // Preview and Explore are keyed by coordinates; the model gets the place name.
  const prompt = `${locationLabel}: ${(isPreview && placeName) || stationId} — ${date}
Time of day: ${period ?? 'unknown'}

Right now:
- Temp: ${formatTemp(c?.temp, units)} (feels ${formatTemp(c?.feelsLike, units)}), humidity ${c?.humidity ?? '?'}%, dew point ${formatTemp(c?.dewPoint, units)}
- Wind: ${formatWind(c?.windSpeed, units)} ${dir}, gusting ${formatWind(c?.windGust, units)}
- Pressure: ${formatPressure(c?.pressure, units)}
- UV index: ${c?.uv ?? '?'}, ${aqiLine(c?.aqi)}${rainLine}${lookaheadLine}${yoyDelta}

narrative: 2-3 sentences. ${yoyInstruction}
tags: exactly 3-4, each label 2-3 words, each covering a different aspect (e.g. temperature, precipitation, wind, air quality).`;

  const system = buildSystem({ isPreview, job: isPreview ? DAILY_JOB : `${DAILY_JOB} ${YARD_LINE}`,
    examples: isPreview ? DAILY_EXAMPLES.map(e => e.replace(' in your yard', '')) : DAILY_EXAMPLES });

  return {
    system, prompt, maxTokens: 600,
    outputConfig: { format: { type: 'json_schema', schema: DAILY_SCHEMA } },
  };
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
  const isPreview = sourceType === SOURCE_TYPES.FORECAST_MODEL;

  // Today is keyed to the part of the day so it regenerates as each passes;
  // the outlook string carries the forecast itself, so a revision changes it.
  // Bucketed at 25 so a crossing between EPA categories always changes the key.
  const aqiBucket = aqi == null ? 'na' : bucket(aqi, 25);
  const part = isToday ? (dayPart ?? 'today') : 'day';
  const key = keyPrefix(units, isPreview)
    + `fcday|${stationId ?? 'preview'}|${date}|${part}|${bucket(tempMax, 2, 70)}|${bucket(tempMin, 2, 50)}|${bucket(pop, 20, 0)}|${aqiBucket}|${outlook ?? 'none'}`;

  return runCachedInsight(res, {
    tag: 'forecast-day',
    key,
    build: () => buildForecastDayCall({ date, dayLabel, tempMax, tempMin, pop, conditions, outlook, isToday, dayPart, aqi, units, isPreview }),
    parse: text => (text ? { narrative: text } : null),
  });
}

function buildForecastDayCall({ date, dayLabel, tempMax, tempMin, pop, conditions, outlook, isToday, dayPart, aqi, units, isPreview }) {
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
    ? `Air quality, worst of the ${AQI_WINDOW_LABEL} stretch: ${aqiLine(aqi)}`
    : 'Air quality: no forecast available for this day — do not comment on air quality.';

  const prompt = `${dayLine}
Conditions: ${conditions || 'not specified'}
${outlookLine}
${aqiLineText}`;

  const system = buildSystem({ isPreview, job: forecastJob(!!isToday), examples: FORECAST_EXAMPLES });

  return { system, prompt, maxTokens: 400 };
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (rateLimiter.hit(clientIp(req))) return res.status(429).json({ error: 'Rate limit exceeded. Try again shortly.' });

  req.body = clampBody(req.body);

  if (req.body?.type === 'daily')        return handleDailyInsight(req, res);
  if (req.body?.type === 'forecast-day') return handleForecastDayInsight(req, res);
  return handleActivityInsight(req, res);
}
