export const INSIGHT_TTL_MS = 60 * 60 * 1000; // 1 hour

export const STORAGE_KEYS = {
  PROFILE:          'yardobs-profile',
  MODE:             'yardobs-mode',
STATION_ID:       'yardobs-station-id',
  TWC_API_KEY:      'yardobs-twc-key',
  DEFAULT_ACTIVITY: 'yardobs-default-activity',
  insightKey: (stationId, today, period) => `yardobs-insight-${stationId}-${today}-${period}`,
  activityInsightKey: (stationId, activityId, period) => `yardobs-activity-insight-${stationId}-${activityId}-${period}`,
  forecastDayInsightKey: (stationId, date) => `yardobs-fcday-insight-${stationId}-${date}`,
};
