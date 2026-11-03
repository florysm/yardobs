// YardObs home screen widget for Scriptable (https://scriptable.app)
//
// Setup: in YardObs open Settings → iPhone Home Screen Widget → Copy widget
// script, paste it into a new Scriptable script, then add a Scriptable widget
// to your home screen and pick this script. Re-copy after changing your
// station, location or units in YardObs.
//
// Data is fetched directly from Weather.com (your station, with your own key)
// and Open-Meteo (conditions + today's forecast) — nothing goes through YardObs.
// If this script came from YardObs in station mode it contains your TWC API
// key: don't share it.

const CONFIG = /*YARDOBS_CONFIG*/{ "mode": "preview", "stationId": null, "twcKey": null, "lat": null, "lon": null, "label": null, "units": "imperial" }/*END*/;

const APP_URL   = 'https://yardobs.app';
const CACHE_KEY = 'yardobs-widget-cache.json';
const REFRESH_MS = 15 * 60 * 1000;

// ── Conditions: WMO weather code → label, SF Symbol, background ──────────────
function condition(code, isDay) {
  const c = code ?? 0;
  if (c === 0)              return { label: 'Clear',         symbol: isDay ? 'sun.max.fill' : 'moon.stars.fill', sky: 'clear' };
  if (c <= 2)               return { label: 'Partly Cloudy', symbol: isDay ? 'cloud.sun.fill' : 'cloud.moon.fill', sky: 'clear' };
  if (c === 3)              return { label: 'Cloudy',        symbol: 'cloud.fill', sky: 'cloudy' };
  if (c === 45 || c === 48) return { label: 'Fog',           symbol: 'cloud.fog.fill', sky: 'cloudy' };
  if (c >= 51 && c <= 57)   return { label: 'Drizzle',       symbol: 'cloud.drizzle.fill', sky: 'rain' };
  if (c === 65 || c === 82) return { label: 'Heavy Rain',    symbol: 'cloud.heavyrain.fill', sky: 'rain' };
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 81)) return { label: 'Rain', symbol: 'cloud.rain.fill', sky: 'rain' };
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { label: 'Snow', symbol: 'cloud.snow.fill', sky: 'snow' };
  if (c >= 95)              return { label: 'Thunderstorm',  symbol: 'cloud.bolt.rain.fill', sky: 'storm' };
  return { label: '—', symbol: 'cloud.fill', sky: 'cloudy' };
}

const SKY_GRADIENTS = {
  clear:  ['#4a90d9', '#2b6cb0'],
  cloudy: ['#7b8794', '#52606d'],
  rain:   ['#4a5568', '#2d3748'],
  snow:   ['#90a4b8', '#5f7387'],
  storm:  ['#44337a', '#1a202c'],
  night:  ['#1e2a4a', '#0b1020'],
};

// ── Units — everything is fetched imperial and converted for display ─────────
const metric = CONFIG.units === 'metric';
const fmtTemp = (f) => f == null ? '—' : `${Math.round(metric ? (f - 32) * 5 / 9 : f)}°`;
const fmtWind = (mph) => mph == null ? '—' : `${Math.round(metric ? mph * 1.609344 : mph)} ${metric ? 'km/h' : 'mph'}`;

// NWS heat index / wind chill (°F) — same formula as src/utils/weatherCalc.js
function calcFeelsLike(T, RH, V) {
  if (T == null) return null;
  RH = RH ?? 0; V = V ?? 0;
  if (T >= 80 && RH >= 40) {
    return Math.round(-42.379 + 2.04901523 * T + 10.14333127 * RH - 0.22475541 * T * RH
      - 0.00683783 * T * T - 0.05391553 * RH * RH + 0.00122874 * T * T * RH
      + 0.00085282 * T * RH * RH - 0.00000199 * T * T * RH * RH);
  }
  if (T <= 50 && V >= 3) {
    return Math.round(35.74 + 0.6215 * T - 35.75 * Math.pow(V, 0.16) + 0.4275 * T * Math.pow(V, 0.16));
  }
  return Math.round(T);
}

