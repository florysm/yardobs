import Anthropic from '@anthropic-ai/sdk';

const cache = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

const WIND_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

function aqiCategory(v) {
  if (v == null) return 'unknown';
  if (v <= 50)  return 'Good';
  if (v <= 100) return 'Moderate';
  if (v <= 150) return 'Unhealthy for Sensitive Groups';
  if (v <= 200) return 'Unhealthy';
  return 'Very Unhealthy / Hazardous';
}

function windDirStr(deg) {
  return deg != null ? WIND_DIRS[Math.round(deg / 22.5) % 16] : 'variable';
}

// ── Activity insight ──────────────────────────────────────────────────────────

function activityCacheKey(actId, score, c) {
  const t = Math.round((c?.temp ?? 70) / 2) * 2;
  const w = Math.round((c?.windSpeed ?? 0) / 2) * 2;
  const s = Math.round(score / 5) * 5;
  return `act|${actId}|${s}|${t}|${w}`;
}

async function handleActivityInsight(req, res) {
  const { activity, activityLabel, score, factors, current: c } = req.body ?? {};
  const key = activityCacheKey(activity, score, c);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return res.status(200).json({ insight: hit.text });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ insight: '' });

  const factorStr = (factors ?? []).map(f => `${f.name}: ${f.score}/100`).join(', ');
  const dir = windDirStr(c?.windDir);

  const prompt = `Activity: ${activityLabel}
Overall score: ${score}/100
Factor breakdown: ${factorStr}

Live station readings:
- Temperature: ${c?.temp ?? '?'}°F, feels like ${c?.feelsLike ?? '?'}°F
- Humidity: ${c?.humidity ?? '?'}%, dew point ${c?.dewPoint ?? '?'}°F
- Wind: ${c?.windSpeed ?? '?'} mph ${dir}, gusting to ${c?.windGust ?? '?'} mph
- UV index: ${c?.uv ?? '?'}, solar radiation: ${c?.solar ?? '?'} W/m²
- Air quality (US AQI): ${c?.aqi ?? '?'} — ${aqiCategory(c?.aqi)}
- Rain rate: ${c?.precipRate ?? 0}"/hr, ${c?.precipTotal ?? 0}" accumulated today
- Pressure: ${c?.pressure ?? '?'} inHg

Write 2-3 sentences using the specific values above. Include one practical tip relevant to the activity.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 160,
      system: 'You are a hyperlocal weather insight engine for a backyard weather station app called YardObs. Return exactly 2-3 plain sentences — no bullets, headers, or sign-off phrases. Cite specific measured values. Be direct and practical.',
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.text?.trim() ?? '';
    cache.set(key, { text, ts: Date.now() });
    return res.status(200).json({ insight: text });
  } catch (err) {
    console.error('[insight:activity] API error:', err.message);
    return res.status(200).json({ insight: '' });
  }
}

// ── Daily backyard insight ────────────────────────────────────────────────────

const ALLOWED_ICONS = [
  'thermometer','wind','droplet','umbrella','snowflake','flame','sun',
  'alert-triangle','trending-up','trending-down','circle-check','cloud','leaf','gauge',
];

async function handleDailyInsight(req, res) {
  const { stationId, date, current: c, yoyReadings } = req.body ?? {};
  const tempBucket = Math.round((c?.temp ?? 70) / 2) * 2;
  const key = `daily|${stationId}|${date}|${tempBucket}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return res.status(200).json(hit.data);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(200).json({ narrative: '', tags: [] });

  const dir = windDirStr(c?.windDir);

  let yoyContext = '';
  const yoy = Array.isArray(yoyReadings) ? yoyReadings[0] : null;
  if (yoy) {
    const avgTemp  = yoy.imperial?.tempAvg  ?? yoy.imperial?.temp  ?? null;
    const highTemp = yoy.imperial?.tempHigh ?? null;
    const precip   = yoy.imperial?.precipTotal ?? 0;
    if (avgTemp != null) {
      yoyContext = `\nSame date last year: avg ${avgTemp}°F (high ${highTemp ?? '?'}°F), ${precip}" total precip.`;
    }
  }

  const prompt = `Station: ${stationId}
Date: ${date}

Live readings:
- Temperature: ${c?.temp ?? '?'}°F, feels like ${c?.feelsLike ?? '?'}°F
- Humidity: ${c?.humidity ?? '?'}%, dew point ${c?.dewPoint ?? '?'}°F
- Wind: ${c?.windSpeed ?? '?'} mph ${dir}, gusting ${c?.windGust ?? '?'} mph
- Pressure: ${c?.pressure ?? '?'} inHg
- Rain rate: ${c?.precipRate ?? 0}"/hr, ${c?.precipTotal ?? 0}" today${yoyContext}

Return a JSON object with exactly these fields:
{
  "narrative": "2-3 sentences in second person, hyperlocal, referencing actual measured values. Compare to last year if meaningfully different. Direct, informed tone — like a knowledgeable neighbor.",
  "tags": [
    { "label": "2-3 word label", "type": "positive|caution|neutral", "icon": "one of: ${ALLOWED_ICONS.join('|')}" }
  ]
}

Return 3-4 tags. Return only the JSON object, no markdown, no other text.`;

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 320,
      system: 'You are a hyperlocal weather insight engine for YardObs. Return valid JSON only — no markdown fences, no preamble. Second person, specific values, direct tone.',
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

    cache.set(key, { data, ts: Date.now() });
    return res.status(200).json(data);
  } catch (err) {
    console.error('[insight:daily] API error:', err.message);
    return res.status(200).json({ narrative: '', tags: [] });
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
