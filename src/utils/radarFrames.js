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

// ── Clutter filter ────────────────────────────────────────────────────────────
//
// The IEM tiles are raw base reflectivity: below ~18 dBZ the speckle is mostly
// ground clutter, clear-air returns, insects and birds, not rain — the blue
// noise consumer apps hide. Both the NEXRAD and HRRR tiles are drawn in IEM's
// n0q palette, where palette entry i is (i × 0.5 − 32.5) dBZ, so a pixel's
// colour gives its dBZ exactly. RadarTab draws each tile to a canvas and clears
// the pixels below RADAR_MIN_DBZ (the tiles are served CORS-open).

export const RADAR_MIN_DBZ = 18;

// n0q palette entries 1–120 (−32 … 27.5 dBZ) as RRGGBB, in order. Only the low
// end is needed: anything not listed is at or above 28 dBZ and always kept.
const N0Q_LOW =
  '85718f85728f86738d87758b87768b887789897987897a878a7b858b7d848b7e848c7f828d81808d82808e837e8f847c' +
  '8f857c90877b918879918979928b77938d759691539894579b975b9d9a60a09d64a3a068a5a36da8a671aaa976adac7a' +
  'b0af7eb2b283b7b88cbabb90bdbe94bfc199c2c49dc4c7a2c7caa6cacdaaccd0afd2d4b4cfd2b4c9ccb4c6c9b4c3c7b4' +
  'c0c4b4bdc1b4b9beb4b6bbb4b3b9b4b0b6b4adb3b4aab0b4a4abb4a0a8b49da5b49aa2b497a0b4949db4919ab4949bb5' +
  '9098b48c95b38892b2808cb07c89af7886ae7483ac7080ab6c7daa6779a96376a85f73a75b70a6576da44f67a24b64a1' +
  '4761a0435e9f415b9e4361a24568a6486faa4a76ae4d7db24f84b6518bbb5699c3599fc75ba6cb5eadcf60b4d462bbd8' +
  '65c2dc67c9e06ad0e46fd6e868d6d759d6b352d6a24bd69043d67e3cd66d35d65b11d51811d11710cd1710c81610c416' +
  '0fbc150fb7140eb3140eaf130eab130da6120da2120d9e11';

// RGB (as an int) → dBZ, for the low end of the palette.
const LOW_DBZ = new Map();
for (let k = 0; k < N0Q_LOW.length; k += 6) {
  LOW_DBZ.set(parseInt(N0Q_LOW.slice(k, k + 6), 16), (k / 6 + 1) * 0.5 - 32.5);
}

/** dBZ for an n0q pixel colour, or null when it's above the listed low end. */
export function n0qDbz(r, g, b) {
  return LOW_DBZ.get((r << 16) | (g << 8) | b) ?? null;
}

/**
 * Clears (alpha 0) every pixel below `minDbz` in RGBA image data, in place.
 * Returns how many pixels were cleared.
 */
export function filterRadarPixels(data, minDbz = RADAR_MIN_DBZ) {
  let cleared = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0) continue;
    const dbz = n0qDbz(data[p], data[p + 1], data[p + 2]);
    if (dbz != null && dbz < minDbz) {
      data[p + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}
