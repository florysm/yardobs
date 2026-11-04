// YardObs home screen widget for Scriptable (https://scriptable.app)
//
// Setup: in YardObs open Settings → iPhone Home Screen Widget → Copy widget
// script, paste it into a new Scriptable script, then add a Scriptable widget
// to your home screen and pick this script. Re-copy after changing your
// station, location or units in YardObs. After renewing your TWC key (or
// changing settings), YardObs' "Update installed widget" button updates this
// script in place, no pasting needed, as long as it's named "YardObs".
//
// Data is fetched directly from Weather.com (your station, with your own key)
// and Open-Meteo (conditions + today's forecast) — nothing goes through YardObs.
// If this script came from YardObs in station mode it contains your TWC API
// key: don't share it.

const CONFIG = /*YARDOBS_CONFIG*/{ "mode": "preview", "stationId": null, "twcKey": null, "keyExpires": null, "lat": null, "lon": null, "label": null, "units": "imperial", "generatedAt": 0 }/*END*/;

const APP_URL   = 'https://yardobs.app';
const CACHE_KEY = 'yardobs-widget-cache.json';
const REFRESH_MS = 15 * 60 * 1000;
const KEYCHAIN_KEY = 'yardobs-widget-config';

// ── Settings — pasted CONFIG, or a newer update saved in the Keychain ────────
function storedConfig() {
  try { return Keychain.contains(KEYCHAIN_KEY) ? JSON.parse(Keychain.get(KEYCHAIN_KEY)) : null; } catch { return null; }
}
// Whichever is newer wins, so re-pasting a fresh script overrides an older
// update and vice versa.
function effectiveConfig() {
  const stored = storedConfig();
  return stored && (stored.generatedAt ?? 0) > (CONFIG.generatedAt ?? 0) ? stored : CONFIG;
}

// Opened from YardObs via scriptable:///run/YardObs?update=1 with the new
// settings on the clipboard.
async function applyUpdateFromClipboard() {
  const alert = new Alert();
  try {
    const cfg = JSON.parse(Pasteboard.paste() || '')?.yardobsWidgetConfig;
    if (!cfg || (cfg.mode !== 'station' && cfg.mode !== 'preview')) throw new Error();
    Keychain.set(KEYCHAIN_KEY, JSON.stringify(cfg));
    Pasteboard.copy(''); // don't leave the key sitting on the clipboard
    alert.title = 'Widget updated';
    alert.message = 'Your YardObs widget will use the new settings on its next refresh.';
  } catch {
    alert.title = 'Nothing to update';
    alert.message = 'Open YardObs Settings and tap "Update installed widget" again.';
  }
  alert.addAction('OK');
  await alert.presentAlert();
}

const SETTINGS = effectiveConfig();

