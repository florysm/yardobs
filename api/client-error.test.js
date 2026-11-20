import { describe, it, expect, vi, afterEach } from 'vitest';
import handler, { scrub, cleanReport } from './client-error.js';

let ip = 0;
function call(body, method = 'POST') {
  const res = { status: vi.fn(() => res), json: vi.fn(() => res), setHeader: vi.fn(), end: vi.fn() };
  const req = { method, body, headers: { 'x-forwarded-for': `10.9.0.${++ip}` } };
  return handler(req, res).then(() => res);
}

afterEach(() => vi.restoreAllMocks());

describe('scrub', () => {
  it('hides key-shaped strings and setup links', () => {
    expect(scrub('key e1f10a1e78da46f5b10a1e78da96f525 bad')).toBe('key [redacted] bad');
    expect(scrub('at https://yardobs.app/#setup=eyJzIjoiSyJ9 line 3')).toBe('at https://yardobs.app/#setup… line 3');
  });
});

describe('cleanReport', () => {
  it('keeps known fields, trims long ones, drops the rest', () => {
    const r = cleanReport({ message: 'boom', stack: 'x'.repeat(5000), extra: 'nope', where: 'dashboard' });
    expect(r.message).toBe('boom');
    expect(r.stack).toHaveLength(4000);
    expect(r.where).toBe('dashboard');
    expect(r).not.toHaveProperty('extra');
  });
  it('needs a message', () => {
    expect(cleanReport({ stack: 'x' })).toBeNull();
    expect(cleanReport(null)).toBeNull();
  });
});

describe('client-error handler', () => {
  it('logs a report and answers 204', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call({ message: 'TypeError: x is undefined', version: '1.14.1' });
    expect(res.status).toHaveBeenCalledWith(204);
    expect(log).toHaveBeenCalledWith('[client-error]', expect.stringContaining('x is undefined'));
  });
  it('accepts a JSON string body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call(JSON.stringify({ message: 'boom' }));
    expect(res.status).toHaveBeenCalledWith(204);
  });
  it('refuses other methods and empty reports', async () => {
    expect((await call({ message: 'x' }, 'GET')).status).toHaveBeenCalledWith(405);
    expect((await call({})).status).toHaveBeenCalledWith(400);
  });
});
