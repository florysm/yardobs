import { describe, it, expect } from 'vitest';
import { buildTrajectory, buildPrecipWindow } from './ForecastTab';

// A hot day whose low lands near dawn and is still in the 80s at 10pm — the exact
// shape that produced "as evening approaches temperatures will drop to around 61"
// when the model was handed only a high and a low.
const hourly = {
  time: Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? '2026-07-14' : '2026-07-15';
    return `${day}T${String(i % 24).padStart(2, '0')}:00`;
  }),
  temperature_2m: [
    68, 65, 63, 62, 61, 62, 66, 72, 78, 83, 87, 90,
    92, 93, 93, 92, 90, 88, 86, 84, 83, 82, 81, 80,
    ...Array(24).fill(70),
  ],
  precipitation_probability: [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 10, 30, 60, 80, 40, 10, 0, 0, 0, 0, 0,
    ...Array(24).fill(90),
  ],
};

describe('buildTrajectory', () => {
  it('samples the day every 3 hours so the dawn low is visible', () => {
    const t = buildTrajectory({ hourly }, '2026-07-14', 'imperial');
    expect(t).toBe('1a 65, 4a 61, 7a 72, 10a 87, 1p 93, 4p 90, 7p 84, 10p 81');
    // The daily low (61) sits at 4am and 10pm is still in the 80s — the model
    // can no longer place the low in the evening by inferring a shape.
    expect(t).toContain('4a 61');
    expect(t).toContain('10p 81');
  });
  it('only covers the requested day', () => {
    expect(buildTrajectory({ hourly }, '2026-07-15', 'imperial')).toBe(
      '1a 70, 4a 70, 7a 70, 10a 70, 1p 70, 4p 70, 7p 70, 10p 70'
    );
  });
  it('respects units', () => {
    expect(buildTrajectory({ hourly }, '2026-07-14', 'metric')).toContain('4a 16');
  });
  it('stays inside clampBody 500-char string cap', () => {
    expect(buildTrajectory({ hourly }, '2026-07-14', 'imperial').length).toBeLessThan(500);
  });
  it('null when there is no hourly data for the day', () => {
    expect(buildTrajectory({ hourly }, '2026-07-20', 'imperial')).toBeNull();
    expect(buildTrajectory(null, '2026-07-14', 'imperial')).toBeNull();
    expect(buildTrajectory({}, '2026-07-14', 'imperial')).toBeNull();
  });
});

describe('buildPrecipWindow', () => {
  it('spans the likely hours and reports the peak', () => {
    // Hours 14–17 are 30/60/80/40 → 2p through 6p, peak 80%. All four sit in the
    // afternoon (evening starts at 18:00), so it reads as a single part.
    expect(buildPrecipWindow({ hourly }, '2026-07-14')).toBe('afternoon (2p–6p), peaking at 80%');
  });
  it('catches a shower that falls between the 3-hour temp samples', () => {
    // 2–3pm only. A sampling approach anchored at 1p/4p would miss this entirely.
    const prob = Array(48).fill(0);
    prob[14] = 90;
    expect(buildPrecipWindow({ hourly: { ...hourly, precipitation_probability: prob } }, '2026-07-14'))
      .toBe('afternoon (2p), peaking at 90%');
  });
  it('ignores hours below the likely threshold', () => {
    const prob = Array(48).fill(0);
    prob[14] = 25;
    expect(buildPrecipWindow({ hourly: { ...hourly, precipitation_probability: prob } }, '2026-07-14'))
      .toBeNull();
  });
  it('does not bleed into the next day', () => {
    // The 15th is 90% throughout; the 14th's window must not absorb it.
    expect(buildPrecipWindow({ hourly }, '2026-07-14')).not.toContain('90%');
  });
  it('renders a window running to end-of-day as midnight, not noon', () => {
    // Exclusive end hour 24 must read "12a". It previously rendered "12p",
    // describing a 7pm–noon window that runs backwards through the day.
    const prob = Array(48).fill(0);
    for (let h = 19; h <= 23; h++) prob[h] = 70;
    expect(buildPrecipWindow({ hourly: { ...hourly, precipitation_probability: prob } }, '2026-07-14'))
      .toBe('evening into night (7p–12a), peaking at 70%');
  });
  it('renders a midday window unambiguously', () => {
    const prob = Array(48).fill(0);
    prob[11] = 70; // 11a, exclusive end 12 -> noon
    expect(buildPrecipWindow({ hourly: { ...hourly, precipitation_probability: prob } }, '2026-07-14'))
      .toBe('morning (11a), peaking at 70%');
  });
  // The reported bug, at the source: this window must never be handed to the
  // model as a bare "12a–3a" for it to call "morning".
  it('names an after-midnight window overnight, not morning', () => {
    const prob = Array(48).fill(0);
    for (let h = 0; h <= 2; h++) prob[h] = 80;
    const w = buildPrecipWindow({ hourly: { ...hourly, precipitation_probability: prob } }, '2026-07-14');
    expect(w).toBe('overnight (12a–3a), peaking at 80%');
    expect(w).not.toContain('morning');
  });
  it('null on a dry day, so the prompt can stay silent', () => {
    const dry = { ...hourly, precipitation_probability: Array(48).fill(5) };
    expect(buildPrecipWindow({ hourly: dry }, '2026-07-14')).toBeNull();
  });
  it('null without data', () => {
    expect(buildPrecipWindow(null, '2026-07-14')).toBeNull();
  });
});