// ── Fetching ──────────────────────────────────────────────────────────────────
async function getJSON(url) {
  const req = new Request(url);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  const status = req.response?.statusCode;
  if (status && status >= 400) {
    if (status === 401 || status === 403) throw new Error('Check your TWC API key');
    if (status === 204 || status === 404) throw new Error('Station not found');
    throw new Error(`Weather service error (${status})`);
  }
  return data;
}

async function fetchOpenMeteo(lat, lon) {
  return getJSON(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1` +
    `&temperature_unit=fahrenheit&windspeed_unit=mph&timezone=auto`
  );
}

async function loadWeather() {
  if (CONFIG.mode === 'station') {
    if (!CONFIG.stationId || !CONFIG.twcKey) throw new Error('Re-copy the script from YardObs Settings');
    const pws = await getJSON(
      `https://api.weather.com/v2/pws/observations/current?stationId=${encodeURIComponent(CONFIG.stationId)}` +
      `&format=json&units=e&numericPrecision=decimal&apiKey=${encodeURIComponent(CONFIG.twcKey)}`
    );
    const obs = pws?.observations?.[0];
    if (!obs) throw new Error('No observation from station');
    // The station has no sky sensor or forecast, so Open-Meteo supplies the
    // condition icon and today's high/low/rain chance. Non-fatal if it fails.
    let om = null;
    try { om = await fetchOpenMeteo(obs.lat, obs.lon); } catch {}
    const temp = obs.imperial?.temp ?? null;
    return {
      label:      obs.neighborhood || CONFIG.label || obs.stationID,
      source:     'Your Station',
      temp,
      feelsLike:  calcFeelsLike(temp, obs.humidity, obs.imperial?.windSpeed),
      humidity:   obs.humidity ?? null,
      windSpeed:  obs.imperial?.windSpeed ?? null,
      windGust:   obs.imperial?.windGust ?? null,
      code:       om?.current?.weather_code ?? null,
      isDay:      om?.current?.is_day ?? 1,
      high:       om?.daily?.temperature_2m_max?.[0] ?? null,
      low:        om?.daily?.temperature_2m_min?.[0] ?? null,
      rainChance: om?.daily?.precipitation_probability_max?.[0] ?? null,
      fetchedAt:  Date.now(),
    };
  }

  if (CONFIG.lat == null || CONFIG.lon == null) throw new Error('Re-copy the script from YardObs Settings');
  const om = await fetchOpenMeteo(CONFIG.lat, CONFIG.lon);
  const c = om?.current;
  if (!c) throw new Error('No current conditions');
  return {
    label:      CONFIG.label || 'Forecast',
    source:     'Forecast',
    temp:       c.temperature_2m ?? null,
    feelsLike:  c.apparent_temperature ?? null,
    humidity:   c.relative_humidity_2m ?? null,
    windSpeed:  c.wind_speed_10m ?? null,
    windGust:   c.wind_gusts_10m ?? null,
    code:       c.weather_code ?? null,
    isDay:      c.is_day ?? 1,
    high:       om.daily?.temperature_2m_max?.[0] ?? null,
    low:        om.daily?.temperature_2m_min?.[0] ?? null,
    rainChance: om.daily?.precipitation_probability_max?.[0] ?? null,
    fetchedAt:  Date.now(),
  };
}

// ── Cache — last good payload, shown when offline ─────────────────────────────
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_KEY);

