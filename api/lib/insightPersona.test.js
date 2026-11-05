import { describe, it, expect } from 'vitest';
import { PERSONA, sharedRules, buildSystem, aqiLine, sourceLine } from './insightPersona';
import { dayPartGuide, rainGuide } from '../../src/utils/insightVocab';

describe('sharedRules', () => {
  // The glossaries are rendered from the code tables, so the words the model
  // is told to use can't drift from the ones the outlook layer emits.
  it('embeds the day-part and rain glossaries verbatim', () => {
    const rules = sharedRules();
    expect(rules).toContain(dayPartGuide());
    expect(rules).toContain(rainGuide());
  });
  it('forbids inventing facts', () => {
    expect(sharedRules()).toMatch(/Never invent a value, a time, or a trend/);
  });
});

describe('buildSystem', () => {
  it('assembles persona, source, job, rules and examples in that order', () => {
    const sys = buildSystem({ isPreview: false, job: 'JOB.', examples: ['Example one.'] });
    const order = [PERSONA, sourceLine(false), 'JOB.', sharedRules(), '"Example one."']
      .map(part => sys.indexOf(part));
    order.forEach(i => expect(i).toBeGreaterThanOrEqual(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('never claims a backyard station in preview mode', () => {
    expect(buildSystem({ isPreview: true, job: '' })).not.toContain('backyard station');
  });
});

describe('aqiLine', () => {
  it('prescribes the EPA-consistent phrase', () => {
    expect(aqiLine(86)).toContain('"acceptable but not pristine"');
  });
});
