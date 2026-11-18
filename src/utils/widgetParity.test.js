import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WMO_TO_TWC, wmoToTwc, labelFor } from './weatherIcons';
import { KEY_WARN_DAYS, daysUntilExpiry } from './keyExpiry';
import { convertTemp, convertWind, KMH_PER_MPH } from './units';
import { calcFeelsLike } from './weatherCalc';

// The Scriptable widget can't import app code, so it carries copies. Its
// PARITY block is pure; evaluate it here and hold it to the app's behavior.
const source = readFileSync(new URL('../../public/widget/yardobs-widget.js', import.meta.url), 'utf8');
const block = source.match(/\/\/ PARITY:BEGIN[\s\S]*?\n([\s\S]*?)\/\/ PARITY:END/)?.[1];
const widget = new Function(`${block}\nreturn { KEY_WARN_DAYS, keyDaysLeft, CONDITIONS, condition, KMH_PER_MPH, toC, toKmh, calcFeelsLike };`)();

describe('widget parity', () => {
  it('has a PARITY block', () => {
    expect(block).toBeTruthy();
  });

  it('labels every WMO code the way the app does, day and night', () => {
    const codes = Object.keys(WMO_TO_TWC).map(Number);
    expect(Object.keys(widget.CONDITIONS).map(Number).sort((a, b) => a - b)).toEqual(codes.sort((a, b) => a - b));
    for (const code of codes) {
      for (const isDay of [1, 0]) {
        expect(widget.condition(code, isDay).label, `WMO ${code} isDay=${isDay}`).toBe(labelFor(wmoToTwc(code, isDay)));
      }
    }
    expect(widget.condition(42, 1).label).toBe(labelFor(wmoToTwc(42, 1)));
  });

  it('warns about key expiry on the same schedule', () => {
    expect(widget.KEY_WARN_DAYS).toBe(KEY_WARN_DAYS);
    const now = new Date(2026, 10, 17, 22, 30);
    for (const date of ['2026-11-17', '2026-11-18', '2026-12-01', '2026-11-10', '2027-03-01', '', 'nope']) {
      expect(widget.keyDaysLeft(date, now), date).toBe(daysUntilExpiry(date, now));
    }
  });

  it('converts units identically', () => {
    expect(widget.KMH_PER_MPH).toBe(KMH_PER_MPH);
    for (const f of [-40, 0, 32, 72.5, 104]) expect(widget.toC(f)).toBeCloseTo(convertTemp(f, 'metric'), 10);
    for (const mph of [0, 5, 23.4, 60]) expect(widget.toKmh(mph)).toBeCloseTo(convertWind(mph, 'metric'), 10);
  });

  it('computes feels-like identically', () => {
    const cases = [[95, 60, 5], [80, 40, 0], [79, 90, 10], [40, 50, 15], [50, 30, 3], [51, 30, 20], [20, null, null], [null, 50, 5]];
    for (const [t, rh, v] of cases) {
      expect(widget.calcFeelsLike(t, rh, v), `${t}/${rh}/${v}`).toBe(calcFeelsLike(t, rh, v));
    }
  });
});
