import { describe, it, expect } from 'vitest';
import { normalizeAlerts, severityColor, severityRank } from './alerts';

const mk = (props) => ({ properties: { messageType: 'Alert', status: 'Actual', ...props } });

describe('normalizeAlerts (NWS)', () => {
  it('sorts worst-first, dedups by event, drops Cancel and non-Actual', () => {
    const raw = { features: [
      mk({ id: 'a1', event: 'Flood Advisory', severity: 'Minor', ends: '2026-07-14T17:00:00Z' }),
      mk({ id: 'a2', event: 'Severe Thunderstorm Warning', severity: 'Severe' }),
      mk({ id: 'a3', event: 'Severe Thunderstorm Warning', severity: 'Severe' }), // dup event
      mk({ id: 'a4', event: 'Tornado Warning', severity: 'Extreme' }),
      mk({ id: 'a5', event: 'Old', severity: 'Severe', messageType: 'Cancel' }),   // dropped
      mk({ id: 'a6', event: 'Test', severity: 'Severe', status: 'Test' }),          // dropped
    ]};
    const out = normalizeAlerts(raw);
    expect(out.map(a => a.event)).toEqual([
      'Tornado Warning', 'Severe Thunderstorm Warning', 'Flood Advisory',
    ]);
    expect(out[0].severity).toBe('extreme');
  });

  it('maps fields and falls back gracefully', () => {
    const [a] = normalizeAlerts({ features: [mk({
      id: 'x', event: 'Heat Advisory', severity: 'Moderate',
      headline: 'Hot', description: 'desc', instruction: 'drink water',
      onset: '2026-07-14T11:00:00Z', ends: '2026-07-14T19:00:00Z',
    })]});
    expect(a).toMatchObject({
      id: 'x', event: 'Heat Advisory', severity: 'moderate',
      headline: 'Hot', description: 'desc', instruction: 'drink water', source: 'nws',
    });
  });

  it('empty/null payloads → []', () => {
    expect(normalizeAlerts({ features: [] })).toEqual([]);
    expect(normalizeAlerts(null)).toEqual([]);
    expect(normalizeAlerts({})).toEqual([]);
  });
});

describe('severity helpers', () => {
  it('ranks worst → best', () => {
    expect(severityRank('extreme')).toBeGreaterThan(severityRank('severe'));
    expect(severityRank('severe')).toBeGreaterThan(severityRank('minor'));
    expect(severityRank('unknown')).toBe(0);
  });
  it('returns a color per severity, with a fallback', () => {
    expect(severityColor('severe')).toMatch(/^#/);
    expect(severityColor('nonsense')).toBe(severityColor('unknown'));
  });
});
