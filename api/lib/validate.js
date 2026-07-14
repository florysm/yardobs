// Pure request-parameter validators for the weather proxy. Each returns true
// when the value is acceptable (absent is acceptable — presence is enforced by
// the individual route cases). Side-effect-free so they're unit-testable without
// importing the handler, which starts a setInterval at module load.

export function validCoords(lat, lon) {
  if (lat === undefined && lon === undefined) return true;
  const latN = Number(lat), lonN = Number(lon);
  return Number.isFinite(latN) && Number.isFinite(lonN)
    && latN >= -90 && latN <= 90 && lonN >= -180 && lonN <= 180;
}

export function validStationId(stationId) {
  return stationId === undefined || /^[A-Za-z0-9._-]+$/.test(stationId);
}

export function validDate(date) {
  return date === undefined || /^\d{8}$/.test(date);
}
