import { getUserFromRequest, createServiceClient } from './lib/supabase.js';
import { encrypt } from './lib/crypto.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createServiceClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_weather_settings')
      .select('id, station_id, station_label, created_at, updated_at')
      .eq('user_id', user.id)
      .single();

    // PGRST116 = no rows found — user just hasn't set up yet
    if (error?.code === 'PGRST116') return res.status(200).json(null);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { stationId, stationLabel, twcApiKey } = req.body ?? {};
    if (!stationId?.trim()) return res.status(400).json({ error: 'stationId is required' });

    // Check whether the user already has settings (determines if a key is required)
    const { data: existing } = await supabase
      .from('user_weather_settings')
      .select('encrypted_twc_api_key')
      .eq('user_id', user.id)
      .single();

    const isNew = !existing;
    if (isNew && !twcApiKey?.trim()) {
      return res.status(400).json({ error: 'twcApiKey is required for initial setup' });
    }

    let encryptedKey = existing?.encrypted_twc_api_key;
    if (twcApiKey?.trim()) {
      try {
        encryptedKey = encrypt(twcApiKey.trim());
      } catch (err) {
        return res.status(500).json({ error: 'Encryption not configured: ' + err.message });
      }
    }

    const { data, error } = await supabase
      .from('user_weather_settings')
      .upsert(
        {
          user_id: user.id,
          station_id: stationId.trim(),
          station_label: stationLabel?.trim() || null,
          encrypted_twc_api_key: encryptedKey,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('id, station_id, station_label, created_at, updated_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
