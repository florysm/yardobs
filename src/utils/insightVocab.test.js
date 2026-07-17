import { describe, it, expect } from 'vitest';
import {
  scoreBand, scoreGuide, aqiPhrase,
  dayPartName, dayPartGuide, dayPartRange, shortHour,
} from './insightVocab';
import { scoreVerdict } from './scoring';
import { getTimePeriod } from './dateUtils';
import { AQI_BOUNDS } from './format';

describe('scoreBand', () => {
  it('maps scores to bands', () => {
    expect(scoreBand(100)).toBe('excellent');
    expect(scoreBand(80)).toBe('excellent');
    expect(scoreBand(79)).toBe('good');
    expect(scoreBand(65)).toBe('good');
    expect(scoreBand(50)).toBe('marginal');
    expect(scoreBand(30)).toBe('poor');
    expect(scoreBand(29)).toBe('very poor');
    expect(scoreBand(0)).toBe('very poor');
  });
  it('null → null', () => expect(scoreBand(null)).toBeNull());

  // The card headline and the prompt's score guide previously used different
  // thresholds for the same number; scoreVerdict now derives from scoreBand.
  it('agrees with the verdict shown on the card', () => {
    for (let s = 0; s <= 100; s++) {
      expect(scoreVerdict(s).toLowerCase(), `score ${s}`).toContain(scoreBand(s));
    }
  });
});

describe('scoreGuide', () => {
  it('describes every band, in the order the model reads them', () => {
    const guide = scoreGuide();
    for (const band of ['excellent', 'good', 'marginal', 'poor', 'very poor']) {
      expect(guide).toContain(band);
    }
    expect(guide).toContain('80–100 = excellent');
    expect(guide).toContain('0–29 = very poor');
  });
});

describe('dayPartName', () => {
  it('never calls the hours after midnight morning', () => {
    // The reported bug: "thunderstorms Sunday morning between midnight and 3 a.m."
    for (const h of [0, 1, 2, 3, 4]) {
      expect(dayPartName(h), `${h}:00`).toBe('overnight');
    }
  });
  it('names each part the way people speak', () => {
    expect(dayPartName(6)).toBe('early morning');
    expect(dayPartName(9)).toBe('morning');
    expect(dayPartName(14)).toBe('afternoon');
    expect(dayPartName(19)).toBe('evening');
    expect(dayPartName(22)).toBe('night');
  });
  it('wraps hour 24 to midnight rather than treating it as a 25th hour', () => {
    expect(dayPartName(24)).toBe('overnight');
    expect(dayPartName(24)).toBe(dayPartName(0));
  });
  it('null → null', () => expect(dayPartName(null)).toBeNull());

  // Two vocabularies exist: getTimePeriod answers "what time is it for the user
  // right now" in 4 coarse buckets; dayPartName names an arbitrary hour in a
  // narrative. They may differ in granularity but must never contradict.
  it('does not contradict getTimePeriod', () => {
    const compatible = { overnight: 'night', 'early morning': 'morning', morning: 'morning',
                         afternoon: 'afternoon', evening: 'evening', night: 'evening' };
    for (let h = 0; h < 24; h++) {
      const period = getTimePeriod(new Date(2026, 6, 16, h, 0, 0));
      expect(compatible[dayPartName(h)], `hour ${h}: dayPartName=${dayPartName(h)} vs getTimePeriod=${period}`)
        .toBe(period);
    }
  });
});

describe('dayPartRange', () => {
  it('names a range inside one part', () => {
    expect(dayPartRange(0, 2)).toBe('overnight');
    expect(dayPartRange(13, 16)).toBe('afternoon');
  });
  it('spans two parts', () => {
    expect(dayPartRange(19, 23)).toBe('evening into night');
    expect(dayPartRange(4, 6)).toBe('overnight into early morning');
  });
});

describe('dayPartGuide', () => {
  it('renders every part from the same table the code uses', () => {
    const guide = dayPartGuide();
    for (const name of ['overnight', 'early morning', 'morning', 'afternoon', 'evening', 'night']) {
      expect(guide).toContain(name);
    }
    expect(guide).toContain('12a–5a overnight');
    expect(guide).toContain('9p–12a night');
  });
});

describe('shortHour', () => {
  it('renders the midnight/noon boundaries unambiguously', () => {
    expect(shortHour(0)).toBe('12a');
    expect(shortHour(12)).toBe('12p');
    expect(shortHour(23)).toBe('11p');
    // Exclusive end-of-day: must be midnight, not noon.
    expect(shortHour(24)).toBe('12a');
  });
});

describe('aqiPhrase', () => {
  it('does not flatter Moderate air', () => {
    // The reported bug: AQI 86 narrated as "air quality is solid".
    expect(aqiPhrase(86)).toBe('acceptable but not pristine');
  });
  it('covers every EPA category plus above-range', () => {
    for (const [bound] of AQI_BOUNDS) expect(aqiPhrase(bound)).toBeTruthy();
    expect(aqiPhrase(500)).toBe('hazardous');
  });
  it('null → null', () => expect(aqiPhrase(null)).toBeNull());
});
