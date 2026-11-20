export const INSIGHT_TTL_MS = 60 * 60 * 1000; // 1 hour

// Day-part names contain spaces ("early morning"); keep keys space-free.
const slug = s => String(s).replace(/\s+/g, '-');

export const STORAGE_KEYS = {
  PROFILE:          'yardobs-profile',
  MODE:             'yardobs-mode',
  STATION_ID:       'yardobs-station-id',
  TWC_API_KEY:      'yardobs-twc-key',
  TWC_KEY_EXPIRES:  'yardobs-twc-key-expires',
  DEFAULT_ACTIVITY: 'yardobs-default-activity',
  UNITS:            'yardobs-units',
  RADAR_RANGE:      'yardobs-radar-range',
  DASHBOARD:        'yardobs-dashboard',
  DASHBOARD_SIZE:   'yardobs-dashboard-size',
  SETUP_LINK_USED:  'yardobs-setup-link-used',
  insightKey: (stationId, today, period, units) => `yardobs-insight-${stationId}-${today}-${slug(period)}-${units}`,
  activityInsightKey: (stationId, activityId, period, units) => `yardobs-activity-insight-${stationId}-${activityId}-${slug(period)}-${units}`,
  // aqiBucket participates so a day whose air quality changes category doesn't
  // serve a stale narrative for the full hour of TTL — an insight that called an
  // unhealthy day "ideal to be outside" is the one you least want cached.
  //
  // `part` is the current day part for today and 'day' for every other day, so
  // today's "rest of the day" narrative regenerates as each part passes while
  // future days stay a stable overview.
  forecastDayInsightKey: (stationId, date, units, aqiBucket = 'na', part = 'day') =>
    `yardobs-fcday-insight-${stationId}-${date}-${units}-aq${aqiBucket}-${slug(part)}`,
};

// localStorage can throw (private browsing, blocked site data) and returns null
// for a missing key. Every read and write goes through these two so a storage
// failure only ever means "not saved".

// The stored string for `key`, or `fallback` when it is missing, empty or unreadable.
export function readStored(key, fallback = null) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

// Saves `value` under `key`; null, undefined or '' removes the key instead.
export function writeStored(key, value) {
  try {
    if (value == null || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage full or unavailable: the setting just isn't saved */ }
}
