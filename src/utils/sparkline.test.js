import { describe, it, expect } from 'vitest';
import { sparklinePoints } from './sparkline';

describe('sparklinePoints', () => {
  it('spans the width, lowest value at the bottom', () => {
    expect(sparklinePoints([10, 20, 15], 100, 50, 0)).toBe('0.0,50.0 50.0,0.0 100.0,25.0');
  });
  it('draws a flat line along the bottom when nothing changes', () => {
    expect(sparklinePoints([5, 5], 10, 10, 2)).toBe('0.0,8.0 10.0,8.0');
  });
  it('skips missing values and needs two points', () => {
    expect(sparklinePoints([null, 1, NaN, 3], 10, 10, 0)).toBe('0.0,10.0 10.0,0.0');
    expect(sparklinePoints([1], 10, 10)).toBe('');
    expect(sparklinePoints(null, 10, 10)).toBe('');
  });
});
