import { iconFor, wmoToTwc, hourlyDisplayCode } from './weatherIcons';

// Presentation builders for the Forecast tab: the hourly strip and the daily
// cards. Every "now" and "today" here is the place's clock (placeTime.js), and
// every time is Open-Meteo's wall-clock string — compared as text, never parsed
// with new Date(), which would read it on the device's clock instead.

// { 'YYYY-MM-DD': { rise, set } } from Open-Meteo's daily block, whose
// sunrise/sunset are wall-clock strings in the same zone as the hourly times.
function sunWindows(daily) {
  const out = {};
  (daily?.time ?? []).forEach((date, i) => {
    const rise = daily.sunrise?.[i];
    const set = daily.sunset?.[i];
    if (rise && set) out[date] = { rise, set };
  });
  return out;
}

/**
 * The next 24 hourly cards, from the hour nearest now. Past the half hour the
 * next hour is nearer, so the current one is dropped (at 3:45 the strip opens
 * on 4:00). Night icons from the daily sunrise/sunset: an hour that starts
 * before sunrise or after sunset is night.
 */
export function buildHours(hf, clock) {
  const h = hf?.hourly;
  if (!h?.time?.length || !clock) return [];
  let start = h.time.findIndex(t => t.slice(0, 13) >= clock.hourKey);
  if (start === -1) return [];
  if (clock.minute >= 30 && h.time[start].slice(0, 13) === clock.hourKey) start += 1;

  const sun = sunWindows(hf.daily);
  return h.time.slice(start, start + 24).map((t, k) => {
    const i = start + k;
    const s = sun[t.slice(0, 10)];
    const isNight = s ? (t < s.rise || t > s.set) : false;
    const pop = h.precipitation_probability?.[i] ?? 0;
    // Same WMO table as the daily cards and current conditions.
    const icon = iconFor(wmoToTwc(hourlyDisplayCode(h.weathercode?.[i], pop), isNight ? 0 : 1));
    return { time: t, icon, temp: h.temperature_2m?.[i], pop, isNow: k === 0 };
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
// so this only adds presentation: the emoji and the isToday flag. Vendor quirks —
// TWC's day/night interleaved dayparts, Open-Meteo's WMO codes — are handled there.
export function buildDays(forecast, today) {
  if (!forecast?.length) return [];
  return forecast.map(day => ({
    ...day,
    icon:    iconFor(day.iconCode),
    isToday: day.date === today,
  }));
}
