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
