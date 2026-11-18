import { describe, it, expect } from 'vitest';
import { clientIp, createRateLimiter } from './rateLimit.js';

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-17T12:00:00Z');

describe('createRateLimiter', () => {
  it('allows `limit` calls per window, per IP', () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 5 * MIN });
    expect([1, 2, 3].map(i => rl.hit('a', T0 + i))).toEqual([false, false, false]);
    expect(rl.hit('a', T0 + 4)).toBe(true);
    expect(rl.hit('b', T0 + 4)).toBe(false);
  });

  it('is a sliding window: calls free up as they age out', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 5 * MIN });
    rl.hit('a', T0);
    rl.hit('a', T0 + 2 * MIN);
    expect(rl.hit('a', T0 + 4 * MIN)).toBe(true);
    expect(rl.hit('a', T0 + 5 * MIN)).toBe(false);   // the T0 call has aged out
    expect(rl.hit('a', T0 + 6 * MIN)).toBe(true);    // T0+2 and T0+5 still count
  });

  it('refused calls do not extend the block', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 5 * MIN });
    rl.hit('a', T0);
    for (let i = 1; i < 5; i++) expect(rl.hit('a', T0 + i * MIN)).toBe(true);
    expect(rl.hit('a', T0 + 5 * MIN)).toBe(false);
  });

  it('recovers after the clock jumps backward', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 5 * MIN });
    rl.hit('a', T0);
    rl.hit('a', T0);
    expect(rl.hit('a', T0)).toBe(true);
    // An hour earlier: the stored calls are "in the future" and no longer count.
    expect(rl.hit('a', T0 - 60 * MIN)).toBe(false);
  });

  it('drops idle IPs as calls come in', () => {
    const rl = createRateLimiter({ limit: 5, windowMs: 5 * MIN });
    rl.hit('a', T0);
    rl.hit('b', T0);
    expect(rl.size).toBe(2);
    rl.hit('c', T0 + 10 * MIN);
    expect(rl.size).toBe(1);
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': ' 1.2.3.4 , 10.0.0.1' } })).toBe('1.2.3.4');
  });
  it('falls back to the socket, then "unknown"', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '5.6.7.8' } })).toBe('5.6.7.8');
    expect(clientIp({ headers: { 'x-forwarded-for': '' } })).toBe('unknown');
    expect(clientIp({})).toBe('unknown');
  });
});
