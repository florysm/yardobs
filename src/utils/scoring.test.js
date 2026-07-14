import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pw, computeScore, scoreVerdict, scoreColor, firstSentence, restOfInsight,
  isNotableWeatherChange, precipProbToRate, getForecastRainThreat,
  getRainyHourWindow, getArcData,
} from './scoring';

describe('pw (piecewise-linear)', () => {
  const pts = [[0, 0], [10, 100]];
  it('null → neutral 60', () => expect(pw(null, pts)).toBe(60));
  it('clamps below/above the range', () => {
    expect(pw(-5, pts)).toBe(0);
    expect(pw(15, pts)).toBe(100);
  });
  it('hits control points and interpolates', () => {
    expect(pw(0, pts)).toBe(0);
    expect(pw(10, pts)).toBe(100);
    expect(pw(5, pts)).toBe(50);
  });
});

describe('computeScore', () => {
  it('returns score + per-factor breakdown', () => {
    const r = computeScore('bbq', { temp: 70, windSpeed: 5, humidity: 50, precipRate: 0 }, 'imperial');
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.factors).toHaveLength(4);
    expect(r.factors[0]).toMatchObject({ name: 'Temperature', score: 100 }); // 70°F is ideal for bbq
    expect(r.pavementTemp).toBeNull();
  });
  it('computes dogwalk pavement temp in imperial', () => {
    expect(computeScore('dogwalk', { temp: 80, uv: 5 }, 'imperial').pavementTemp).toBe(130); // 80 + 50
    expect(computeScore('dogwalk', { temp: 80, uv: 0 }, 'imperial').pavementTemp).toBe(100); // 80 + 20
  });
  it('no current → zeroed result', () => {
    expect(computeScore('bbq', null, 'imperial')).toEqual({ score: 0, factors: [], pavementTemp: null });
  });
});

describe('verdict / color thresholds', () => {
  it('scoreVerdict', () => {
    expect(scoreVerdict(85)).toBe('Excellent conditions');
    expect(scoreVerdict(70)).toBe('Good conditions today');
    expect(scoreVerdict(55)).toBe('Marginal conditions');
    expect(scoreVerdict(40)).toBe('Poor conditions today');
  });
  it('scoreColor', () => {
    expect(scoreColor(70)).toBe('var(--delta-up)');
    expect(scoreColor(55)).toBe('var(--score-marginal)');
    expect(scoreColor(40)).toBe('var(--delta-dn)');
  });
});

describe('insight sentence splitting', () => {
  it('splits first sentence from the rest', () => {
    expect(firstSentence('Hello world. Next one.')).toBe('Hello world.');
    expect(restOfInsight('Hello world. Next one.')).toBe('Next one.');
  });
  it('handles single sentence and null', () => {
    expect(firstSentence(null)).toBeNull();
    expect(restOfInsight('Only one sentence.')).toBeNull();
  });
});

describe('isNotableWeatherChange', () => {
  const base = { temp: 70, windSpeed: 5, rainThreat: 0, score: 60 };
  it('true when no stored conditions', () => {
    expect(isNotableWeatherChange({}, base)).toBe(true);
  });
  it('false when nothing meaningfully changed', () => {
    expect(isNotableWeatherChange({ conditions: { ...base } }, base)).toBe(false);
  });
  it('true on a big temperature swing', () => {
    expect(isNotableWeatherChange({ conditions: { ...base } }, { ...base, temp: 90 })).toBe(true);
  });
});

describe('precipProbToRate', () => {
  it('buckets probability → rate', () => {
    expect(precipProbToRate(10)).toBe(0);
    expect(precipProbToRate(30)).toBe(0.01);
    expect(precipProbToRate(60)).toBe(0.05);
    expect(precipProbToRate(80)).toBe(0.1);
  });
});

describe('forecast helpers (today-dependent)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T12:00:00Z')); // TZ=UTC → today is 2026-07-14
  });
  afterEach(() => vi.useRealTimers());

  const hf = { hourly: {
    time: ['2026-07-14T08:00', '2026-07-14T15:00', '2026-07-15T09:00'],
    precipitation_probability: [10, 60, 90],
  }};

  it('getForecastRainThreat uses today only, max prob', () => {
    expect(getForecastRainThreat(hf)).toEqual({ rate: 0.05, maxProb: 60 });
    expect(getForecastRainThreat(null)).toEqual({ rate: 0, maxProb: 0 });
  });
  it('getRainyHourWindow finds the ≥50% window today', () => {
    expect(getRainyHourWindow(hf)).toEqual({ firstRainyHour: 15, lastRainyHour: 15 });
  });
  it('getArcData scores daytime hours of today only', () => {
    const arc = getArcData(hf, 'bbq', {});
    expect(arc.map(a => a.hour)).toEqual([8, 15]);
    arc.forEach(a => expect(typeof a.score).toBe('number'));
  });
});
