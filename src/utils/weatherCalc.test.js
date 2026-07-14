import { describe, it, expect } from 'vitest';
import { beaufort, calcFeelsLike } from './weatherCalc';

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
