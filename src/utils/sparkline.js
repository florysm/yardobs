// Points for an SVG <polyline> drawing `values` across a width×height box,
// lowest value at the bottom. Missing values are skipped; '' when there's
// nothing to draw.
export function sparklinePoints(values, width, height, pad = 3) {
  const v = (values ?? []).filter(x => x != null && !isNaN(x));
  if (v.length < 2) return '';
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  return v.map((x, i) => {
    const px = (i / (v.length - 1)) * width;
    const py = pad + (1 - (x - min) / span) * (height - 2 * pad);
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');
}
