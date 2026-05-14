export function fmt(val, digits = 0) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(digits);
}

const COMPASS_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

export function degreesToCompass(deg) {
  if (deg == null) return '';
  return COMPASS_DIRS[Math.round(deg / 22.5) % 16];
}
