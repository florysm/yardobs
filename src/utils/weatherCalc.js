const BEAUFORT_THRESHOLDS = [1, 4, 8, 13, 19, 25, 32, 39, 47, 55, 64, 73];
const BEAUFORT_NAMES = ['Calm', 'Light Air', 'Light Breeze', 'Gentle Breeze', 'Moderate Breeze',
  'Fresh Breeze', 'Strong Breeze', 'Near Gale', 'Gale', 'Severe Gale', 'Storm', 'Violent Storm', 'Hurricane'];

export function beaufort(mph) {
  if (mph == null) return '—';
  const scale = BEAUFORT_THRESHOLDS.findIndex(v => mph < v);
  const n = scale === -1 ? 12 : scale;
  return `${n} · ${BEAUFORT_NAMES[n]}`;
}

// NWS Rothfusz heat index (°F) — valid when T >= 80°F and RH >= 40%
// NWS wind chill (°F) — valid when T <= 50°F and wind >= 3 mph
export function calcFeelsLike(tempF, humidity, windMph) {
  if (tempF == null) return null;
  const T = tempF;
  const RH = humidity ?? 0;
  const V = windMph ?? 0;

  if (T >= 80 && RH >= 40) {
    const hi =
      -42.379 +
      2.04901523 * T +
      10.14333127 * RH -
      0.22475541 * T * RH -
      0.00683783 * T * T -
      0.05391553 * RH * RH +
      0.00122874 * T * T * RH +
      0.00085282 * T * RH * RH -
      0.00000199 * T * T * RH * RH;
    return Math.round(hi);
  }

  if (T <= 50 && V >= 3) {
    const wc = 35.74 + 0.6215 * T - 35.75 * Math.pow(V, 0.16) + 0.4275 * T * Math.pow(V, 0.16);
    return Math.round(wc);
  }

  return Math.round(T);
}
