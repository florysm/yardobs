import { describe, it, expect } from 'vitest';
import { buildRadarFrames, hasRadarCoverage, RADAR_RANGES } from './radarFrames.js';

// 2026-10-15 15:48:04 UTC
const NOW = Date.UTC(2026, 9, 15, 15, 48, 4);
const nowSec = Math.floor(NOW / 1000);

describe('buildRadarFrames', () => {
  const { frames, pastCount } = buildRadarFrames(NOW);

  it('builds 12 observed frames then 8 forecast frames', () => {
    expect(pastCount).toBe(12);
    expect(frames).toHaveLength(20);
    expect(frames.slice(0, 12).every(f => !f.projected)).toBe(true);
    expect(frames.slice(12).every(f => f.projected)).toBe(true);
  });

  it('orders observed frames oldest to newest, ending on the current composite', () => {
    expect(frames[0].url).toContain('nexrad-n0q-900913-m55m');
    expect(frames[10].url).toContain('nexrad-n0q-900913-m05m');
    expect(frames[11].url).toMatch(/nexrad-n0q-900913\/\{z\}/);
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].time).toBeGreaterThan(frames[i - 1].time);
    }
  });

  it('aligns observed times to 5 minutes', () => {
    expect(frames[11].time).toBe(Date.UTC(2026, 9, 15, 15, 45) / 1000);
    expect(frames[0].time).toBe(Date.UTC(2026, 9, 15, 14, 50) / 1000);
  });

  it('forecasts every 15 minutes out to two hours', () => {
    const last = frames[frames.length - 1];
    expect(last.time).toBe(Date.UTC(2026, 9, 15, 17, 45) / 1000);
    expect(frames[12].time).toBe(Date.UTC(2026, 9, 15, 16, 0) / 1000);
    expect(last.time - nowSec).toBeLessThanOrEqual(2 * 3600);
  });

  it('names an explicit HRRR run and offsets in whole 15-minute steps', () => {
    // 15:48 - 90 min = 14:18 → run 14:00; frame at 16:00 is F0120
    expect(frames[12].url).toContain('hrrr::REFD-F0120-202610151400');
    expect(frames[19].url).toContain('hrrr::REFD-F0225-202610151400');
    for (const f of frames.slice(12)) {
      const offset = Number(f.url.match(/REFD-F(\d{4})/)[1]);
      expect(offset % 15).toBe(0);
    }
  });

  it('keeps Leaflet placeholders in every url', () => {
    expect(frames.every(f => f.url.includes('{z}/{x}/{y}.png'))).toBe(true);
  });

  it('rolls the run stamp across midnight', () => {
    const { frames: f } = buildRadarFrames(Date.UTC(2026, 9, 16, 0, 20));
    expect(f[12].url).toContain('202610152200');
  });
});

describe('forecast ranges', () => {
  const counts = { '2h': 8, '6h': 12, '12h': 12 };

  for (const key of Object.keys(RADAR_RANGES)) {
    it(`${key}: expected frame count, aligned steps, within HRRR's 18h`, () => {
      const { frames, pastCount } = buildRadarFrames(NOW, key);
      const forecast = frames.slice(pastCount);
      expect(forecast).toHaveLength(counts[key]);
      const { hours, stepMin } = RADAR_RANGES[key];
      expect(forecast[forecast.length - 1].time - nowSec).toBeLessThanOrEqual(hours * 3600);
      for (const f of forecast) {
        const offset = Number(f.url.match(/REFD-F(\d{4})/)[1]);
        expect(offset % 15).toBe(0);
        expect(offset).toBeLessThanOrEqual(18 * 60);
        expect((f.time / 60) % stepMin).toBe(0);
      }
    });
  }

  it('stays under 18h even at the worst-case run lag', () => {
    // 15:00:00 sits right after an hour boundary: the run is 2.5h old
    const t = Date.UTC(2026, 9, 15, 15, 0, 0);
    const { frames, pastCount } = buildRadarFrames(t, '12h');
    const last = frames[frames.length - 1];
    expect(Number(last.url.match(/REFD-F(\d{4})/)[1])).toBeLessThanOrEqual(18 * 60);
    expect(frames.length - pastCount).toBe(12);
  });

  it('falls back to the default for an unknown range', () => {
    expect(buildRadarFrames(NOW, 'nope').frames).toHaveLength(20);
  });
});

describe('hasRadarCoverage', () => {
  it('accepts US locations', () => {
    expect(hasRadarCoverage(47.6, -122.3)).toBe(true);  // Seattle
    expect(hasRadarCoverage(61.2, -149.9)).toBe(true);  // Anchorage
    expect(hasRadarCoverage(21.3, -157.8)).toBe(true);  // Honolulu
    expect(hasRadarCoverage(18.4, -66.1)).toBe(true);   // San Juan
  });

  it('rejects locations outside coverage', () => {
    expect(hasRadarCoverage(51.5, -0.1)).toBe(false);   // London
    expect(hasRadarCoverage(35.7, 139.7)).toBe(false);  // Tokyo
    expect(hasRadarCoverage(null, null)).toBe(false);
  });

  it('treats latitude/longitude 0 as a real value, not missing', () => {
    expect(hasRadarCoverage(0, 0)).toBe(false);
  });
});
