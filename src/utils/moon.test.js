import { describe, it, expect } from 'vitest';
import { pickMoonWindow, moonPhaseName, arcProgress, moonPhaseEmoji, withMoonPhase, NIGHT_ICON } from './moon';

// Fixed local times on consecutive days; getTimes returns per-day rise/set.
const at = (day, h, m = 0) => new Date(2026, 10, day, h, m);

function fakeTimes(table) {
  return d => table[d.getDate()] ?? {};
}

describe('pickMoonWindow', () => {
  // Near full moon: sets in the morning, rises in the evening.
  const nearFull = fakeTimes({
    16: { rise: at(16, 17, 10), set: at(16, 7, 20) },
    17: { rise: at(17, 18, 5),  set: at(17, 8, 15) },
    18: { rise: at(18, 19, 0),  set: at(18, 9, 10) },
    19: { rise: at(19, 19, 55), set: at(19, 10, 5) },
  });

  it('after an evening moonrise, pairs it with tomorrow morning\'s set', () => {
    const w = pickMoonWindow(at(17, 21), nearFull, true);
    expect(w.rise).toEqual(at(17, 18, 5));
    expect(w.set).toEqual(at(18, 9, 10));
  });

  it('early morning with the moon still up from yesterday, uses yesterday\'s rise', () => {
    const w = pickMoonWindow(at(17, 5), nearFull, true);
    expect(w.rise).toEqual(at(16, 17, 10));
    expect(w.set).toEqual(at(17, 8, 15));
  });

  it('after it set this morning, shows tonight\'s rise and tomorrow\'s set', () => {
    const w = pickMoonWindow(at(17, 12), nearFull, false);
    expect(w.rise).toEqual(at(17, 18, 5));
    expect(w.set).toEqual(at(18, 9, 10));
  });

  it('a day with no moonrise falls through to the next one', () => {
    const skip = fakeTimes({
      16: { rise: at(16, 23, 30), set: at(16, 11) },
      17: { set: at(17, 12) },                       // no rise today
      18: { rise: at(18, 0, 20), set: at(18, 13) },
    });
    const w = pickMoonWindow(at(17, 14), skip, false);
    expect(w.rise).toEqual(at(18, 0, 20));
    expect(w.set).toEqual(at(18, 13));
  });

  it('passes through always-up / always-down for today', () => {
    expect(pickMoonWindow(at(17, 12), fakeTimes({ 17: { alwaysUp: true } }), true))
      .toMatchObject({ rise: null, set: null, alwaysUp: true, alwaysDown: false });
    expect(pickMoonWindow(at(17, 12), fakeTimes({ 17: { alwaysDown: true } }), false))
      .toMatchObject({ rise: null, set: null, alwaysUp: false, alwaysDown: true });
  });
});

describe('arcProgress', () => {
  it('is the clamped fraction of the window elapsed', () => {
    expect(arcProgress(100, 200, 150)).toBe(0.5);
    expect(arcProgress(100, 200, 50)).toBe(0);
    expect(arcProgress(100, 200, 500)).toBe(0.9999);
  });
  it('is null without a usable window', () => {
    expect(arcProgress(null, 200, 150)).toBeNull();
    expect(arcProgress(200, 100, 150)).toBeNull();
  });
});

describe('moonPhaseName', () => {
  it('names the eight phases', () => {
    expect(moonPhaseName(0)).toBe('New Moon');
    expect(moonPhaseName(0.25)).toBe('First Quarter');
    expect(moonPhaseName(0.5)).toBe('Full Moon');
    expect(moonPhaseName(0.75)).toBe('Last Quarter');
    expect(moonPhaseName(0.97)).toBe('New Moon');
  });
});

describe('moonPhaseEmoji', () => {
  it('matches the phase names', () => {
    expect(moonPhaseEmoji(0)).toBe('🌑');
    expect(moonPhaseEmoji(0.25)).toBe('🌓');
    expect(moonPhaseEmoji(0.49)).toBe('🌕');
    expect(moonPhaseEmoji(0.75)).toBe('🌗');
    expect(moonPhaseEmoji(0.97)).toBe('🌑');
  });
  it('mirrors the lit side south of the equator', () => {
    expect(moonPhaseEmoji(0.25, -33)).toBe('🌗');
    expect(moonPhaseEmoji(0.125, -33)).toBe('🌘');
    expect(moonPhaseEmoji(0.5, -33)).toBe('🌕');
    expect(moonPhaseEmoji(0.25, 40)).toBe('🌓');
  });
});

describe('withMoonPhase', () => {
  it('swaps the night crescent for the phase on that date', () => {
    // 2026-11-24 is a full moon.
    expect(withMoonPhase(NIGHT_ICON, new Date('2026-11-24T03:00:00Z'))).toBe('🌕');
  });
  it('leaves other icons alone', () => {
    expect(withMoonPhase('☁️', new Date())).toBe('☁️');
    expect(withMoonPhase(NIGHT_ICON, null)).toBe(NIGHT_ICON);
    expect(withMoonPhase(NIGHT_ICON, new Date('nope'))).toBe(NIGHT_ICON);
  });
});
