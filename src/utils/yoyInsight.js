import { convertTemp, formatPrecipTotal } from './units';
import { dayPartName } from './insightVocab';

// The one-line "Today vs. One Year Ago" note on the Trends tab. Pure: the
// clock comes in as `now`. Temperatures arrive raw imperial (°F); precipitation
// stays raw inches for the thresholds and is only converted for display.

// The note's four modes, on the shared day-part vocabulary (insightVocab):
//   start     overnight, early morning (12a–8a)  — vs. the same hour last year
//   building  morning (8a–12p)                   — running delta + forecast high
//   afternoon afternoon (12p–6p)                 — vs. last year's high
//   summary   evening, night (6p–12a)            — how the day peaked
const YOY_MODES = {
  'overnight':     'start',
  'early morning': 'start',
  'morning':       'building',
  'afternoon':     'afternoon',
  'evening':       'summary',
  'night':         'summary',
};

export function yoyMode(hour) {
  return YOY_MODES[dayPartName(hour)] ?? 'summary';
}

const obsHour = obs => parseInt((obs?.obsTimeLocal ?? '').split(' ')[1]?.split(':')[0] ?? '-1', 10);

// The hourly observation closest to `hour` (TWC obsTimeLocal "YYYY-MM-DD HH:MM:SS").
export function lyObsAtHour(lyHourlyObs, hour) {
  if (!lyHourlyObs?.length) return null;
  return lyHourlyObs.reduce((best, obs) =>
    Math.abs(obsHour(obs) - hour) < Math.abs(obsHour(best) - hour) ? obs : best, lyHourlyObs[0]);
}

