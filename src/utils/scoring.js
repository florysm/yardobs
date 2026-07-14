import { toISODate } from './dateUtils';
import { formatTemp, formatWind, formatPrecipRate } from './units';
import { ACTIVITIES } from './activities';

// Activity-scoring engine — extracted from ActivityScoreCard so the pure logic
// is unit-testable. The component imports these; it keeps only its React/fetch
// code. All temperatures/speeds/rates are imperial internally (see units.js).

export function isNotableWeatherChange(stored, current) {
  const c = stored.conditions;
  if (!c) return true;
  const tempChanged  = Math.abs((current.temp      ?? 70) - (c.temp      ?? 70)) > 10;
  const windChanged  = Math.abs((current.windSpeed ?? 0)  - (c.windSpeed ?? 0))  > 5;
  const rainChanged  = (current.rainThreat >= 0.3) !== (c.rainThreat >= 0.3);
  const scoreChanged = Math.abs(current.score - c.score) > 10;
  return tempChanged || windChanged || rainChanged || scoreChanged;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

export function clamp(v) { return Math.max(0, Math.min(100, v)); }

// Piecewise-linear interpolation over sorted [x, y] control points
export function pw(x, pts) {
  if (x == null) return 60;
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i][0] && x <= pts[i + 1][0]) {
      const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + t * (pts[i + 1][1] - pts[i][1]);
    }
  }
  return 60;
}

const PRECIP_STD  = [[0, 100], [0.01, 85], [0.05, 55], [0.1, 25],  [0.3,  5]];
const PRECIP_SPORT= [[0, 100], [0.01, 80], [0.05, 45], [0.1, 15],  [0.3,  5]];
const PRECIP_DOG  = [[0, 100], [0.01, 85], [0.05, 65], [0.1, 35],  [0.3, 10]];
const AQI_CURVE   = [[0, 100], [50, 100],  [100, 80],  [150, 45],  [200, 15], [300, 5]];

