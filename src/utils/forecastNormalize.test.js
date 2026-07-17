import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeTwcForecast, normalizeOpenMeteoForecast, aqiForDay } from './forecastNormalize';

// TZ=UTC via the npm test script; pin "today" so date derivation is deterministic.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-16T12:00:00Z')); // a Thursday
});
afterEach(() => vi.useRealTimers());

describe('normalizeTwcForecast', () => {
  // daypart[0] interleaves day/night: i*2 = day, i*2+1 = night.
  const twc = {
    dayOfWeek: ['Thursday', 'Friday', 'Saturday'],
    temperatureMax: [93, 88, 79],
    temperatureMin: [66, 64, 61],
    daypart: [{
      iconCode:     [32, 31, 30, 33, 12, 27],
      precipChance: [10,  0, 20,  5, 80, 40],
      wxPhraseLong: ['Sunny', 'Clear', 'Partly Cloudy', 'Partly Cloudy', 'Rain', 'Mostly Cloudy'],
    }],
  };

  it('reads the day half of each daypart pair, not the night half', () => {
    const days = normalizeTwcForecast(twc);
    expect(days.map(d => d.pop)).toEqual([10, 20, 80]);
    expect(days.map(d => d.phrase)).toEqual(['Sunny', 'Partly Cloudy', 'Rain']);
    expect(days.map(d => d.iconCode)).toEqual([32, 30, 12]);
  });

  it('produces the neutral shape with sequential dates', () => {
    expect(normalizeTwcForecast(twc)[0]).toEqual({
      date: '2026-07-16', dayOfWeek: 'Thursday',
      tempMax: 93, tempMin: 66, iconCode: 32, phrase: 'Sunny', pop: 10,
    });
    expect(normalizeTwcForecast(twc).map(d => d.date))
      .toEqual(['2026-07-16', '2026-07-17', '2026-07-18']);
  });

  it("falls back to the observed icon when TWC has nulled today's daypart", () => {
    // TWC drops the day half once that period has passed (~mid-afternoon).
    const stale = { ...twc, daypart: [{ ...twc.daypart[0], iconCode: [null, 31, 30, 33, 12, 27], wxPhraseLong: [] }] };
    const days = normalizeTwcForecast(stale, 26);
    expect(days[0].iconCode).toBe(26);
    expect(days[0].phrase).toBe('Cloudy');  // derived from LABELS[26]
    // Only today gets the fallback — later days stay null rather than borrowing it.
    expect(days[1].iconCode).toBe(30);
  });

  it('survives a missing daypart block', () => {
    const days = normalizeTwcForecast({ ...twc, daypart: [] });
    expect(days).toHaveLength(3);
    expect(days[1]).toMatchObject({ tempMax: 88, iconCode: null, pop: null });
  });

  it('null in, null out', () => {
    expect(normalizeTwcForecast(null)).toBeNull();
    expect(normalizeTwcForecast({})).toBeNull();
  });
});

describe('normalizeOpenMeteoForecast', () => {
  const om = { daily: {
    time: ['2026-07-16', '2026-07-17', '2026-07-18'],
    temperature_2m_max: [92.7, 92.7, 98.4],
    temperature_2m_min: [65.6, 65.2, 66.3],
    weathercode: [0, 3, 95],
    precipitation_probability_max: [10, 30, 80],
  }};

  it('maps WMO codes through to TWC icon codes and phrases', () => {
    const days = normalizeOpenMeteoForecast(om);
    // 0 → clear → Sunny(32); 3 → overcast → Cloudy(26); 95 → thunderstorm → 4
    expect(days.map(d => d.iconCode)).toEqual([32, 26, 4]);
    expect(days.map(d => d.phrase)).toEqual(['Sunny', 'Cloudy', 'Thunderstorms']);
  });

  it('resolves the daily code as daytime, never the night variant', () => {
    // wmoToTwc(0, 0) would give 31/"Clear" — wrong for a daily summary row.
    expect(normalizeOpenMeteoForecast(om)[0].iconCode).toBe(32);
  });

  it('uses the real forecast dates rather than counting from today', () => {
    expect(normalizeOpenMeteoForecast(om).map(d => d.date))
      .toEqual(['2026-07-16', '2026-07-17', '2026-07-18']);
    expect(normalizeOpenMeteoForecast(om)[0].dayOfWeek).toBe('Thursday');
  });

  it('null in, null out', () => {
    expect(normalizeOpenMeteoForecast(null)).toBeNull();
    expect(normalizeOpenMeteoForecast({ daily: { time: [] } })).toBeNull();
  });
});

