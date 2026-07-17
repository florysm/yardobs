export const INSIGHT_TTL_MS = 60 * 60 * 1000; // 1 hour

export const STORAGE_KEYS = {
  PROFILE:          'yardobs-profile',
  MODE:             'yardobs-mode',
STATION_ID:       'yardobs-station-id',
  TWC_API_KEY:      'yardobs-twc-key',
  DEFAULT_ACTIVITY: 'yardobs-default-activity',
  UNITS:            'yardobs-units',
  insightKey: (stationId, today, period, units) => `yardobs-insight-${stationId}-${today}-${period}-${units}`,
  activityInsightKey: (stationId, activityId, period, units) => `yardobs-activity-insight-${stationId}-${activityId}-${period}-${units}`,
  // aqiBucket participates so a day whose air quality changes category doesn't
  // serve a stale narrative for the full hour of TTL — an insight that called an
  // unhealthy day "ideal to be outside" is the one you least want cached.
  forecastDayInsightKey: (stationId, date, units, aqiBucket = 'na') =>
    `yardobs-fcday-insight-${stationId}-${date}-${units}-aq${aqiBucket}`,
};
