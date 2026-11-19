import { describe, it, expect, vi, afterEach } from 'vitest';

const { default: handler, ROUTE_TYPES } = await import('./weather.js');

let ip = 0;
function call(query, headers = { 'x-twc-key': 'k' }) {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn(), end: vi.fn() };
  // A fresh IP per call keeps the per-IP rate limiter out of the way.
  const req = { method: 'GET', query, headers: { ...headers, 'x-forwarded-for': `10.1.0.${++ip}` } };
  return handler(req, res).then(() => res);
}

function upstream(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('/api/weather', () => {
  it('passes a normal upstream JSON body through', async () => {
    upstream(200, '{"observations":[{"stationID":"S1"}]}');
    const res = await call({ type: 'current', stationId: 'S1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ observations: [{ stationID: 'S1' }] });
  });

  it('trims and URL-encodes the key before splicing it into the TWC URL', async () => {
    upstream(200, '{"observations":[]}');
    await call({ type: 'current', stationId: 'S1' }, { 'x-twc-key': ' ab+c&d ' });
    const url = fetch.mock.calls[0][0];
    expect(url).toMatch(/apiKey=ab%2Bc%26d$/);
  });

  it('treats a blank key as missing', async () => {
    const res = await call({ type: 'current', stationId: 'S1' }, { 'x-twc-key': '   ' });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('turns a TWC 204 on a history route into an empty, cacheable day', async () => {
    for (const type of ['history', 'history-daily']) {
      upstream(204, '');
      const res = await call({ type, stationId: 'S1', date: '20251110' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ observations: [] });
    }
  });

  it('reports a TWC 204 on current as a missing/offline station', async () => {
    upstream(204, '');
    const res = await call({ type: 'current', stationId: 'S1' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toMatch(/offline/);
  });

  it('maps upstream errors to friendly messages', async () => {
    upstream(401, 'nope');
    const res = await call({ type: 'current', stationId: 'S1' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/expired/);
  });

  it('requires the caller\'s key for TWC routes but not keyless ones', async () => {
    upstream(200, '{}');
    const noKey = await call({ type: 'current', stationId: 'S1' }, {});
    expect(noKey.status).toHaveBeenCalledWith(401);
    const keyless = await call({ type: 'hourly-forecast', lat: '40', lon: '-80' }, {});
    expect(keyless.status).toHaveBeenCalledWith(200);
  });

  it('rejects malformed params before calling upstream', async () => {
    upstream(200, '{}');
    expect((await call({ type: 'history', stationId: 'S1', date: '2025-11-10' })).status).toHaveBeenCalledWith(400);
    expect((await call({ type: 'current', stationId: 'S 1' })).status).toHaveBeenCalledWith(400);
    expect((await call({ type: 'alerts', lat: '91', lon: '0' })).status).toHaveBeenCalledWith(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists every supported type for an unknown one', async () => {
    const res = await call({ type: 'air-quality', lat: '40', lon: '-80' });
    expect(res.status).toHaveBeenCalledWith(400);
    const msg = res.json.mock.calls[0][0].error;
    for (const t of ROUTE_TYPES) expect(msg).toContain(t);
    expect(ROUTE_TYPES).toContain('history-recent');
  });
});

describe('rate limiting', () => {
  it('refuses the 31st call from one IP within 5 minutes', async () => {
    const res = () => ({ status: vi.fn(function () { return this; }), json: vi.fn(function () { return this; }), setHeader: vi.fn(), end: vi.fn() });
    const req = { method: 'GET', query: { type: 'nope' }, headers: { 'x-forwarded-for': '10.9.9.9' } };
    for (let i = 0; i < 30; i++) {
      const r = res();
      await handler(req, r);
      expect(r.status).not.toHaveBeenCalledWith(429); // refused later (no key), never upstream
    }
    const blocked = res();
    await handler(req, blocked);
    expect(blocked.status).toHaveBeenCalledWith(429);
  });
});