// Factor definitions keyed by activity id.
// fn(current) → raw score 0–100; raw(current, units) → display string
const FACTOR_DEFS = {
  bbq: [
    {
      name: 'Temperature', weight: 0.30,
      fn:  c => pw(c.temp,      [[32,5],[45,30],[55,75],[65,100],[85,100],[92,75],[100,40],[110,10]]),
      raw: (c, units) => c.temp != null ? formatTemp(c.temp, units) : '—',
    },
    {
      name: 'Wind',        weight: 0.30,
      fn:  c => pw(c.windSpeed, [[0,100],[8,100],[12,80],[18,55],[25,25],[35,5]]),
      raw: (c, units) => c.windSpeed != null ? formatWind(c.windSpeed, units) : '—',
    },
    {
      name: 'Humidity',    weight: 0.20,
      fn:  c => pw(c.humidity,  [[10,55],[35,80],[45,100],[70,100],[80,65],[90,30],[100,10]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Precipitation', weight: 0.20,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_STD),
      raw: (c, units) => (c.precipRate ?? 0) > 0
        ? formatPrecipRate(c.precipRate, units)
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : formatPrecipRate(0, units),
    },
  ],
  garden: [
    {
      name: 'Temperature', weight: 0.25,
      fn:  c => pw(c.temp,      [[35,10],[50,45],[60,85],[72,100],[80,100],[88,65],[96,30],[105,5]]),
      raw: (c, units) => c.temp != null ? formatTemp(c.temp, units) : '—',
    },
    {
      name: 'UV Index',    weight: 0.15,
      fn:  c => pw(c.uv ?? 0,   [[0,100],[3,100],[6,80],[8,55],[10,30],[13,10]]),
      raw: c => c.uv != null ? `UV ${c.uv}` : '—',
    },
    {
      name: 'Humidity',    weight: 0.20,
      fn:  c => pw(c.humidity,  [[15,40],[35,80],[45,100],[65,100],[78,65],[88,30],[100,10]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Wind',        weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,90],[10,100],[18,80],[25,55],[35,20]]),
      raw: (c, units) => c.windSpeed != null ? formatWind(c.windSpeed, units) : '—',
    },
    {
      name: 'Precipitation', weight: 0.15,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_STD),
      raw: (c, units) => (c.precipRate ?? 0) > 0
        ? formatPrecipRate(c.precipRate, units)
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : formatPrecipRate(0, units),
    },
    {
      name: 'Air Quality', weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
  sports: [
    {
      name: 'Temperature', weight: 0.30,
      fn:  c => pw(c.temp,      [[40,10],[55,45],[62,85],[68,100],[75,100],[82,70],[88,40],[95,10]]),
      raw: (c, units) => c.temp != null ? formatTemp(c.temp, units) : '—',
    },
    {
      name: 'Humidity',    weight: 0.25,
      fn:  c => pw(c.humidity,  [[10,70],[30,95],[45,100],[55,90],[65,70],[75,40],[85,15],[100,5]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Wind',        weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,80],[8,100],[15,85],[22,55],[30,25],[40,5]]),
      raw: (c, units) => c.windSpeed != null ? formatWind(c.windSpeed, units) : '—',
    },
    {
      name: 'Precipitation', weight: 0.20,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_SPORT),
      raw: (c, units) => (c.precipRate ?? 0) > 0
        ? formatPrecipRate(c.precipRate, units)
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : formatPrecipRate(0, units),
    },
    {
      name: 'Air Quality', weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
  leisure: [
    {
      name: 'Temperature', weight: 0.35,
      fn:  c => pw(c.temp,      [[45,15],[58,50],[65,85],[70,100],[82,100],[88,70],[95,30],[103,5]]),
      raw: (c, units) => c.temp != null ? formatTemp(c.temp, units) : '—',
    },
    {
      name: 'Humidity',    weight: 0.25,
      fn:  c => pw(c.humidity,  [[15,60],[35,90],[45,100],[60,100],[70,75],[80,45],[90,15]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Wind',        weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,85],[8,100],[15,80],[22,55],[30,20]]),
      raw: (c, units) => c.windSpeed != null ? formatWind(c.windSpeed, units) : '—',
    },
    {
      name: 'Precipitation', weight: 0.15,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_STD),
      raw: (c, units) => (c.precipRate ?? 0) > 0
        ? formatPrecipRate(c.precipRate, units)
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : formatPrecipRate(0, units),
    },
    {
      name: 'Air Quality', weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
  dogwalk: [
    {
      name: 'Heat Index',     weight: 0.40,
      fn:  c => {
        const hi = c.feelsLike ?? c.temp ?? 70;
        return pw(hi, [[32,5],[45,30],[55,75],[68,100],[75,80],[80,50],[85,20],[92,5]]);
      },
      raw: (c, units) => {
        const v = c.feelsLike ?? c.temp;
        return v != null ? formatTemp(v, units) : '—';
      },
    },
    {
      name: 'Wind (Cooling)', weight: 0.15,
      fn:  c => pw(c.windSpeed, [[0,60],[5,80],[12,100],[20,90],[28,65],[38,30]]),
      raw: (c, units) => c.windSpeed != null ? formatWind(c.windSpeed, units) : '—',
    },
    {
      name: 'Humidity',       weight: 0.20,
      fn:  c => pw(c.humidity,  [[10,60],[30,90],[45,100],[55,85],[65,55],[75,25],[85,5]]),
      raw: c => c.humidity != null ? `${Math.round(c.humidity)}%` : '—',
    },
    {
      name: 'Precipitation',   weight: 0.15,
      fn:  c => pw(c.rainThreat ?? c.precipRate ?? 0, PRECIP_DOG),
      raw: (c, units) => (c.precipRate ?? 0) > 0
        ? formatPrecipRate(c.precipRate, units)
        : (c.forecastMaxProb ?? 0) >= 20 ? `${c.forecastMaxProb}% fcst` : formatPrecipRate(0, units),
    },
    {
      name: 'Air Quality',    weight: 0.10,
      fn:  c => pw(c.aqi ?? null, AQI_CURVE),
      raw: c => c.aqi != null ? `AQI ${Math.round(c.aqi)}` : '—',
    },
  ],
};

export function computeScore(actId, current, units) {
  if (!current) return { score: 0, factors: [], pavementTemp: null };
  const defs = FACTOR_DEFS[actId];
  let total = 0;
  const factors = defs.map(f => {
    const s = Math.round(clamp(f.fn(current)));
    total += s * f.weight;
    return { name: f.name, score: s, raw: f.raw(current, units) };
  });
  const score = Math.round(clamp(total));

  let pavementTemp = null;
  if (actId === 'dogwalk' && current.temp != null) {
    // Direct-sun pavement: air temp + 40–60°F. Use UV as proxy for sun intensity.
    // Always computed/stored in imperial (°F) internally — see units.js for display conversion.
    const sunOffset = (current.uv ?? 0) >= 3 ? 50 : 20;
    pavementTemp = Math.round(current.temp + sunOffset);
  }
  return { score, factors, pavementTemp };
}

export function computeAllScores(current, units) {
  return Object.fromEntries(ACTIVITIES.map(a => [a.id, computeScore(a.id, current, units)]));
}

// ── Arc helpers ───────────────────────────────────────────────────────────────

export function precipProbToRate(prob) {
  if (prob < 20) return 0;
  if (prob < 50) return 0.01;
  if (prob < 75) return 0.05;
  return 0.1;
}

export function getForecastRainThreat(hf) {
  if (!hf?.hourly?.time) return { rate: 0, maxProb: 0 };
  const today = toISODate();
  let maxProb = 0;
  hf.hourly.time.forEach((t, i) => {
    if (!t.startsWith(today)) return;
    const prob = hf.hourly.precipitation_probability?.[i] ?? 0;
    if (prob > maxProb) maxProb = prob;
  });
  return { rate: precipProbToRate(maxProb), maxProb };
}

export function getRainyHourWindow(hf) {
  if (!hf?.hourly?.time) return { firstRainyHour: null, lastRainyHour: null };
  const today = toISODate();
  let first = null, last = null;
  hf.hourly.time.forEach((t, i) => {
    if (!t.startsWith(today)) return;
    const prob = hf.hourly.precipitation_probability?.[i] ?? 0;
    if (prob < 50) return;
    const hour = parseInt(t.split('T')[1], 10);
    if (first === null) first = hour;
    last = hour;
  });
  return { firstRainyHour: first, lastRainyHour: last };
}

export function getArcData(hf, actId, current) {
  if (!hf?.hourly?.time) return [];
  const today = toISODate();
  const result = [];
  hf.hourly.time.forEach((t, i) => {
    const [date, timeStr] = t.split('T');
    if (date !== today) return;
    const hour = parseInt(timeStr, 10);
    if (hour < 7 || hour > 18) return;
    const cHour = {
      temp:       hf.hourly.temperature_2m?.[i]          ?? current?.temp      ?? 70,
      feelsLike:  hf.hourly.apparent_temperature?.[i]    ?? null,
      humidity:   hf.hourly.relative_humidity_2m?.[i]    ?? current?.humidity  ?? 50,
      windSpeed:  hf.hourly.wind_speed_10m?.[i]          ?? current?.windSpeed ?? 0,
      windGust:   hf.hourly.wind_gusts_10m?.[i]          ?? null,
      precipRate: precipProbToRate(hf.hourly.precipitation_probability?.[i] ?? 0),
      uv:         hf.hourly.uv_index?.[i]                ?? 0,
      aqi:        current?.aqi                           ?? null,
    };
    const { score } = computeScore(actId, cHour);
    result.push({ hour, score });
  });
  return result;
}

export function getBestWindow(arcData) {
  if (arcData.length < 3) return null;
  let bi = 0, best = 0;
  for (let i = 0; i <= arcData.length - 3; i++) {
    const avg = (arcData[i].score + arcData[i + 1].score + arcData[i + 2].score) / 3;
    if (avg > best) { best = avg; bi = i; }
  }
  const s = arcData[bi].hour;
  const e = arcData[Math.min(bi + 2, arcData.length - 1)].hour + 1;
  // Format: "Peak 2–5 PM"
  function label(h) {
    const p = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12} ${p}`;
  }
  return `Peak ${label(s)}–${label(e)}`;
}

// ── Insight splitting ─────────────────────────────────────────────────────────

// Matches up to the first sentence-ending punctuation that is followed by
// whitespace + uppercase (new sentence) or end of string. Avoids splitting on
// abbreviations like "N.E." or decimal numbers mid-sentence.
export function firstSentence(text) {
  if (!text) return null;
  const m = text.match(/^.+?[.!?](?=\s+[A-Z]|$)/);
  return m ? m[0] : text;
}

export function restOfInsight(text) {
  if (!text) return null;
  const first = firstSentence(text);
  if (!first || first.length >= text.length) return null;
  return text.slice(first.length).trim() || null;
}

// ── Color & verdict ───────────────────────────────────────────────────────────

export function scoreColor(s) {
  if (s >= 65) return 'var(--delta-up)';
  if (s >= 50) return 'var(--score-marginal)';
  return 'var(--delta-dn)';
}

export function scoreVerdict(s) {
  if (s >= 80) return 'Excellent conditions';
  if (s >= 65) return 'Good conditions today';
  if (s >= 50) return 'Marginal conditions';
  return 'Poor conditions today';
}
