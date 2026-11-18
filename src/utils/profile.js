// The saved profile's two modes, and the checks every component makes on it.
//   station — a TWC Personal Weather Station owner (stationId + key)
//   preview — no station; a chosen location served by Open-Meteo
// A station profile can carry `exploring` ({ lat, lon, label }): a temporary
// look at another location, served like preview until it is cleared.
export const PROFILE_MODES = Object.freeze({ STATION: 'station', PREVIEW: 'preview' });

export const isStationProfile = p => p?.mode === PROFILE_MODES.STATION;
export const isPreviewProfile = p => p?.mode === PROFILE_MODES.PREVIEW;
export const isExploring      = p => isStationProfile(p) && !!p?.exploring;
