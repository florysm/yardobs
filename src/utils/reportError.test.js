import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let fetchMock;
beforeEach(() => {
  vi.resetModules();
  fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const load = () => import('./reportError.js');

describe('buildReport', () => {
  it('names the error and where it happened', async () => {
    const { buildReport } = await load();
    const r = buildReport(new TypeError('x is undefined'), { where: 'dashboard', componentStack: 'in DashboardView' });
    expect(r.message).toBe('TypeError: x is undefined');
    expect(r.where).toBe('dashboard');
    expect(r.componentStack).toBe('in DashboardView');
  });
  it('turns non-errors into a message', async () => {
    const { buildReport } = await load();
    expect(buildReport('plain text').message).toBe('Error: plain text');
    expect(buildReport(undefined).message).toBe('Error: Unknown error');
  });
});

describe('reportError', () => {
  it('posts a report once per error and place', async () => {
    const { reportError } = await load();
    reportError(new Error('boom'), { where: 'a' });
    reportError(new Error('boom'), { where: 'a' });
    reportError(new Error('boom'), { where: 'b' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/client-error');
    expect(JSON.parse(opts.body).message).toBe('Error: boom');
  });
  it('stops after a few reports per page load', async () => {
    const { reportError } = await load();
    for (let i = 0; i < 20; i++) reportError(new Error(`e${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
  it('never throws, even when fetch does', async () => {
    vi.stubGlobal('fetch', () => { throw new Error('no network'); });
    const { reportError } = await load();
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });
});
