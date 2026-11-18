import { describe, it, expect } from 'vitest';
import { beaufort, calcFeelsLike, todayHigh } from './weatherCalc';

describe('beaufort', () => {
  it('maps mph to scale + name', () => {
    expect(beaufort(0)).toBe('0 · Calm');
    expect(beaufort(5)).toBe('2 · Light Breeze');
    expect(beaufort(100)).toBe('12 · Hurricane');
  });
  it('null → em dash', () => {
    expect(beaufort(null)).toBe('—');
  });
});

describe('calcFeelsLike', () => {
  it('null temp → null', () => {
    expect(calcFeelsLike(null, 50, 5)).toBeNull();
  });
  it('mild conditions pass through (rounded)', () => {
    expect(calcFeelsLike(70, 50, 5)).toBe(70);
    expect(calcFeelsLike(72.4, 30, 1)).toBe(72);
  });
  it('hot + humid → heat index above air temp', () => {
    expect(calcFeelsLike(95, 60, 0)).toBeGreaterThan(95);
  });
  it('cold + windy → wind chill below air temp', () => {
    expect(calcFeelsLike(30, 50, 10)).toBeLessThan(30);
  });
  it('cold but calm stays at air temp (wind chill needs wind ≥ 3)', () => {
    expect(calcFeelsLike(30, 50, 1)).toBe(30);
  });
});

describe('todayHigh', () => {
  it('keeps an observed high that beat the forecast after it cools off', () => {
    expect(todayHigh(70, 74, 68)).toBe(74);
  });
  it('uses the forecast while the day is still below it', () => {
    expect(todayHigh(70, 62, 60)).toBe(70);
  });
  it('lets the current reading lead when it is the highest', () => {
    expect(todayHigh(70, 71, 72)).toBe(72);
  });
  it('skips missing values', () => {
    expect(todayHigh(null, 65, null)).toBe(65);
    expect(todayHigh(null, null, null)).toBeNull();
  });
});
