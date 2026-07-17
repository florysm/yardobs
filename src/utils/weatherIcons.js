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

// ICONS and ICON_EMOJI are identical — ICON_EMOJI is an alias kept for
// ForecastTab readability where emoji-only lookup is the intent.
export const ICON_EMOJI = ICONS;

export const WMO_EMOJI = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌧️', 55:'🌧️', 56:'🌧️', 57:'🌧️',
  61:'🌦️', 63:'🌧️', 65:'🌧️', 66:'🌧️', 67:'🌧️',
  71:'🌨️', 73:'🌨️', 75:'❄️', 77:'❄️',
  80:'🌦️', 81:'🌧️', 82:'🌧️', 85:'🌨️', 86:'❄️',
  95:'⛈️', 96:'⛈️', 99:'⛈️',
};

export const NIGHT_ICON = { 0: '🌙', 1: '🌙', 2: '☁️' };

// Open-Meteo speaks WMO codes; the rest of the app is keyed on TWC iconCodes
// (ICONS / LABELS above). Lives here rather than in useWeather so the forecast
// normalizer can reach it too.
export function wmoToTwc(code, isDay = 1) {
  if (code == null) return null;
  if (code === 0) return isDay ? 32 : 31;   // Clear sky → Sunny (day) / Clear (night)
  if (code <= 2) return isDay ? 34 : 33;    // Mainly/partly clear → Fair (day/night)
  if (code === 3) return 26;     // Overcast → cloudy
  if (code <= 48) return 20;     // Fog/rime fog → haze
  if (code <= 55) return 9;      // Drizzle → light rain
  if (code <= 65) return 12;     // Rain → rain
  if (code <= 67) return 10;     // Freezing rain
  if (code <= 77) return 16;     // Snow / snow grains
  if (code <= 82) return 40;     // Rain showers → heavy showers
  if (code <= 86) return 46;     // Snow showers
  if (code >= 95) return 4;      // Thunderstorm (95/96/99)
  return 26;                      // Unmapped code → cloudy (neutral default)
}
