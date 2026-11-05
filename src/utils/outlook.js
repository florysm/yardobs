// Explicit .js extensions: see insightVocab.js — this module may be imported
// from the serverless side, where extensionless specifiers don't resolve.
import { dayPartName, rainTerm, shortHour } from './insightVocab.js';
import { convertTemp, formatWind } from './units.js';
import { toISODate } from './dateUtils.js';

// The shared facts layer behind all three AI cards. Each card answers a
// different question, but they all read the forecast through these functions,
// so they can't disagree about when the rain is or what "evening" means.
//
// Everything is grouped by the same day parts the prompt glossary names
// (insightVocab.js). Grouping in code rather than leaving it to the model is the
// whole point: handed "7p 57, 10p 53" the model called the 10p reading
// "evening"; handed "night (9p–12a) 55→53°" it has nothing to misfile.
//
// Outputs are pre-formatted strings, not arrays: clampBody (api/lib/sanitize.js)
// truncates arrays at 20 elements and strings at 500 chars, silently.
//
// Hourly arrays are Open-Meteo's, requested in °F / mph with timezone=auto, so
// each `time` entry is local wall-clock "YYYY-MM-DDTHH:00".

function hourOf(t) {
  return parseInt(t.split('T')[1], 10);
}

function tempRange(first, last, units) {
  if (first == null || last == null) return null;
  const a = Math.round(convertTemp(first, units));
  const b = Math.round(convertTemp(last, units));
  return a === b ? `around ${a}°` : `${a}→${b}°`;
}

function rainPhrase(hours) {
  let peak = null;
  for (const { prob } of hours) {
    if (prob != null && (peak === null || prob > peak)) peak = prob;
  }
  if (peak === null) return null;
  const term = rainTerm(peak);
  if (term === 'dry') return 'dry';
  // "from 11p" marks when it reaches the stated likelihood — "rain likely from
  // 11p", not the hour it first crept past 30%. Omitted when that's the start of
  // the period, whose own label already says when.
  const first = hours.find(x => x.prob != null && rainTerm(x.prob) === term).hour;
  const from = first !== hours[0].hour ? ` from ${shortHour(first)}` : '';
  return `${term} ${peak}%${from}`;
}

/**
 * One day's forecast by day part, e.g.
 * "evening (6p–9p) 61→57°, dry; night (9p–12a) 56→53°, rain likely 60% from 11p".
 *
 * `fromHour` drops hours already past — today's card describes the rest of the
 * day, and a part already under way is clipped ("evening (7p–9p)").
 * Null when there's no hourly data left for that day.
 */
export function buildDayOutlook(hf, dateStr, units, { fromHour = 0 } = {}) {
  const h = hf?.hourly;
  if (!h?.time?.length) return null;

  const parts = [];
  h.time.forEach((t, i) => {
    if (!t.startsWith(dateStr)) return;
    const hour = hourOf(t);
    if (hour < fromHour) return;
    const name = dayPartName(hour);
    let part = parts[parts.length - 1];
    if (!part || part.name !== name) {
      part = { name, hours: [] };
      parts.push(part);
    }
    part.hours.push({ hour, temp: h.temperature_2m?.[i], prob: h.precipitation_probability?.[i] });
  });
  if (!parts.length) return null;

  return parts.map(({ name, hours }) => {
    const start = hours[0].hour;
    const end = hours[hours.length - 1].hour + 1;
    const temps = hours.map(x => x.temp).filter(x => x != null);
    const facts = [
      tempRange(temps[0], temps[temps.length - 1], units),
      rainPhrase(hours),
    ].filter(Boolean);
    return `${name} (${shortHour(start)}–${shortHour(end)}) ${facts.join(', ')}`;
  }).join('; ');
}

// Changes smaller than these read as "no change" for the next-few-hours view.
const LOOKAHEAD_TEMP_DELTA_F = 3;
const LOOKAHEAD_WIND_DELTA_MPH = 8;

/**
 * What changes over the next few hours, for the "what's it doing right now"
 * card, e.g. "61→55°, rain likely 70% from 9p, wind picking up to 18 mph".
 * Null when nothing notable changes — the card should then stay on the present.
 */
export function buildLookahead(hf, units, now = new Date(), hours = 3) {
  const h = hf?.hourly;
  if (!h?.time?.length) return null;
  const nowKey = `${toISODate(now)}T${String(now.getHours()).padStart(2, '0')}`;
  const start = h.time.findIndex(t => t.startsWith(nowKey));
  if (start === -1) return null;
  const end = Math.min(start + hours, h.time.length - 1);
  if (end <= start) return null;

  const facts = [];

  const t0 = h.temperature_2m?.[start];
  const t1 = h.temperature_2m?.[end];
  if (t0 != null && t1 != null && Math.abs(t1 - t0) >= LOOKAHEAD_TEMP_DELTA_F) {
    facts.push(tempRange(t0, t1, units));
  }

  // The current hour is excluded: the card already has what's falling right now.
  const ahead = [];
  for (let i = start + 1; i <= end; i++) {
    ahead.push({ hour: hourOf(h.time[i]), prob: h.precipitation_probability?.[i] });
  }
  const rain = rainPhrase(ahead);
  if (rain && rain !== 'dry') facts.push(rain);

  const w0 = h.wind_speed_10m?.[start];
  let wPeak = null;
  for (let i = start + 1; i <= end; i++) {
    const w = h.wind_speed_10m?.[i];
    if (w != null && (wPeak === null || w > wPeak)) wPeak = w;
  }
  if (w0 != null && wPeak != null && wPeak - w0 >= LOOKAHEAD_WIND_DELTA_MPH) {
    facts.push(`wind picking up to ${formatWind(wPeak, units)}`);
  }

  return facts.length ? facts.join(', ') : null;
}
