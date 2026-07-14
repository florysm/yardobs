import { degreesToCompass } from './format.js';

export const UNITS = { IMPERIAL: 'imperial', METRIC: 'metric' };

const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

// IANA time zones covering the US (incl. territories with distinct zones),
// Liberia, and Myanmar — the only places that use imperial units day to day.
// Time zone comes from the device's physical location (OS/GPS), so unlike
// navigator.language it isn't fooled by someone who leaves their phone's
// language set to "English (United States)" while living abroad.
const IMPERIAL_TIMEZONES = new Set([
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'America/Phoenix', 'America/Detroit', 'America/Boise',
  'America/Indianapolis', 'America/Indiana/Knox', 'America/Indiana/Marengo',
  'America/Indiana/Petersburg', 'America/Indiana/Tell_City', 'America/Indiana/Vevay',
  'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Louisville',
  'America/Kentucky/Monticello', 'America/Menominee', 'America/North_Dakota/Beulah',
  'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/Juneau',
  'America/Metlakatla', 'America/Nome', 'America/Sitka', 'America/Yakutat',
  'America/Adak', 'Pacific/Honolulu',
  'Africa/Monrovia', 'Asia/Yangon',
]);

// Pure decision helpers (extracted so the imperial/metric logic is testable
// without stubbing the whole Intl/navigator environment).
export function unitsForTimezone(tz) {
  if (!tz) return null; // unknown → let the caller fall back to region
  return IMPERIAL_TIMEZONES.has(tz) ? UNITS.IMPERIAL : UNITS.METRIC;
}

export function unitsForRegion(region) {
  return IMPERIAL_REGIONS.has(region) ? UNITS.IMPERIAL : UNITS.METRIC;
}

// Metric by default; imperial only when the device is physically located in an
// imperial-unit place. Time zone is the primary signal (reflects location, not
// language preference); language-region is a weaker fallback. Falls back to
// metric on any failure (older browsers, non-browser contexts) since that's the
// international-first default this app is moving toward.
export function detectDefaultUnits() {
  try {
    const byTz = unitsForTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (byTz) return byTz;
  } catch { /* fall through to language-based detection */ }
  try {
    return unitsForRegion(new Intl.Locale(navigator.language).maximize().region);
  } catch {
    return UNITS.METRIC;
  }
}

export function convertTemp(valueF, units) {
  if (valueF == null) return null;
  return units === UNITS.METRIC ? (valueF - 32) * 5 / 9 : valueF;
}

export function convertWind(valueMph, units) {
  if (valueMph == null) return null;
  return units === UNITS.METRIC ? valueMph * 1.60934 : valueMph;
}

export function convertPrecip(valueIn, units) {
  if (valueIn == null) return null;
  return units === UNITS.METRIC ? valueIn * 25.4 : valueIn;
}

// inHg is the app's canonical pressure unit (see src/hooks/useWeather.js); this
// is the inverse of that file's hPa→inHg constant (0.02953), kept consistent
// rather than introducing a second magic number.
export function convertPressure(valueInHg, units) {
  if (valueInHg == null) return null;
  return units === UNITS.METRIC ? valueInHg / 0.02953 : valueInHg;
}

export function tempUnitLabel(units) {
  return units === UNITS.METRIC ? '°C' : '°F';
}

export function windUnitLabel(units) {
  return units === UNITS.METRIC ? 'km/h' : 'mph';
}

export function pressureUnitLabel(units) {
  return units === UNITS.METRIC ? 'hPa' : 'inHg';
}

export function formatTemp(valueF, units, digits = 0) {
  const v = convertTemp(valueF, units);
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(digits)}${tempUnitLabel(units)}`;
}

export function formatTempParts(valueF, units, digits = 0) {
  const v = convertTemp(valueF, units);
  if (v == null || isNaN(v)) return { value: '—', unit: '' };
  return { value: v.toFixed(digits), unit: tempUnitLabel(units) };
}

export function formatWind(valueMph, units, digits = 0) {
  const v = convertWind(valueMph, units);
  if (v == null || isNaN(v)) return '—';
  return `${v.toFixed(digits)} ${windUnitLabel(units)}`;
}

export function formatWindParts(valueMph, units, digits = 0) {
  const v = convertWind(valueMph, units);
  if (v == null || isNaN(v)) return { value: '—', unit: '' };
  return { value: v.toFixed(digits), unit: ` ${windUnitLabel(units)}` };
}

export function formatWindWithCompass(valueMph, dirDeg, units) {
  const v = convertWind(valueMph, units);
  if (v == null || isNaN(v)) return '—';
  const dir = degreesToCompass(dirDeg);
  return `${v.toFixed(0)} ${windUnitLabel(units)}${dir ? ` ${dir}` : ''}`;
}

// Imperial keeps 2 decimals (existing convention); metric uses 1 — mm is a
// coarser unit, so a second decimal would be false precision.
export function formatPrecipRate(valueIn, units) {
  const v = convertPrecip(valueIn, units);
  if (v == null || isNaN(v)) return '—';
  return units === UNITS.METRIC ? `${v.toFixed(1)} mm/hr` : `${v.toFixed(2)}"/hr`;
}

export function formatPrecipRateParts(valueIn, units) {
  const v = convertPrecip(valueIn, units);
  if (v == null || isNaN(v)) return { value: '—', unit: '' };
  return units === UNITS.METRIC
    ? { value: v.toFixed(1), unit: ' mm/hr' }
    : { value: v.toFixed(2), unit: '"/hr' };
}

export function formatPrecipTotal(valueIn, units) {
  const v = convertPrecip(valueIn, units);
  if (v == null || isNaN(v)) return '—';
  return units === UNITS.METRIC ? `${v.toFixed(1)} mm` : `${v.toFixed(2)}"`;
}

// Always renders an explicit inHg/hPa suffix (never a bare `"`, which
// previously collided visually with the inches-of-rain glyph).
export function formatPressure(valueInHg, units) {
  const v = convertPressure(valueInHg, units);
  if (v == null || isNaN(v)) return '—';
  return units === UNITS.METRIC ? `${v.toFixed(0)} hPa` : `${v.toFixed(2)} inHg`;
}
