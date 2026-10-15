// Frame planning for the radar tab. Everything here is pure: given "now" it
// returns the tile URLs and valid times for the animation, so there's no
// manifest fetch and the logic is unit-testable.
//
// Source: Iowa Environmental Mesonet tile cache (keyless, CORS-open).
//   - Observed: NEXRAD base-reflectivity composite, `-mNNm` = NN minutes ago.
//   - Forecast: HRRR simulated reflectivity. `F####` is minutes after the
//     model run's initialization time (multiples of 15), and the run must be
//     named explicitly (YYYYMMDDHH00) because "latest" caches poorly.

const IEM_TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0';

const MIN = 60;
const PAST_STEP_MIN = 5;
const PAST_SPAN_MIN = 55;     // IEM keeps -m05m … -m55m

// Forecast range options. Longer ranges use coarser steps so the number of
// preloaded tile layers stays roughly constant (HRRR serves up to 18h from the
// run's init time; the longest range here peaks near 14.5h with the run lag).
// Steps must be multiples of 15 and divide an hour evenly or are whole hours.
export const RADAR_RANGES = {
  '2h':  { hours: 2,  stepMin: 15 },
  '6h':  { hours: 6,  stepMin: 30 },
  '12h': { hours: 12, stepMin: 60 },
};
export const DEFAULT_RADAR_RANGE = '2h';
// HRRR runs hourly and appears on IEM roughly an hour after init. Back off this
// far before flooring to the hour so the chosen run is always available.
const HRRR_RUN_LAG_MIN = 90;

// Contiguous US plus Alaska, Hawaii, Puerto Rico/USVI, Guam. Coarse boxes, only
// used to decide whether to offer radar at all.
const COVERAGE_BOXES = [
  { latMin: 24,   latMax: 50,   lonMin: -125,   lonMax: -66 },    // CONUS
  { latMin: 51,   latMax: 72,   lonMin: -170,   lonMax: -129 },   // Alaska
  { latMin: 18.5, latMax: 22.5, lonMin: -161,   lonMax: -154.5 }, // Hawaii
  { latMin: 17.5, latMax: 19,   lonMin: -68,    lonMax: -64 },    // PR / USVI
  { latMin: 13,   latMax: 14,   lonMin: 144,    lonMax: 145.5 },  // Guam
];

export function hasRadarCoverage(lat, lon) {
  if (lat == null || lon == null) return false;
  return COVERAGE_BOXES.some(b =>
    lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax);
}

const floorTo = (sec, stepMin) => Math.floor(sec / (stepMin * MIN)) * stepMin * MIN;
const pad = (n, w) => String(n).padStart(w, '0');

function runStamp(unixSec) {
  const d = new Date(unixSec * 1000);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}${pad(d.getUTCHours(), 2)}00`;
}

// Returns { frames, pastCount }. Each frame: { url, time (unix sec), projected }.
// Past frames run oldest → newest, then forecast frames follow. Tile URLs keep
// the {z}/{x}/{y} placeholders for Leaflet.
export function buildRadarFrames(nowMs = Date.now(), range = DEFAULT_RADAR_RANGE) {
  const { hours, stepMin } = RADAR_RANGES[range] ?? RADAR_RANGES[DEFAULT_RADAR_RANGE];
  const nowSec = Math.floor(nowMs / 1000);
  const latestObserved = floorTo(nowSec, PAST_STEP_MIN);

  const frames = [];
  for (let ago = PAST_SPAN_MIN; ago >= 0; ago -= PAST_STEP_MIN) {
    const layer = ago === 0
      ? 'nexrad-n0q-900913'
      : `nexrad-n0q-900913-m${pad(ago, 2)}m`;
    frames.push({
      url: `${IEM_TILE_BASE}/${layer}/{z}/{x}/{y}.png`,
      time: latestObserved - ago * MIN,
      projected: false,
    });
  }
  const pastCount = frames.length;

  const runInit = floorTo(nowSec - HRRR_RUN_LAG_MIN * MIN, 60);
  const stamp = runStamp(runInit);
  const firstTarget = floorTo(nowSec, stepMin);
  for (let ahead = stepMin; ahead <= hours * 60; ahead += stepMin) {
    const time = firstTarget + ahead * MIN;
    const offsetMin = Math.round((time - runInit) / MIN);
    frames.push({
      url: `${IEM_TILE_BASE}/hrrr::REFD-F${pad(offsetMin, 4)}-${stamp}/{z}/{x}/{y}.png`,
      time,
      projected: true,
    });
  }

  return { frames, pastCount };
}