describe('aqiForDay', () => {
  const mk = (values, day = '2026-07-16') => ({ hourly: {
    time: Array.from({ length: 48 }, (_, i) =>
      `${i < 24 ? day : '2026-07-17'}T${String(i % 24).padStart(2, '0')}:00`),
    us_aqi: [...values, ...Array(48 - values.length).fill(20)],
  }});

  it('reports the worst air during the hours people are outside', () => {
    const v = Array(24).fill(30);
    v[15] = 153; // 3pm spike
    expect(aqiForDay(mk(v), '2026-07-16')).toBe(153);
  });

  it('ignores spikes outside 8a–8p, which nobody is breathing', () => {
    const v = Array(24).fill(30);
    v[3] = 200;  // 3am
    v[22] = 180; // 10pm
    expect(aqiForDay(mk(v), '2026-07-16')).toBe(30);
  });

  it('includes the 8a and 8p boundaries', () => {
    const a = Array(24).fill(30); a[8]  = 111;
    const b = Array(24).fill(30); b[20] = 122;
    expect(aqiForDay(mk(a), '2026-07-16')).toBe(111);
    expect(aqiForDay(mk(b), '2026-07-16')).toBe(122);
  });

  // The reported bug: an unhealthy afternoon must not average away into "ideal".
  it('a bad afternoon is not smoothed out by clean air the rest of the day', () => {
    const v = Array(24).fill(20);
    for (let h = 13; h <= 17; h++) v[h] = 153;
    const peak = aqiForDay(mk(v), '2026-07-16');
    const mean = Math.round(v.reduce((s, x) => s + x, 0) / 24);
    expect(peak).toBe(153);      // Unhealthy — leads the narrative
    expect(mean).toBeLessThan(60); // an average would have read as Good
  });

  it('does not read hours from the next day', () => {
    const v = Array(24).fill(40);
    const aq = mk(v);
    aq.hourly.us_aqi = aq.hourly.us_aqi.map((x, i) => (i >= 24 ? 300 : x));
    expect(aqiForDay(aq, '2026-07-16')).toBe(40);
  });

  it('null when the day is not covered, so the prompt stays silent', () => {
    expect(aqiForDay(mk(Array(24).fill(40)), '2026-07-25')).toBeNull();
    expect(aqiForDay(null, '2026-07-16')).toBeNull();
    expect(aqiForDay({ hourly: { time: [] } }, '2026-07-16')).toBeNull();
  });

  it('tolerates gaps in the series', () => {
    const v = Array(24).fill(null);
    v[12] = 88;
    expect(aqiForDay(mk(v), '2026-07-16')).toBe(88);
  });
});

describe('both sources agree on the contract', () => {
  it('emit identical key sets, so components need not know the source', () => {
    const twcDay = normalizeTwcForecast({
      dayOfWeek: ['Thursday'], temperatureMax: [93], temperatureMin: [66],
      daypart: [{ iconCode: [32], precipChance: [10], wxPhraseLong: ['Sunny'] }],
    })[0];
    const omDay = normalizeOpenMeteoForecast({ daily: {
      time: ['2026-07-16'], temperature_2m_max: [93], temperature_2m_min: [66],
      weathercode: [0], precipitation_probability_max: [10],
    }})[0];
    expect(Object.keys(twcDay).sort()).toEqual(Object.keys(omDay).sort());
    expect(twcDay).toEqual(omDay);
  });
});
