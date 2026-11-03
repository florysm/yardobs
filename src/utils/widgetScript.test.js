import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildWidgetScript, widgetConfigFromSettings, buildWidgetUpdatePayload } from './widgetScript';

const TEMPLATE = readFileSync(new URL('../../public/widget/yardobs-widget.js', import.meta.url), 'utf8');

function extractConfig(script) {
  const m = script.match(/\/\*YARDOBS_CONFIG\*\/([\s\S]*?)\/\*END\*\//);
  return JSON.parse(m[1]);
}

describe('widgetConfigFromSettings', () => {
  it('builds a station config from the home station and key', () => {
    const cfg = widgetConfigFromSettings({
      profile: { mode: 'station', stationId: 'KTXAUST123', exploring: { lat: 1, lon: 2, label: 'Elsewhere' } },
      twcKey: 'abc', keyExpires: '2026-11-15', units: 'metric', now: 1000,
    });
    expect(cfg).toEqual({ mode: 'station', stationId: 'KTXAUST123', twcKey: 'abc', keyExpires: '2026-11-15', lat: null, lon: null, label: null, units: 'metric', generatedAt: 1000 });
  });

  it('returns null for a station without a key', () => {
    expect(widgetConfigFromSettings({ profile: { mode: 'station', stationId: 'KTXAUST123' }, twcKey: '', units: 'imperial' })).toBeNull();
  });

  it('builds a preview config from the saved location and never includes a key', () => {
    const cfg = widgetConfigFromSettings({
      profile: { mode: 'preview', lat: 30.27, lon: -97.74, label: 'Austin, TX' },
      twcKey: 'leftover', keyExpires: '2026-11-15', units: 'imperial', now: 1000,
    });
    expect(cfg).toEqual({ mode: 'preview', stationId: null, twcKey: null, keyExpires: null, lat: 30.27, lon: -97.74, label: 'Austin, TX', units: 'imperial', generatedAt: 1000 });
  });

  it('returns null for preview without a location', () => {
    expect(widgetConfigFromSettings({ profile: { mode: 'preview' }, units: 'imperial' })).toBeNull();
  });

  it('defaults unknown units to imperial', () => {
    expect(widgetConfigFromSettings({ profile: { mode: 'preview', lat: 0, lon: 0 }, units: undefined }).units).toBe('imperial');
  });
});

describe('buildWidgetScript', () => {
  it('replaces the template config with the given values', () => {
    const cfg = { mode: 'preview', stationId: null, twcKey: null, lat: 1.5, lon: -2.5, label: 'Here', units: 'metric' };
    const out = buildWidgetScript(TEMPLATE, cfg);
    expect(extractConfig(out)).toEqual(cfg);
    expect(out.match(/YARDOBS_CONFIG/g)).toHaveLength(1);
  });

  it('safely embeds quotes, `$` patterns and comment terminators in values', () => {
    const cfg = { mode: 'preview', lat: 0, lon: 0, label: `Bob's "Yard" $& */ \\`, units: 'imperial' };
    const out = buildWidgetScript(TEMPLATE, cfg);
    expect(extractConfig(out).label).toBe(cfg.label);
  });

  it('throws when the marker is missing', () => {
    expect(() => buildWidgetScript('const CONFIG = {};', {})).toThrow(/marker/);
  });
});

describe('buildWidgetUpdatePayload', () => {
  it('wraps the config in a tagged object the widget recognizes', () => {
    const cfg = { mode: 'station', twcKey: 'abc' };
    expect(JSON.parse(buildWidgetUpdatePayload(cfg))).toEqual({ yardobsWidgetConfig: cfg });
  });
});
