const TWC_BASE = 'https://api.weather.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.TWC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'TWC_API_KEY not configured' });

  const { type, stationId, date, lat, lon } = req.query;

  let url;
  switch (type) {
    case 'current':
      if (!stationId) return res.status(400).json({ error: 'stationId required' });
      url = `${TWC_BASE}/v2/pws/observations/current?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&apiKey=${apiKey}`;
      break;
    case 'history':
      if (!stationId || !date) return res.status(400).json({ error: 'stationId and date required' });
      url = `${TWC_BASE}/v2/pws/history/hourly?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&date=${date}&apiKey=${apiKey}`;
      break;
    case 'history-recent':
      if (!stationId) return res.status(400).json({ error: 'stationId required' });
      url = `${TWC_BASE}/v2/pws/observations/hourly/7day?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&apiKey=${apiKey}`;
      break;
    case 'history-daily':
      if (!stationId || !date) return res.status(400).json({ error: 'stationId and date required' });
      url = `${TWC_BASE}/v2/pws/history/daily?stationId=${stationId}&format=json&units=e&numericPrecision=decimal&date=${date}&apiKey=${apiKey}`;
      break;
    case 'forecast':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `${TWC_BASE}/v3/wx/forecast/daily/5day?geocode=${lat},${lon}&format=json&units=e&language=en-US&apiKey=${apiKey}`;
      break;
    case 'hourly-forecast':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,weathercode,apparent_temperature,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,uv_index&forecast_days=2&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`;
      break;
    case 'air-quality':
      if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
      url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,pm10,ozone&timezone=auto`;
      break;
    default:
      return res.status(400).json({ error: 'Invalid type. Use: current, history, history-daily, forecast, hourly-forecast' });
  }

  try {
    const upstream = await fetch(url);
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return res.status(502).json({ error: 'Upstream non-JSON response', status: upstream.status, body: text.slice(0, 200) });
    }
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream fetch failed', detail: err.message });
  }
}
