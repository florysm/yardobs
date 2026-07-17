import { toISODate } from './dateUtils';
import { LABELS, wmoToTwc } from './weatherIcons';

// The daily forecast comes from two vendors with very different shapes: TWC for
// station owners (their key), Open-Meteo for preview (keyless). Both are
// normalized here into one array so components never learn a vendor's quirks —
// the same split useWeather already applies to `current`.
//
// Shape: [{ date, dayOfWeek, tempMax, tempMin, iconCode, phrase, pop }]
//   date     — YYYY-MM-DD, local
//   iconCode — TWC iconCode; keys both ICONS (emoji) and LABELS (text)
//   phrase   — short condition text, for display and for the insight prompt
//   pop      — daytime probability of precipitation, %

function weekdayName(dateStr) {
  // Noon avoids any DST/parse edge landing on the previous day.
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d)) return null;
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return d.toLocaleDateString(locale, { weekday: 'long' });
}

/**
 * TWC /v3/wx/forecast/daily/5day.
 *
 * `daypart[0]` interleaves day and night: index i*2 is day, i*2+1 is night. TWC
 * nulls out the day half once that period has passed (roughly mid-afternoon),
 * which is why today falls back to the current observed iconCode.
 */
export function normalizeTwcForecast(data, currentIconCode = null) {
  if (!data) return null;
  const { dayOfWeek = [], temperatureMax = [], temperatureMin = [], daypart = [] } = data;
  if (!dayOfWeek.length) return null;

  const icons   = daypart?.[0]?.iconCode ?? [];
  const pops    = daypart?.[0]?.precipChance ?? [];
  const phrases = daypart?.[0]?.wxPhraseLong ?? [];
  const today = new Date();

  return dayOfWeek.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const date = toISODate(d);
    const iconCode = icons[i * 2] ?? (i === 0 ? currentIconCode : null);
    return {
      date,
      // Derived rather than taken from TWC's dayOfWeek, which is always en-US
      // (the request pins language=en-US) while the rest of the UI follows the
      // browser locale.
      dayOfWeek: weekdayName(date),
      tempMax:   temperatureMax[i] ?? null,
      tempMin:   temperatureMin[i] ?? null,
      iconCode,
      phrase:    phrases[i * 2] ?? LABELS[iconCode] ?? null,
      pop:       pops[i * 2] ?? pops[i] ?? null,
    };
  });
}

// The hours people are actually outside. A day's worst air at 3am is not what
// "is this a good day to be out there" turns on, and an all-day average would
// hide a bad afternoon behind clean overnight air.
const AQI_DAY_START = 8;
const AQI_DAY_END = 20; // inclusive

/**
 * Peak US AQI between 8a and 8p for one day, from the Open-Meteo air-quality
 * `hourly` block. Null when that day isn't covered — the prompt then says
 * nothing about air quality rather than guessing.
 */
export function aqiForDay(airQuality, dateStr) {
  const h = airQuality?.hourly;
  if (!h?.time?.length) return null;
  let peak = null;
  h.time.forEach((t, i) => {
    if (!t.startsWith(dateStr)) return;
    const hour = parseInt(t.split('T')[1], 10);
    if (hour < AQI_DAY_START || hour > AQI_DAY_END) return;
    const v = h.us_aqi?.[i];
    if (v == null) return;
    if (peak === null || v > peak) peak = v;
  });
  return peak === null ? null : Math.round(peak);
}

/**
 * Open-Meteo /v1/forecast `daily` block. Rides along on the hourly request, so
 * preview mode needs no extra round trip and no API key.
 */
export function normalizeOpenMeteoForecast(data) {
  const d = data?.daily;
  if (!d?.time?.length) return null;

  return d.time.map((date, i) => {
    // Open-Meteo's daily weathercode summarises the whole day, so resolve it as
    // a daytime icon — a nighttime variant would be wrong on a daily row.
    const iconCode = wmoToTwc(d.weathercode?.[i], 1);
    return {
      date,
      dayOfWeek: weekdayName(date),
      tempMax:   d.temperature_2m_max?.[i] ?? null,
      tempMin:   d.temperature_2m_min?.[i] ?? null,
      iconCode,
      phrase:    LABELS[iconCode] ?? null,
      pop:       d.precipitation_probability_max?.[i] ?? null,
    };
  });
}
