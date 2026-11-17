export const ICONS = {
  0:'🌪️',1:'🌀',2:'🌀',3:'⛈️',4:'⛈️',5:'🌨️',6:'🌧️',7:'🌧️',8:'🌧️',
  9:'🌦️',10:'🌧️',11:'🌧️',12:'🌧️',13:'🌨️',14:'🌨️',15:'🌨️',16:'❄️',
  17:'🌨️',18:'🌧️',19:'🌫️',20:'🌫️',21:'🌫️',22:'💨',23:'💨',24:'💨',
  25:'🥶',26:'☁️',27:'☁️',28:'☁️',29:'🌙',30:'⛅',31:'🌙',32:'☀️',
  33:'🌙',34:'🌤️',35:'🌧️',36:'🌡️',37:'⛈️',38:'⛈️',39:'🌦️',40:'🌧️',
  41:'🌨️',42:'❄️',43:'🌨️',44:'❓',45:'🌦️',46:'🌨️',47:'⛈️',
};

export const LABELS = {
  0:'Tornado',1:'Tropical Storm',2:'Hurricane',3:'Severe T-Storms',4:'Thunderstorms',
  5:'Rain & Snow',6:'Rain & Sleet',7:'Wintry Mix',8:'Freezing Drizzle',9:'Drizzle',
  10:'Freezing Rain',11:'Showers',12:'Rain',13:'Flurries',14:'Snow Showers',
  15:'Blowing Snow',16:'Snow',17:'Hail',18:'Sleet',19:'Dust',20:'Foggy',
  21:'Haze',22:'Smoke',23:'Breezy',24:'Windy',25:'Frigid',26:'Cloudy',
  27:'Mostly Cloudy',28:'Mostly Cloudy',29:'Partly Cloudy',30:'Partly Cloudy',
  31:'Clear',32:'Sunny',33:'Fair',34:'Fair',35:'Rain & Hail',36:'Hot',
  37:'Isolated T-Storms',38:'Scattered T-Storms',39:'Scattered Showers',
  40:'Heavy Rain',41:'Scattered Snow',42:'Heavy Snow',43:'Blizzard',
  44:'N/A',45:'Scattered Showers',46:'Scattered Snow',47:'Scattered T-Storms',
};

export const FALLBACK_ICON = '🌡️';

// Emoji / label for a TWC iconCode, with one fallback for unknown codes.
export function iconFor(twcCode) {
  return ICONS[twcCode] ?? FALLBACK_ICON;
}
export function labelFor(twcCode, fallback = null) {
  return LABELS[twcCode] ?? fallback;
}

// The one WMO table. Open-Meteo speaks WMO codes; the rest of the app (icons,
// labels, theme, insights) is keyed on TWC iconCodes, so every WMO code is
// translated here and takes its emoji and label from ICONS / LABELS above.
// [day, night] where the sky looks different after dark; otherwise one code.
// The iOS widget keeps a copy of the labels (it can't import); a parity test
// (widgetParity.test.js) keeps the two in step.
export const WMO_TO_TWC = {
  0:  [32, 31],  // clear sky              → Sunny / Clear
  1:  [34, 33],  // mainly clear           → Fair
  2:  [30, 29],  // partly cloudy          → Partly Cloudy
  3:  26,        // overcast               → Cloudy
  45: 20,        // fog                    → Foggy
  48: 20,        // depositing rime fog    → Foggy
  51: 9,         // drizzle: light         → Drizzle
  53: 9,         //          moderate
  55: 9,         //          dense
  56: 8,         // freezing drizzle       → Freezing Drizzle
  57: 8,
  61: 12,        // rain: slight           → Rain
  63: 12,        //       moderate
  65: 40,        //       heavy            → Heavy Rain
  66: 10,        // freezing rain          → Freezing Rain
  67: 10,
  71: 13,        // snow: slight           → Flurries
  73: 16,        //       moderate         → Snow
  75: 42,        //       heavy            → Heavy Snow
  77: 13,        // snow grains            → Flurries
  80: 39,        // rain showers: slight   → Scattered Showers
  81: 11,        //               moderate → Showers
  82: 40,        //               violent  → Heavy Rain
  85: 41,        // snow showers: slight   → Scattered Snow
  86: 42,        //               heavy    → Heavy Snow
  95: 4,         // thunderstorm           → Thunderstorms
  96: 3,         // thunderstorm with hail → Severe T-Storms
  99: 3,
};

// Unlisted codes fall back to Cloudy, a neutral default.
export function wmoToTwc(code, isDay = 1) {
  if (code == null) return null;
  const entry = WMO_TO_TWC[code] ?? 26;
  return Array.isArray(entry) ? entry[isDay ? 0 : 1] : entry;
}

// The hourly strip hides precipitation the model gives little chance of: a
// wet code under HOURLY_MIN_POP_WET shows as overcast, and a thunderstorm under
// HOURLY_MIN_POP_STORM as slight showers.
export const HOURLY_MIN_POP_WET = 30;
export const HOURLY_MIN_POP_STORM = 40;

export function hourlyDisplayCode(code, pop = 0) {
  if (code === 95 && pop < HOURLY_MIN_POP_STORM) return pop < HOURLY_MIN_POP_WET ? 3 : 80;
  if (code >= 51 && pop < HOURLY_MIN_POP_WET) return 3;
  return code;
}
