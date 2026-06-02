// Sets CORS headers and handles OPTIONS preflight.
// Returns true if the request was fully handled (caller should return immediately).
export function applyCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return true; }
  return false;
}
