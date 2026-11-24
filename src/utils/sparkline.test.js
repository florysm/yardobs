import { describe, it, expect } from 'vitest';
import { dayCurvePoints, minuteOfDay, DAY_MINUTES } from './sparkline';

describe('dayCurvePoints', () => {
  it('places readings by time of day, lowest value at the bottom', () => {
    const pts = dayCurvePoints([
      { minute: 0, value: 10 }, { minute: 360, value: 20 }, { minute: 720, value: 15 },
    ], 100, 50, 0);
    expect(pts).toEqual([
      { x: 0, y: 50, v: 10 }, { x: 25, y: 0, v: 20 }, { x: 50, y: 25, v: 15 },
    ]);
  });
  it('stops at the latest reading rather than stretching to the right edge', () => {
    const pts = dayCurvePoints([{ minute: 0, value: 1 }, { minute: 360, value: 2 }], 100, 10, 0);
    expect(pts[pts.length - 1].x).toBe(25);
  });
  it('draws a flat line along the bottom when nothing changes', () => {
    expect(dayCurvePoints([{ minute: 0, value: 5 }, { minute: DAY_MINUTES, value: 5 }], 10, 10, 2).map(p => p.y))
      .toEqual([8, 8]);
  });
  it('skips unusable readings and needs two points', () => {
    expect(dayCurvePoints([{ minute: 0, value: null }, { minute: 1, value: NaN }, { minute: 2, value: 3 }], 10, 10)).toEqual([]);
    expect(dayCurvePoints(null, 10, 10)).toEqual([]);
  });
});

describe('minuteOfDay', () => {
  it('reads the local clock time', () => {
    expect(minuteOfDay('2026-11-23 21:04:59')).toBe(21 * 60 + 4);
    expect(minuteOfDay('2026-11-23T00:30')).toBe(30);
  });
  it('is null without a time', () => {
    expect(minuteOfDay(undefined)).toBeNull();
    expect(minuteOfDay('2026-11-23')).toBeNull();
  });
});
