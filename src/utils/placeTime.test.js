import { describe, it, expect } from 'vitest';
import { placeClock, placeTimeZone } from './placeTime';
import { buildLookahead, buildDayOutlook } from './outlook';
import { getArcData, getForecastRainThreat, ARC_START_HOUR, ARC_END_HOUR } from './scoring';
import { currentDayPart } from './insightVocab';
import { buildHours, groupByDay, buildDays } from './forecastView';

// One instant, three clocks. Tests run with TZ=UTC, so the "device" here reads
// 07:30 on the 17th; New York reads 02:30, Los Angeles is still on the 16th.
const NOW = new Date('2026-11-17T07:30:00Z');
const LA = 'America/Los_Angeles';

// 48 hours of Open-Meteo data for Los Angeles (timezone=auto → LA wall clock).
// Each hour's temperature is its index, so a lookup at the wrong hour shows.
const laHours = Array.from({ length: 48 }, (_, i) =>
  `2026-11-${i < 24 ? 16 : 17}T${String(i % 24).padStart(2, '0')}:00`);
const laForecast = {
  timezone: LA,
  hourly: {
    time: laHours,
    temperature_2m: laHours.map((_, i) => i),
    precipitation_probability: laHours.map((_, i) => (i === 20 ? 70 : i === 33 ? 90 : 0)),
    weathercode: laHours.map(() => 1),
    wind_speed_10m: laHours.map(() => 5),
  },
  daily: {
    time: ['2026-11-16', '2026-11-17'],
    sunrise: ['2026-11-16T06:34', '2026-11-17T06:35'],
    sunset: ['2026-11-16T16:51', '2026-11-17T16:50'],
  },
};

describe('placeTimeZone', () => {
  it('reads the zone Open-Meteo names', () => {
    expect(placeTimeZone(laForecast)).toBe(LA);
  });
  it('null for a missing or unknown zone (device clock)', () => {
    expect(placeTimeZone(null)).toBeNull();
    expect(placeTimeZone({})).toBeNull();
    expect(placeTimeZone({ timezone: 'Not/AZone' })).toBeNull();
  });
});

describe('placeClock', () => {
  it("reads the place's wall clock, not the device's", () => {
    expect(placeClock(LA, NOW)).toMatchObject({ date: '2026-11-16', hour: 23, minute: 30, hourKey: '2026-11-16T23' });
    expect(placeClock('America/New_York', NOW)).toMatchObject({ date: '2026-11-17', hour: 2 });
    expect(placeClock('Asia/Tokyo', NOW)).toMatchObject({ date: '2026-11-17', hour: 16 });
  });

  it('falls back to the device clock without a zone', () => {
    expect(placeClock(null, NOW)).toMatchObject({ date: '2026-11-17', hour: 7, hourKey: '2026-11-17T07' });
  });

  it('wall is a Date whose local getters read the place clock', () => {
    const { wall } = placeClock('Asia/Tokyo', NOW);
    expect([wall.getDate(), wall.getHours(), wall.getMinutes()]).toEqual([17, 16, 30]);
    expect(currentDayPart(wall)).toBe('afternoon');
    expect(currentDayPart(placeClock(LA, NOW).wall)).toBe('night');
  });

  it('follows the place across a daylight-saving change', () => {
    // LA springs forward at 10:00Z on 8 Mar 2026: 01:30 PST, then 03:30 PDT.
    expect(placeClock(LA, new Date('2026-03-08T09:30:00Z')).hour).toBe(1);
    expect(placeClock(LA, new Date('2026-03-08T10:30:00Z')).hour).toBe(3);
  });

  it('midnight is hour 0, never 24', () => {
    expect(placeClock('UTC', new Date('2026-11-17T00:05:00Z'))).toMatchObject({ date: '2026-11-17', hour: 0 });
  });
});

