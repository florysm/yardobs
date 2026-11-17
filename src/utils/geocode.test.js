import { describe, it, expect, vi, afterEach } from 'vitest';
import { coordLabel, reverseGeocode } from './geocode';

describe('coordLabel', () => {
  it('labels each hemisphere', () => {
    expect(coordLabel(40.33, -79.73)).toBe('40.3°N, 79.7°W');
    expect(coordLabel(-33.87, 151.21)).toBe('33.9°S, 151.2°E');
    expect(coordLabel(0, 0)).toBe('0.0°N, 0.0°E');
  });
});

describe('reverseGeocode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses city and state when Nominatim has them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ address: { city: 'Pittsburgh', state: 'Pennsylvania' } }),
    }));
    expect(await reverseGeocode(40.44, -79.99)).toBe('Pittsburgh, Pennsylvania');
  });

  it('falls back to coordinates when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await reverseGeocode(-33.87, 151.21)).toBe('33.9°S, 151.2°E');
  });

  it('falls back to coordinates when there is no place name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ address: {} }) }));
    expect(await reverseGeocode(0, -30)).toBe('0.0°N, 30.0°W');
  });
});
