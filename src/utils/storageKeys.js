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
  forecastDayInsightKey: (stationId, date, units) => `yardobs-fcday-insight-${stationId}-${date}-${units}`,
};
