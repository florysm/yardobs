export const STORAGE_KEYS = {
  MODE:      'yardobs-mode',
  HERO_VIEW: 'yardobs-hero-view',
  insightKey: (stationId, today) => `yardobs-insight-${stationId}-${today}`,
};
