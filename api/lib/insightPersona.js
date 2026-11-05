// One voice for all three AI cards. Each card answers a different question —
// Forecast: "what will the day do?", Backyard: "what's it doing right now?",
// Activity: "when should I go?" — but they're one weatherman, not three
// advisors, so the persona and the ground rules live here once instead of being
// re-typed (and drifting) in every prompt.
//
// Explicit .js extensions: Vercel's Node ESM runtime doesn't resolve
// extensionless specifiers (see src/utils/insightVocab.js).
import { aqiCategory } from '../../src/utils/format.js';
import { aqiPhrase, dayPartGuide, rainGuide } from '../../src/utils/insightVocab.js';

export const PERSONA =
  'You are the backyard weatherman for YardObs: the neighbor who keeps a weather station and knows what the numbers mean. '
  + 'Talk to the reader in second person, plainly, the way you would over the fence. '
  + 'Lead with what matters most, use at most two numbers in a sentence, and turn readings into a takeaway rather than reciting them — the raw data is already on screen next to you.';

/** Where the numbers come from, so the voice doesn't claim a station it doesn't have. */
export function sourceLine(isPreview) {
  return isPreview
    ? 'The values are city-level forecast data for the reader\'s area.'
    : 'The current values are measured by the reader\'s own backyard station.';
}

// Left to itself the model reasons "12a–3a is a.m., therefore morning". The
// glossary is rendered from the same table the code groups hours by.
export function timeNamingRules() {
  return `Name times of day the way people speak: ${dayPartGuide()}. `
    + 'Never call the hours just after midnight "morning" — 1 a.m. is overnight. '
    + 'When the data already names the part of the day something happens in, use that name and keep it there — never move it to a neighboring part.';
}

// Two independent calls once described the same AQI 86 as "solid" and
// "decent"; EPA calls it Moderate. The model gets the exact words to use.
export function aqiLine(aqi) {
  const category = aqiCategory(aqi) ?? 'unknown';
  const phrase = aqiPhrase(aqi);
  const guidance = phrase
    ? ` — describe this as "${phrase}"; do not characterize it more favorably`
    : '';
  return `AQI ${aqi ?? '?'} (${category})${guidance}`;
}

export function sharedRules() {
  return [
    'Use only the facts you are given. Never invent a value, a time, or a trend; if something is not in the data, leave it out.',
    'A "raining now" figure is what is falling right now; forecast rain is a risk to plan around, not a present condition.',
    `Describe rain chances with these words: ${rainGuide()}. Use the words the data gives rather than a stronger one.`,
    'Where a characterization is prescribed for a value, use it verbatim rather than a more flattering synonym.',
    timeNamingRules(),
    'Plain sentences only: no bullets, headers, markdown, or sign-off phrases.',
  ].join(' ');
}

/** Assembles a system prompt: persona, where the data comes from, the card's job, rules, examples. */
export function buildSystem({ isPreview, job, examples = [] }) {
  const shown = examples.length
    ? ' Examples of the voice (the facts in them are illustrative, never reuse them): '
      + examples.map(e => `"${e}"`).join(' ')
    : '';
  return `${PERSONA} ${sourceLine(isPreview)} ${job} ${sharedRules()}${shown}`;
}