// Days until the TWC key's recorded expiration date (local calendar days).
function keyDaysLeft() {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(SETTINGS.keyExpires || '');
  if (SETTINGS.mode !== 'station' || !m) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - today) / 86400000);
}
// Short note shown in the last week before expiry, and after it.
function keyNote() {
  const d = keyDaysLeft();
  if (d == null || d > 7) return null;
  if (d < 0) return 'Key expired · renew in YardObs';
  return d === 0 ? 'Key expires today' : `Key expires in ${d}d`;
}

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
const metric = SETTINGS.units === 'metric';
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
    if (status === 401 || status === 403) throw new Error('TWC key rejected — it may have expired. Renew it, then tap Update installed widget in YardObs.');
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
  if (SETTINGS.mode === 'station') {
    if (!SETTINGS.stationId || !SETTINGS.twcKey) throw new Error('Re-copy the script from YardObs Settings');
    const pws = await getJSON(
      `https://api.weather.com/v2/pws/observations/current?stationId=${encodeURIComponent(SETTINGS.stationId)}` +
      `&format=json&units=e&numericPrecision=decimal&apiKey=${encodeURIComponent(SETTINGS.twcKey)}`
    );
    const obs = pws?.observations?.[0];
    if (!obs) throw new Error('No observation from station');
    // The station has no sky sensor or forecast, so Open-Meteo supplies the
    // condition icon and today's high/low/rain chance. Non-fatal if it fails.
    let om = null;
    try { om = await fetchOpenMeteo(obs.lat, obs.lon); } catch {}
    const temp = obs.imperial?.temp ?? null;
    return {
      label:      obs.neighborhood || SETTINGS.label || obs.stationID,
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

  if (SETTINGS.lat == null || SETTINGS.lon == null) throw new Error('Re-copy the script from YardObs Settings');
  const om = await fetchOpenMeteo(SETTINGS.lat, SETTINGS.lon);
  const c = om?.current;
  if (!c) throw new Error('No current conditions');
  return {
    label:      SETTINGS.label || 'Forecast',
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

// Footer line: an expired key outranks "Offline" (it's the likely reason the
// data is stale); otherwise offline status, then an upcoming-expiry note.
function statusNote(data, stale, fallback) {
  const note = keyNote();
  if (note && (keyDaysLeft() < 0 || !stale)) return note;
  if (stale) return `Offline · ${timeLabel(data.fetchedAt)}`;
  return fallback;
}

function timeLabel(ms) {
  const df = new DateFormatter();
  df.useShortTimeStyle();
  return df.string(new Date(ms));
}

// Lock Screen widgets are tiny and drawn by iOS in a single tint, so they get
// their own compact layouts and no background.
function buildAccessoryWidget(data, family, stale) {
  const w = new ListWidget();
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + REFRESH_MS);
  w.setPadding(0, 0, 0, 0);

  const cond = data ? condition(data.code, data.isDay) : null;
  const sym = cond ? SFSymbol.named(cond.symbol) : null;
  const dim = stale ? 0.6 : 1;

  if (family === 'accessoryInline') {
    // Inline shows a single line of text (plus one symbol) beside the date.
    if (sym) w.addImage(sym.image);
    addText(w, data ? `${fmtTemp(data.temp)} ${cond.label}` : 'YardObs —', Font.systemFont(12));
    return w;
  }

  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true;
    const col = w.addStack();
    col.layoutVertically();
    col.centerAlignContent();
    const iconRow = col.addStack();
    iconRow.addSpacer();
    if (sym) {
      const img = iconRow.addImage(sym.image);
      img.imageSize = new Size(16, 16);
      img.tintColor = new Color('#ffffff', dim);
    }
    iconRow.addSpacer();
    const tempRow = col.addStack();
    tempRow.addSpacer();
    addText(tempRow, data ? fmtTemp(data.temp) : '—', Font.boldSystemFont(18), dim);
    tempRow.addSpacer();
    return w;
  }

  // accessoryRectangular: three short lines. iOS draws Lock Screen widgets in
  // a single system tint over the wallpaper, so colors are out of our hands —
  // legibility comes from full-opacity text, heavier weights and a soft
  // shadow. The system's frosted panel (whose shape iOS controls) is opt-in:
  // type "panel" in the widget's Parameter field when editing it.
  const panel = /\bpanel\b/i.test(args.widgetParameter || '');
  if (panel) {
    w.addAccessoryWidgetBackground = true;
    w.setPadding(6, 10, 6, 10);
  }
  const shadowed = (t) => {
    if (!panel) {
      t.shadowColor = new Color('#000000', 0.55);
      t.shadowRadius = 3;
      t.shadowOffset = new Point(0, 1);
    }
    return t;
  };
  if (!data) {
    shadowed(addText(w, 'YardObs', Font.boldRoundedSystemFont(14)));
    shadowed(addText(w, 'Unable to load weather', Font.semiboldRoundedSystemFont(12)));
    return w;
  }
  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  if (sym) {
    const img = top.addImage(sym.image);
    img.imageSize = new Size(18, 18);
    img.tintColor = new Color('#ffffff', dim);
    top.addSpacer(4);
  }
  shadowed(addText(top, fmtTemp(data.temp), Font.boldRoundedSystemFont(20), dim));
  top.addSpacer(6);
  shadowed(addText(top, cond.label, Font.semiboldRoundedSystemFont(14), dim));
  shadowed(addText(w, `Feels ${fmtTemp(data.feelsLike)} · H ${fmtTemp(data.high)} L ${fmtTemp(data.low)}`, Font.semiboldRoundedSystemFont(13), dim));
  shadowed(addText(w, statusNote(data, stale, data.label), Font.mediumRoundedSystemFont(12), 0.9 * dim));
  return w;
}

function buildWidget(data, { stale = false, error = null } = {}) {
  const family = config.widgetFamily ?? 'medium';
  if (family.startsWith('accessory')) return buildAccessoryWidget(data, family, stale);

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
    addText(right, statusNote(data, stale, `${data.source} · ${timeLabel(data.fetchedAt)}`), Font.systemFont(10), 0.7);
  } else {
    const note = statusNote(data, stale, null);
    if (note) addText(left, note, Font.systemFont(9), 0.7);
  }

  return w;
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (args.queryParameters?.update) {
  await applyUpdateFromClipboard();
} else {
  let widget;
  try {
    const data = await loadWeather();
    writeCache(data);
    widget = buildWidget(data);
  } catch (err) {
    const cached = readCache();
    widget = buildWidget(cached, { stale: !!cached, error: keyDaysLeft() < 0 ? 'TWC key expired — renew it, then tap Update installed widget in YardObs.' : err.message });
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
}
Script.complete();
