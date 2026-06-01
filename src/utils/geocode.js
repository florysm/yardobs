const OM_GEO  = 'https://geocoding-api.open-meteo.com/v1/search';
const NOM_REV = 'https://nominatim.openstreetmap.org/reverse';

export async function reverseGeocode(lat, lon) {
  try {
    const res  = await fetch(`${NOM_REV}?lat=${lat}&lon=${lon}&format=json`, {
      headers: { 'User-Agent': 'YardObs/1.0 (steve.flory@gmail.com)' },
    });
    const data = await res.json();
    const city  = data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
    const state = data.address?.state_code || data.address?.state || '';
    if (city) return state ? `${city}, ${state}` : city;
  } catch {}
  return `${lat.toFixed(1)}°N, ${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`;
}

export async function forwardGeocode(input) {
  const res  = await fetch(`${OM_GEO}?name=${encodeURIComponent(input)}&count=5&language=en&format=json`);
  const data = await res.json();
  const result = data.results?.[0];
  if (!result) throw new Error(`No results found for "${input}"`);
  const { latitude: lat, longitude: lon } = result;
  const label = await reverseGeocode(lat, lon);
  return { lat, lon, label };
}

export async function searchLocations(query) {
  if (query.trim().length < 2) return [];
  try {
    const res  = await fetch(`${OM_GEO}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`);
    const data = await res.json();
    return (data.results ?? []).map(r => ({
      id: r.id,
      lat: r.latitude,
      lon: r.longitude,
      label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    }));
  } catch {
    return [];
  }
}
