// Explicit .js extension: this module is imported by api/insight.js, which runs
// on Vercel's Node ESM runtime where extensionless specifiers don't resolve.
// Vite papers over that in the browser bundle, so the failure only shows up at
// runtime in the serverless function — see units.js/format.js for the same rule.
import { aqiCategory } from './format.js';

// Shared vocabulary for anything that describes a score or an AQI reading in
// words — the activity card, the daily narrative, and the LLM prompts that
// narrate them. Previously each site invented its own bands and adjectives, so
// the same AQI 86 could be "solid" on one card and "decent" on the next.
// Imported by both the browser bundle and api/insight.js.

const SCORE_BANDS = [
  [80, 'excellent'],
  [65, 'good'],
  [50, 'marginal'],
  [30, 'poor'],
];
const SCORE_FLOOR = 'very poor';

// Lower bound (inclusive) of each band → used to render the guide handed to the
// model, so the prompt can never drift from the thresholds the UI applies.
export function scoreBand(score) {
  if (score == null) return null;
  const hit = SCORE_BANDS.find(([min]) => score >= min);
  return hit ? hit[1] : SCORE_FLOOR;
}

export function scoreGuide() {
  const parts = SCORE_BANDS.map(([min], i) => {
    const upper = i === 0 ? 100 : SCORE_BANDS[i - 1][0] - 1;
    return `${min}–${upper} = ${SCORE_BANDS[i][1]}`;
  });
  parts.push(`0–${SCORE_BANDS[SCORE_BANDS.length - 1][0] - 1} = ${SCORE_FLOOR}`);
  return parts.join(', ');
}

// ── Time-of-day naming ────────────────────────────────────────────────────────
// Left to itself the model reasons "12a–3a is a.m., therefore morning" and
// writes "thunderstorms Sunday morning between midnight and 3 a.m." — literally
// true, but nobody talks that way. These are the names humans actually use, and
// dayPartGuide() renders this same table into the prompt so the vocabulary the
// model is given can't drift from the one the code applies.
//
// [startHour, name] — each entry runs until the next entry's start.
// Boundaries deliberately line up with getTimePeriod (dateUtils.js), which is a
// coarser 4-bucket view of the same day — these names refine it, they must never
// contradict it (there's a test pinning that).
const DAY_PARTS = [
  [0,  'overnight'],
  [5,  'early morning'],
  [8,  'morning'],
  [12, 'afternoon'],
  [18, 'evening'],
  [21, 'night'],
];

// Accepts an exclusive end hour of 24, meaning midnight — wrapping stops
// `24 >= 12` from rendering it as "12p" (noon) and inverting a time range.
export function shortHour(h) {
  const hour = ((h % 24) + 24) % 24;
  const period = hour >= 12 ? 'p' : 'a';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${period}`;
}

export function dayPartName(hour) {
  if (hour == null) return null;
  const h = ((hour % 24) + 24) % 24;
  let name = DAY_PARTS[0][1];
  for (const [start, label] of DAY_PARTS) if (h >= start) name = label;
  return name;
}

export function dayPartGuide() {
  return DAY_PARTS.map(([start, name], i) => {
    const end = DAY_PARTS[(i + 1) % DAY_PARTS.length][0];
    return `${shortHour(start)}–${shortHour(end)} ${name}`;
  }).join(', ');
}

/**
 * Names an inclusive hour range the way a person would say it, e.g.
 * `dayPartRange(0, 2)` → "overnight", `dayPartRange(19, 23)` → "evening into night".
 */
export function dayPartRange(firstHour, lastHour) {
  const from = dayPartName(firstHour);
  const to = dayPartName(lastHour);
  if (!from) return null;
  return from === to ? from : `${from} into ${to}`;
}

// The exact characterization the model must use for a given AQI. Keyed off
// aqiCategory so it can't disagree with the category label shown beside it.
const AQI_PHRASES = {
  'Good':             'clean',
  'Moderate':         'acceptable but not pristine',
  'Sensitive Groups': 'a problem if you are sensitive',
  'Unhealthy':        'unhealthy',
  'Very Unhealthy':   'very unhealthy',
  'Hazardous':        'hazardous',
};

export function aqiPhrase(aqi) {
  const category = aqiCategory(aqi);
  return category ? AQI_PHRASES[category] : null;
}
