import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  pw, computeScore, scoreVerdict, scoreColor, firstSentence, restOfInsight,
  isNotableWeatherChange, precipProbToRate, getForecastRainThreat,
  getRainyHourWindow, getArcData,
} from './scoring';
import { AQI_BOUNDS } from './format';

const ACTIVITY_IDS = ['bbq', 'garden', 'sports', 'leisure', 'dogwalk'];
// Pleasant enough that every non-critical factor scores at or near the top, so
// anything that drags the total down had to come from a critical factor.
const IDEAL = { temp: 70, windSpeed: 5, humidity: 50, uv: 4, aqi: 30, feelsLike: 70, precipRate: 0 };

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
    expect(r.factors).toHaveLength(5);
    expect(r.factors[0]).toMatchObject({ name: 'Temperature', score: 100 }); // 70°F is ideal for bbq
    expect(r.pavementTemp).toBeNull();
  });
  it('every activity weighs air quality', () => {
    for (const id of ACTIVITY_IDS) {
      const names = computeScore(id, { temp: 70, aqi: 30 }, 'imperial').factors.map(f => f.name);
      expect(names).toContain('Air Quality');
    }
  });
  it('computes dogwalk pavement temp in imperial', () => {
    expect(computeScore('dogwalk', { temp: 80, uv: 5 }, 'imperial').pavementTemp).toBe(130); // 80 + 50
    expect(computeScore('dogwalk', { temp: 80, uv: 0 }, 'imperial').pavementTemp).toBe(100); // 80 + 20
  });
  it('no current → zeroed result', () => {
    expect(computeScore('bbq', null, 'imperial')).toEqual({ score: 0, factors: [], pavementTemp: null });
  });
});

// Regression: a flat weighted average let a disqualifying condition be outvoted,
// so an ideal-but-rainy day still read "Excellent conditions" for every activity.
describe('critical-factor cap', () => {
  it('heavy rain sinks every activity, however nice the rest of the day is', () => {
    for (const id of ACTIVITY_IDS) {
      const { score } = computeScore(id, { ...IDEAL, precipRate: 0.3 }, 'imperial');
      expect(score, `${id} in a downpour`).toBeLessThan(40);
    }
  });
  it('rain forecast later does not penalize a dry day now', () => {
    for (const id of ACTIVITY_IDS) {
      const dry  = computeScore(id, IDEAL, 'imperial').score;
      const risk = computeScore(id, { ...IDEAL, forecastMaxProb: 100 }, 'imperial').score;
      expect(risk, `${id} with storms forecast`).toBe(dry);
    }
  });
  it('a missing reading is unknown, not bad — it must not cap', () => {
    for (const id of ACTIVITY_IDS) {
      const { precipRate, ...noPrecip } = IDEAL; // eslint-disable-line no-unused-vars
      expect(computeScore(id, noPrecip, 'imperial').score, `${id} without a rain sensor`)
        .toBeGreaterThan(80);
    }
  });
  it('a dangerous heat index vetoes a dog walk', () => {
    expect(computeScore('dogwalk', { ...IDEAL, feelsLike: 95 }, 'imperial').score).toBeLessThan(40);
  });
});

// Regression: the old curve scored the whole EPA Moderate band 80–100, which the
// prompt's score guide calls "excellent" — hence "air quality is solid" at AQI 86.
describe('AQI scoring', () => {
  const aqiFactor = aqi =>
    computeScore('garden', { ...IDEAL, aqi }, 'imperial').factors.find(f => f.name === 'Air Quality').score;

  it('Moderate air does not score as excellent', () => {
    expect(aqiFactor(86)).toBeLessThan(80);
    expect(aqiFactor(86)).toBeGreaterThan(60);
  });
  it('scores decrease monotonically across the EPA boundaries', () => {
    const scores = AQI_BOUNDS.map(([bound]) => aqiFactor(bound));
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i], `AQI ${AQI_BOUNDS[i][0]} vs ${AQI_BOUNDS[i - 1][0]}`).toBeLessThan(scores[i - 1]);
    }
  });
  it('each EPA category tops out below the previous one', () => {
    expect(aqiFactor(50)).toBeGreaterThanOrEqual(90);  // Good
    expect(aqiFactor(100)).toBeLessThanOrEqual(65);    // Moderate → Sensitive Groups
    expect(aqiFactor(150)).toBeLessThanOrEqual(40);    // Sensitive Groups → Unhealthy
    expect(aqiFactor(200)).toBeLessThanOrEqual(20);    // Unhealthy → Very Unhealthy
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
    expect(precipProbToRate(50)).toBe(0.05);
    expect(precipProbToRate(70)).toBe(0.15);
  });
  // The old ceiling was 0.1 while the precip curves run to 0.3, so a near-certain
  // hour could never score below 25 and the arc never dipped into "poor".
  it('a near-certain hour reaches the bottom of the precip curve', () => {
    expect(precipProbToRate(100)).toBe(0.3);
    expect(computeScore('bbq', { ...IDEAL, precipRate: precipProbToRate(100) }, 'imperial').score)
      .toBeLessThan(40);
  });
  it('is monotonic', () => {
    const rates = [0, 25, 45, 65, 85, 100].map(precipProbToRate);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
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
    // 90% falls on the 15th and must be ignored; rate derives from the bucketing
    // rather than restating it, so rebucketing doesn't fail this test spuriously.
    expect(getForecastRainThreat(hf)).toEqual({ rate: precipProbToRate(60), maxProb: 60 });
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