function readCache() {
  try { return fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : null; } catch { return null; }
}
function writeCache(data) {
  try { fm.writeString(cachePath, JSON.stringify(data)); } catch {}
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function addText(stack, text, font, opacity = 1) {
  const t = stack.addText(text);
  t.font = font;
  t.textColor = new Color('#ffffff', opacity);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function timeLabel(ms) {
  const df = new DateFormatter();
  df.useShortTimeStyle();
  return df.string(new Date(ms));
}

function buildWidget(data, { stale = false, error = null } = {}) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MS);
  w.setPadding(14, 14, 14, 14);

  if (!data) {
    const g = new LinearGradient();
    g.colors = SKY_GRADIENTS.cloudy.map(c => new Color(c));
    g.locations = [0, 1];
    w.backgroundGradient = g;
    addText(w, 'YardObs', Font.boldSystemFont(14));
    w.addSpacer(6);
    addText(w, error || 'Unable to load weather', Font.systemFont(12), 0.85).lineLimit = 3;
    return w;
  }

  const cond = condition(data.code, data.isDay);
  const g = new LinearGradient();
  g.colors = SKY_GRADIENTS[data.isDay ? cond.sky : 'night'].map(c => new Color(c));
  g.locations = [0, 1];
  w.backgroundGradient = g;

  const family = config.widgetFamily ?? 'medium';
  const dim = stale ? 0.6 : 1;

  const main = w.addStack();
  main.layoutHorizontally();

  // Left column: location, temp, condition, feels-like / H-L
  const left = main.addStack();
  left.layoutVertically();
  addText(left, data.label, Font.semiboldSystemFont(12), 0.9 * dim);
  left.addSpacer(2);
  const top = left.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  addText(top, fmtTemp(data.temp), Font.boldSystemFont(family === 'small' ? 38 : 42), dim);
  top.addSpacer(6);
  const sym = SFSymbol.named(cond.symbol);
  if (sym) {
    sym.applyFont(Font.systemFont(24));
    const img = top.addImage(sym.image);
    img.imageSize = new Size(26, 26);
    img.tintColor = new Color('#ffffff', dim);
  }
  addText(left, cond.label, Font.mediumSystemFont(12), 0.9 * dim);
  left.addSpacer();
  addText(left, `Feels ${fmtTemp(data.feelsLike)}`, Font.systemFont(11), 0.8 * dim);
  addText(left, `H ${fmtTemp(data.high)}  L ${fmtTemp(data.low)}`, Font.systemFont(11), 0.8 * dim);

  if (family !== 'small') {
    main.addSpacer();
    const right = main.addStack();
    right.layoutVertically();
    const rows = [
      ['wind', data.windGust != null && data.windGust > (data.windSpeed ?? 0)
        ? `${fmtWind(data.windSpeed)} · G ${fmtWind(data.windGust).split(' ')[0]}`
        : fmtWind(data.windSpeed)],
      ['humidity.fill', data.humidity == null ? '—' : `${Math.round(data.humidity)}%`],
      ['umbrella.fill', data.rainChance == null ? '—' : `${Math.round(data.rainChance)}%`],
    ];
    for (const [symbol, value] of rows) {
      const row = right.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      const s = SFSymbol.named(symbol);
      if (s) {
        const i = row.addImage(s.image);
        i.imageSize = new Size(13, 13);
        i.tintColor = new Color('#ffffff', 0.8 * dim);
      }
      row.addSpacer(6);
      addText(row, value, Font.mediumSystemFont(12), dim);
      right.addSpacer(6);
    }
    right.addSpacer();
    addText(right, stale ? `Offline · ${timeLabel(data.fetchedAt)}` : `${data.source} · ${timeLabel(data.fetchedAt)}`,
      Font.systemFont(10), 0.7);
  } else if (stale) {
    addText(left, `Offline · ${timeLabel(data.fetchedAt)}`, Font.systemFont(9), 0.7);
  }

  return w;
}

// ── Main ──────────────────────────────────────────────────────────────────────
let widget;
try {
  const data = await loadWeather();
  writeCache(data);
  widget = buildWidget(data);
} catch (err) {
  const cached = readCache();
  widget = buildWidget(cached, { stale: !!cached, error: err.message });
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
