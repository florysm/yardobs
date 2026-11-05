import { describe, it, expect } from 'vitest';
import { buildDayOutlook, buildLookahead } from './outlook';

const DAY = '2026-11-04';
const NEXT = '2026-11-05';

// 48 hours: a cool November day, then a flat day. Temps fall through the
// evening but stay ≥55 until after 10pm; rain arrives only at 11pm.
// These are the two reported slips: "low 50s in the evening" and
// "rain likely overnight around 11p, so plan indoor activities for the evening".
const temps = [
  48, 47, 46, 46, 45, 45, 46, 48, 51, 55, 58, 61,
  63, 64, 65, 65, 64, 62, 60, 58, 57, 55, 53, 52,
];
const probs = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 10, 10, 15, 20, 20, 25, 35, 45, 65,
];
const hf = { hourly: {
  time: Array.from({ length: 48 }, (_, i) =>
    `${i < 24 ? DAY : NEXT}T${String(i % 24).padStart(2, '0')}:00`),
  temperature_2m: [...temps, ...Array(24).fill(50)],
  precipitation_probability: [...probs, ...Array(24).fill(0)],
  wind_speed_10m: [...Array(20).fill(5), 6, 14, 18, 20, ...Array(24).fill(5)],
}};

describe('buildDayOutlook', () => {
  const full = buildDayOutlook(hf, DAY, 'imperial');

  it('groups the day by the glossary day parts', () => {
    expect(full).toBe([
      'overnight (12a–5a) 48→45°, dry',
      'early morning (5a–8a) 45→48°, dry',
      'morning (8a–12p) 51→61°, dry',
      'afternoon (12p–6p) 63→62°, dry',
      'evening (6p–9p) 60→57°, slight chance of rain 25%',
      'night (9p–12a) 55→52°, rain likely 65% from 11p',
    ].join('; '));
  });

  it('keeps 10pm in night, so the low 50s never read as evening', () => {
    expect(full).toContain('evening (6p–9p) 60→57°');
    expect(full).toContain('night (9p–12a) 55→52°');
  });

  it('keeps late rain out of the evening', () => {
    // The evening is only a slight chance; the likely rain is a night event.
    expect(full).toContain('evening (6p–9p) 60→57°, slight chance of rain');
    expect(full).not.toMatch(/evening[^;]*likely/);
  });

  it('drops past hours and clips the part under way', () => {
    const rest = buildDayOutlook(hf, DAY, 'imperial', { fromHour: 19 });
    expect(rest.startsWith('evening (7p–9p) 58→57°')).toBe(true);
    expect(rest).not.toContain('morning');
    expect(rest).not.toContain('afternoon');
  });

  it('says "around" when a part holds steady', () => {
    expect(buildDayOutlook(hf, NEXT, 'imperial')).toContain('overnight (12a–5a) around 50°, dry');
  });

  it('respects units', () => {
    expect(buildDayOutlook(hf, DAY, 'metric')).toContain('night (9p–12a) 13→11°');
  });

  it('stays inside the 500-char clampBody cap on a wet day', () => {
    const wet = { hourly: { ...hf.hourly, precipitation_probability: Array(48).fill(100) } };
    expect(buildDayOutlook(wet, DAY, 'imperial').length).toBeLessThan(500);
  });

  it('null when there is nothing left to describe', () => {
    expect(buildDayOutlook(hf, DAY, 'imperial', { fromHour: 24 })).toBeNull();
    expect(buildDayOutlook(hf, '2026-11-09', 'imperial')).toBeNull();
    expect(buildDayOutlook(null, DAY, 'imperial')).toBeNull();
  });
});

describe('buildLookahead', () => {
  const at = h => new Date(2026, 10, 4, h, 15);

  it('reports what changes in the next few hours', () => {
    // 8pm → 11pm: 57→52°, rain building to likely at 11p, wind 6→20 mph.
    expect(buildLookahead(hf, 'imperial', at(20))).toBe(
      '57→52°, rain likely 65% from 11p, wind picking up to 20 mph'
    );
  });

  it('null when nothing notable changes', () => {
    // 1am → 4am: 47→45°, dry, calm.
    expect(buildLookahead(hf, 'imperial', at(1))).toBeNull();
  });

  it('null without hourly data for now', () => {
    expect(buildLookahead(hf, 'imperial', new Date(2026, 10, 9, 12))).toBeNull();
    expect(buildLookahead(null, 'imperial', at(12))).toBeNull();
  });
});
