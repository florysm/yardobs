export const INSIGHT_TTL_MS = 60 * 60 * 1000; // 1 hour

export const STORAGE_KEYS = {
  PROFILE:          'yardobs-profile',
  MODE:             'yardobs-mode',
  HERO_VIEW:        'yardobs-hero-view',
  STATION_ID:       'yardobs-station-id',
  TWC_API_KEY:      'yardobs-twc-key',
  DEFAULT_ACTIVITY: 'yardobs-default-activity',
  insightKey: (stationId, today) => `yardobs-insight-${stationId}-${today}`,
  activityInsightKey: (stationId, activityId) => `yardobs-activity-insight-${stationId}-${activityId}`,
};
