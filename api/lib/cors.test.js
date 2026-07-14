import { describe, it, expect } from 'vitest';
import { applyCors } from './cors.js';

function mockRes() {
  return {
    headers: {},
    statusCode: null,
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    end() { this.ended = true; return this; },
  };
}

describe('applyCors', () => {
  it('reflects an allowed origin and continues', () => {
    const res = mockRes();
    const handled = applyCors({ method: 'GET', headers: { origin: 'https://yardobs.app' } }, res);
    expect(handled).toBe(false);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://yardobs.app');
  });

  it('sends no ACAO header for a disallowed origin', () => {
    const res = mockRes();
    const handled = applyCors({ method: 'GET', headers: { origin: 'https://evil.example' } }, res);
    expect(handled).toBe(false);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('short-circuits OPTIONS preflight with 200', () => {
    const res = mockRes();
    const handled = applyCors({ method: 'OPTIONS', headers: { origin: 'https://yardobs.app' } }, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
  });

  it('tolerates a missing origin', () => {
    const res = mockRes();
    const handled = applyCors({ method: 'GET', headers: {} }, res);
    expect(handled).toBe(false);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