describe('forecast lookups on the place clock (exploring LA from elsewhere)', () => {
  const clock = placeClock(placeTimeZone(laForecast), NOW);

  it('next few hours start at LA 11pm', () => {
    expect(buildLookahead(laForecast, 'imperial', clock.wall)).toBe('23→26°, dry');
    // On the device clock it would have described LA 7am–10am the next day.
    expect(buildLookahead(laForecast, 'imperial', NOW)).toMatch(/^31→34°/);
  });

  it("the arc, rain threat and outlook use LA's date", () => {
    const arc = getArcData(laForecast, 'bbq', {}, clock.date);
    expect(arc.map(a => a.hour)).toEqual(
      Array.from({ length: ARC_END_HOUR - ARC_START_HOUR + 1 }, (_, i) => ARC_START_HOUR + i));
    // LA's sunrise 06:34, sunset 16:51 on the 16th: 6a and 5p onward are dark.
    expect(arc.filter(a => a.dark).map(a => a.hour)).toEqual([6, 17, 18, 19, 20, 21]);
    // 70% at 8pm on the 16th is behind us at 11pm; 90% on the 17th isn't today.
    expect(getForecastRainThreat(laForecast, clock.hour, clock.date).maxProb).toBe(0);
    expect(getForecastRainThreat(laForecast, 0, clock.date).maxProb).toBe(70);
    expect(buildDayOutlook(laForecast, clock.date, 'imperial', { fromHour: clock.hour }))
      .toMatch(/^night \(11p–12a\)/);
  });
});

describe('buildHours', () => {
  it("opens on the place's current hour before the half hour", () => {
    const hours = buildHours(laForecast, placeClock(LA, new Date('2026-11-17T07:10:00Z')));
    expect(hours[0]).toMatchObject({ time: '2026-11-16T23:00', isNow: true, temp: 23 });
    expect(hours).toHaveLength(24);
    expect(hours.filter(h => h.isNow)).toHaveLength(1);
  });

  it('past the half hour, opens on the next hour', () => {
    const hours = buildHours(laForecast, placeClock(LA, NOW));
    expect(hours[0]).toMatchObject({ time: '2026-11-17T00:00', isNow: true });
  });

  it("marks night from the place's own sunrise and sunset", () => {
    const hours = buildHours(laForecast, placeClock(LA, NOW));
    const icon = t => hours.find(h => h.time === t).icon;
    expect(icon('2026-11-17T06:00')).toBe(icon('2026-11-17T17:00')); // night
    expect(icon('2026-11-17T07:00')).toBe(icon('2026-11-17T16:00')); // day
    expect(icon('2026-11-17T06:00')).not.toBe(icon('2026-11-17T07:00'));
  });

  it('the Now card shows the live reading when there is one; later hours stay forecasts', () => {
    const clock = placeClock(LA, new Date('2026-11-17T07:10:00Z'));
    const hours = buildHours(laForecast, clock, 67);
    expect(hours[0]).toMatchObject({ isNow: true, temp: 67 });
    expect(hours[1].temp).toBe(buildHours(laForecast, clock)[1].temp);
    expect(buildHours(laForecast, clock, null)[0].temp).toBe(23);
    expect(buildHours(laForecast, clock, NaN)[0].temp).toBe(23);
  });

  it('empty without data or once the forecast has run out', () => {
    expect(buildHours(null, placeClock(LA, NOW))).toEqual([]);
    expect(buildHours(laForecast, placeClock(LA, new Date('2026-11-20T00:00:00Z')))).toEqual([]);
  });
});

describe('groupByDay and buildDays', () => {
  const clock = placeClock(LA, new Date('2026-11-17T07:10:00Z'));

  it("labels the place's today, not the device's", () => {
    const groups = groupByDay(buildHours(laForecast, clock), clock.date);
    expect(groups.map(g => g.date)).toEqual(['2026-11-16', '2026-11-17']);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).not.toBe('Today');
  });

  it('flags the matching daily card as today', () => {
    const days = buildDays([{ date: '2026-11-16', iconCode: 32 }, { date: '2026-11-17', iconCode: 32 }], clock.date);
    expect(days.map(d => d.isToday)).toEqual([true, false]);
    expect(buildDays(null, clock.date)).toEqual([]);
  });
});