export function yoyInsight({ currentTemp, todayPrecip, lyHourlyObs, lyDailyHigh, lyDailyPrecip, forecastHigh, todayHigh, units, now = new Date() }) {
  const hour = now.getHours();
  const phase = yoyMode(hour);
  const lyObs = lyObsAtHour(lyHourlyObs, hour);
  const lyHourPrecip = lyObs?.imperial?.precipTotal ?? null;
  const dateStr = now.toLocaleDateString([], { month: 'long', day: 'numeric' });

  // Temperature: converting each raw-imperial input once up front is safe —
  // an affine F→C transform preserves ordering and (after independent
  // rounding) differences, so all the comparison/diff logic below is unchanged.
  // Precipitation thresholds (0.01"/0.1") are inches-specific and must stay
  // raw imperial for the comparisons; only display uses formatPrecipTotal().
  currentTemp  = convertTemp(currentTemp, units);
  lyDailyHigh  = convertTemp(lyDailyHigh, units);
  forecastHigh = convertTemp(forecastHigh, units);
  todayHigh    = convertTemp(todayHigh, units);
  const lyHourTemp = convertTemp(lyObs?.imperial?.tempAvg ?? lyObs?.imperial?.tempHigh ?? null, units);

  let lead = null;
  let precipClause = null;

  if (phase === 'start') {
    if (currentTemp == null || lyHourTemp == null) return null;
    const roundedDiff = Math.round(currentTemp) - Math.round(lyHourTemp);
    if (roundedDiff === 0) {
      lead = `Temperature is consistent with last ${dateStr} at this hour — ${Math.round(currentTemp)}° now.`;
    } else {
      const dir = roundedDiff > 0 ? 'Warmer' : 'Cooler';
      lead = `${dir} start than last ${dateStr} — ${Math.round(currentTemp)}° now vs ${Math.round(lyHourTemp)}° at this time last year.`;
    }
    const todayP = todayPrecip ?? 0;
    const lyP = lyHourPrecip ?? 0;
    if (todayP >= 0.01 && lyP >= 0.1) precipClause = `${formatPrecipTotal(todayP, units)} of rain so far vs ${formatPrecipTotal(lyP, units)} last year at this time.`;
    else if (todayP >= 0.01) precipClause = `${formatPrecipTotal(todayP, units)} of rain already; last year was dry at this hour.`;
    else if (lyP >= 0.1) precipClause = `Dry so far, but last year had ${formatPrecipTotal(lyP, units)} by this time.`;

  } else if (phase === 'building') {
    if (currentTemp == null || lyHourTemp == null) return null;
    const absDiff = Math.abs(Math.round(currentTemp) - Math.round(lyHourTemp));
    const dir = currentTemp >= lyHourTemp ? 'above' : 'below';
    if (absDiff === 0) {
      if (forecastHigh != null && lyDailyHigh != null) {
        const fDir = forecastHigh >= lyDailyHigh ? 'top' : 'fall short of';
        lead = `Temperature is currently consistent with last year, but today's forecast high of ${Math.round(forecastHigh)}° would ${fDir} last year's ${Math.round(lyDailyHigh)}°.`;
      } else {
        lead = `Temperature is currently consistent with last year.`;
      }
    } else if (forecastHigh != null && lyDailyHigh != null) {
      const fDir = forecastHigh >= lyDailyHigh ? 'top' : 'fall short of';
      const sameDirection = (dir === 'above' && forecastHigh >= lyDailyHigh) || (dir === 'below' && forecastHigh < lyDailyHigh);
      const conj = sameDirection ? 'and' : 'but';
      lead = `Running ${absDiff}° ${dir} last year right now, ${conj} today's forecast high of ${Math.round(forecastHigh)}° would ${fDir} last year's ${Math.round(lyDailyHigh)}°.`;
    } else if (lyDailyHigh != null) {
      lead = `Running ${absDiff}° ${dir} last year at this hour vs a ${Math.round(lyDailyHigh)}° high last ${dateStr}.`;
    } else {
      lead = `Running ${absDiff}° ${dir} last year at this hour.`;
    }
    const todayP = todayPrecip ?? 0;
    const lyP = lyHourPrecip ?? 0;
    if (todayP >= 0.01 && lyP >= 0.1) precipClause = `${formatPrecipTotal(todayP, units)} of rain so far vs ${formatPrecipTotal(lyP, units)} last year by now.`;
    else if (todayP >= 0.01) precipClause = `${formatPrecipTotal(todayP, units)} of rain already; last year was dry at this point.`;
    else if (lyP >= 0.1) precipClause = `Dry so far; last year had ${formatPrecipTotal(lyP, units)} by now.`;

  } else if (phase === 'afternoon') {
    if (currentTemp == null) return null;
    if (lyDailyHigh != null && currentTemp > lyDailyHigh) {
      lead = `Already warmer than last year's high of ${Math.round(lyDailyHigh)}° — currently ${Math.round(currentTemp)}° and still climbing.`;
    } else if (lyHourTemp != null) {
      const roundedDiff = Math.round(currentTemp) - Math.round(lyHourTemp);
      if (roundedDiff === 0) {
        lead = `Temperature is consistent with last ${dateStr} at this hour — ${Math.round(currentTemp)}° now.`;
      } else {
        const dir = roundedDiff > 0 ? 'Warmer' : 'Cooler';
        lead = `${dir} afternoon than last ${dateStr} — ${Math.round(currentTemp)}° now vs ${Math.round(lyHourTemp)}° at this time last year.`;
      }
    } else if (lyDailyHigh != null) {
      const roundedDiff = Math.round(currentTemp) - Math.round(lyDailyHigh);
      if (roundedDiff === 0) {
        lead = `Temperature matching last year's high of ${Math.round(lyDailyHigh)}° — currently ${Math.round(currentTemp)}°.`;
      } else {
        const dir = roundedDiff > 0 ? 'Warmer' : 'Cooler';
        lead = `${dir} afternoon than last ${dateStr} — currently ${Math.round(currentTemp)}° vs last year's high of ${Math.round(lyDailyHigh)}°.`;
      }
    } else {
      return null;
    }
    const todayP = todayPrecip ?? 0;
    const lyP = lyHourPrecip ?? lyDailyPrecip ?? 0;
    if (todayP >= 0.01 && lyP >= 0.1) precipClause = `${formatPrecipTotal(todayP, units)} of rain vs ${formatPrecipTotal(lyP, units)} last year by now.`;
    else if (todayP >= 0.01) precipClause = `${formatPrecipTotal(todayP, units)} of rain so far; last year was dry at this point.`;
    else if (lyP >= 0.1) precipClause = `Dry so far; last year had ${formatPrecipTotal(lyP, units)} by now.`;

  } else {
    const high = todayHigh ?? currentTemp;
    if (high == null || lyDailyHigh == null) return null;
    const dir = high >= lyDailyHigh ? 'Warmer' : 'Cooler';
    lead = `${dir} day than last year: peaked at ${Math.round(high)}° vs ${Math.round(lyDailyHigh)}° last ${dateStr}.`;
    const todayP = todayPrecip ?? 0;
    const lyP = lyDailyPrecip ?? 0;
    if (todayP >= 0.1 || lyP >= 0.1) {
      const rainDir = todayP >= lyP ? 'wetter' : 'drier';
      precipClause = `Also ${rainDir} — ${formatPrecipTotal(todayP, units)} vs ${formatPrecipTotal(lyP, units)} last year.`;
    }
  }

  if (!lead) return null;
  return precipClause ? `${lead} ${precipClause}` : lead;
}
