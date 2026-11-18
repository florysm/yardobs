import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from './apiFetch';
import { STORAGE_KEYS } from './storageKeys';

let stored;
beforeEach(() => {
  stored = {};
  vi.stubGlobal('localStorage', { getItem: k => stored[k] ?? null });
});
afterEach(() => vi.unstubAllGlobals());

const respond = (status, body) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: status >= 200 && status < 300, status, json: async () => body,
}));

describe('apiFetch', () => {
  it('sends the saved TWC key and returns the JSON body', async () => {
    stored[STORAGE_KEYS.TWC_API_KEY] = 'abc';
    respond(200, { ok: 1 });
    expect(await apiFetch('/api/weather', { headers: { A: 'b' } })).toEqual({ ok: 1 });
    expect(fetch.mock.calls[0][1].headers).toEqual({ A: 'b', 'X-TWC-Key': 'abc' });
  });

  it('sends no key header when none is saved or storage is unavailable', async () => {
    respond(200, {});
    await apiFetch('/x');
    expect(fetch.mock.calls[0][1].headers).toEqual({});
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); } });
    await apiFetch('/x');
    expect(fetch.mock.calls[1][1].headers).toEqual({});
  });

  it('throws the server error message, or the status when there is none', async () => {
    respond(404, { error: 'Station not found' });
    await expect(apiFetch('/x')).rejects.toThrow('Station not found');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    await expect(apiFetch('/x')).rejects.toThrow('HTTP 502');
  });

  it('passes the abort signal through', async () => {
    respond(200, {});
    const { signal } = new AbortController();
    await apiFetch('/x', { signal });
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
  });
});

describe('apiFetch key and status', () => {
  it("keeps a caller's own key header over the saved one", async () => {
    stored[STORAGE_KEYS.TWC_API_KEY] = 'saved';
    respond(200, {});
    await apiFetch('/x', { headers: { 'x-twc-key': 'new' } });
    expect(fetch.mock.calls[0][1].headers).toEqual({ 'x-twc-key': 'new' });
  });

  it('sets status on errors the server answered', async () => {
    respond(401, { error: 'Key rejected' });
    await expect(apiFetch('/x')).rejects.toMatchObject({ message: 'Key rejected', status: 401 });
  });
});
