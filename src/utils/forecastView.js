import { iconFor, wmoToTwc, hourlyDisplayCode } from './weatherIcons';
import { withMoonPhase } from './moon';

// Presentation builders for the Forecast tab: the hourly strip and the daily
// cards. Every "now" and "today" here is the place's clock (placeTime.js), and
// every time is Open-Meteo's wall-clock string — compared as text, never parsed
// with new Date(), which would read it on the device's clock instead.

// { 'YYYY-MM-DD': { rise, set } } from Open-Meteo's daily block, whose
// sunrise/sunset are wall-clock strings in the same zone as the hourly times.
export function sunWindows(daily) {
  const out = {};
  (daily?.time ?? []).forEach((date, i) => {
    const rise = daily.sunrise?.[i];
    const set = daily.sunset?.[i];
    if (rise && set) out[date] = { rise, set };
  });
  return out;
}

// An hour that starts before sunrise or after sunset is night. Shared by the
// hourly strip's icons and the activity arc's dimmed bars. False without data.
export function isNightHour(sun, t) {
  const s = sun[t.slice(0, 10)];
  return s ? (t < s.rise || t > s.set) : false;
}

/**
 * The next 24 hourly cards, from the hour nearest now. Past the half hour the
 * next hour is nearer, so the current one is dropped (at 3:45 the strip opens
 * on 4:00). Night icons from the daily sunrise/sunset: an hour that starts
 * before sunrise or after sunset is night.
 *
 * `nowTemp` (°F) is the live reading shown on the hero card. When given, the
 * "Now" card shows it instead of the model's forecast for the hour, so the two
 * never disagree (a station reading 67° beside a forecast 60°). Later hours
 * stay forecasts.
 */
export function buildHours(hf, clock, nowTemp = null) {
  const h = hf?.hourly;
  if (!h?.time?.length || !clock) return [];
  let start = h.time.findIndex(t => t.slice(0, 13) >= clock.hourKey);
  if (start === -1) return [];
  if (clock.minute >= 30 && h.time[start].slice(0, 13) === clock.hourKey) start += 1;

  const sun = sunWindows(hf.daily);
  return h.time.slice(start, start + 24).map((t, k) => {
    const i = start + k;
    const isNight = isNightHour(sun, t);
    const pop = h.precipitation_probability?.[i] ?? 0;
    // Same WMO table as the daily cards and current conditions.
    // Night hours show that night's moon phase. Parsing `t` on the device clock
    // is fine here: the phase barely moves across a few hours of zone offset.
    const icon = withMoonPhase(
      iconFor(wmoToTwc(hourlyDisplayCode(h.weathercode?.[i], pop), isNight ? 0 : 1)),
      new Date(t), hf.latitude ?? null,
    );
    const isNow = k === 0;
    const temp = isNow && nowTemp != null && !isNaN(nowTemp) ? nowTemp : h.temperature_2m?.[i];
    return { time: t, icon, temp, pop, isNow };
  });
}

/** Hours grouped by date, labelled "Today" or "Wednesday 18". */
export function groupByDay(hours, today) {
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const groups = [];
  let current = null;
  for (const hr of hours) {
    const date = hr.time.slice(0, 10);
    if (!current || current.date !== date) {
      const d = new Date(date + 'T12:00:00');
      current = {
        date,
        label: date === today
          ? 'Today'
          : `${d.toLocaleDateString(locale, { weekday: 'long' })} ${d.getDate()}`,
        hours: [],
      };
      groups.push(current);
    }
    current.hours.push(hr);
  }
  return groups;
}

// `forecast` arrives already normalized from useWeather (see forecastNormalize.js),
// so this only adds presentation: the emoji (with the moon's phase at night) and
// the isToday flag. Vendor quirks —
// TWC's day/night interleaved dayparts, Open-Meteo's WMO codes — are handled there.
export function buildDays(forecast, today, lat = null) {
  if (!forecast?.length) return [];
  return forecast.map(day => ({
    ...day,
    // A night icon (today's card after dark) shows that evening's moon.
    icon:    withMoonPhase(iconFor(day.iconCode), new Date(`${day.date}T21:00:00`), lat),
    isToday: day.date === today,
  }));
}
