// Sky rules shared by the theme (App) and the hero condition label (HeroCard):
// TWC iconCode groups and the sensor thresholds, defined once so the two can't
// disagree. Pure and tested.
import { THEME_IDS } from '../themes.js';
import { iconFor, labelFor } from './weatherIcons';

// TWC iconCodes by sky. (0–2 are tornado / tropical storm / hurricane.)
export const ICON_STORMY = new Set([0, 1, 2, 3, 4, 17, 37, 38, 47]);
export const ICON_RAINY  = new Set([5, 6, 8, 9, 10, 11, 12, 35, 39, 40, 45]);
export const ICON_CLOUDY = new Set([7, 13, 14, 15, 16, 18, 19, 20, 21, 22, 25, 26, 27, 28, 41, 42, 43, 46]);
export const ICON_PARTLY = new Set([23, 24, 29, 30]);

export const SKY = {
  HEAVY_RAIN_RATE: 0.1,  // in/hr — above this, measured rain is heavy
  SUNNY_UV:        5,    // UV index at or above → strong sun
  SUNNY_SOLAR:     450,  // W/m² at or above → strong sun
  OVERCAST_SOLAR:  150,  // W/m² below (daytime) → measured overcast
};

export function isStrongSun(uv, solar) {
  return (uv ?? 0) >= SKY.SUNNY_UV || (solar ?? 0) >= SKY.SUNNY_SOLAR;
}

// Resolves current conditions → one of the 6 theme names using a sensor-aware
// cascade. Prefers the station's own measurements and only leans on the model
// iconCode when local sensors can't answer, so a regional-model storm can't
// override a backyard that's measurably dry. Day/night comes from current.isDay,
// which useWeather derives via SunCalc (the TWC observation omits it).
export function resolveAutoTheme(current) {
  if (!current) return THEME_IDS.light;

  const isDay      = (current.isDay ?? 1) === 1;
  const iconCode   = current.iconCode ?? null;
  const precipRate = current.precipRate;   // null → station has no rain sensor
  const uv         = current.uv;           // null → no UV sensor
  const solar      = current.solar;        // null → no solar sensor

  const hasRainSensor = precipRate != null;

  const modelStormy = iconCode != null && ICON_STORMY.has(iconCode);
  const modelRainy  = iconCode != null && ICON_RAINY.has(iconCode);
  const modelCloudy = iconCode != null && ICON_CLOUDY.has(iconCode);
  const modelPartly = iconCode != null && ICON_PARTLY.has(iconCode);

  // 1. Wetness. A local rain gauge is ground truth: a dry reading (0) vetoes the
  //    model's precipitation; the model's wetness is trusted only when the
  //    station has no gauge of its own (e.g. preview mode, which has no sensors).
  const isWet = hasRainSensor ? precipRate > 0 : (modelStormy || modelRainy);
  if (isWet) {
    const severe = modelStormy || (hasRainSensor && precipRate > SKY.HEAVY_RAIN_RATE);
    return severe ? THEME_IDS.stormy : THEME_IDS.rainy;
  }

  // 2. Dry night → dark.
  if (!isDay) return THEME_IDS.dark;

  // 3. Dry day → decide sunny / partly / cloudy, using the strongest signal
  //    available. Measured sunlight is only ever a positive "sunny" signal or,
  //    via solar radiation, a positive "overcast" signal — a low UV reading
  //    alone is ambiguous, so it never forces cloudy. When sensors are silent
  //    (preview mode, or a station without solar/UV) we defer to the model
  //    iconCode for the cloud state, which is the only clarity signal we have.
  if (isStrongSun(uv, solar))                return THEME_IDS.sunny;  // strong sun
  if (solar != null && solar < SKY.OVERCAST_SOLAR) return THEME_IDS.cloudy; // measured overcast
  // A storm/rain code reaching here was vetoed by a dry gauge, so treat it as
  // merely cloudy rather than a phantom storm.
  if (modelCloudy || modelStormy || modelRainy) return THEME_IDS.cloudy;
  if (modelPartly) return THEME_IDS.light;
  if (iconCode != null) return THEME_IDS.sunny;   // model reports clear sky
  // No strong sun reading and no model info: a silent solar sensor implies a
  // hazy/indeterminate day (light); nothing at all defaults to sunny daytime.
  return solar != null ? THEME_IDS.light : THEME_IDS.sunny;
}

// The hero card's condition when the station reports no iconCode: read the
// sky from its own rain gauge and solar sensor.
export function deriveFromSensors(obs) {
  const precip = obs.precipRate ?? 0;
  if (precip > SKY.HEAVY_RAIN_RATE) return { icon: '🌧️', label: 'Heavy Rain' };
  if (precip > 0)                   return { icon: '🌦️', label: 'Light Rain' };
  if (!obs.isDay)                   return { icon: '🌙', label: 'Clear' };
  if (obs.solar != null && obs.solar < SKY.OVERCAST_SOLAR)  return { icon: '☁️', label: 'Cloudy' };
  if (obs.solar != null && obs.solar >= SKY.SUNNY_SOLAR)    return { icon: '☀️', label: 'Sunny' };
  return { icon: '🌤️', label: 'Partly Cloudy' };
}

// The hero card's { icon, label } for current conditions. A "partly cloudy"
// model code is upgraded to Sunny in daytime when the sensors measure strong
// sun — the same test the theme uses.
export function heroCondition(current) {
  if (!current) return null;
  if (current.iconCode == null) return deriveFromSensors(current);
  if (ICON_PARTLY.has(current.iconCode) && (current.isDay ?? 1) && isStrongSun(current.uv, current.solar)) {
    return { icon: '☀️', label: 'Sunny' };
  }
  return { icon: iconFor(current.iconCode), label: labelFor(current.iconCode, 'Clear') };
}
