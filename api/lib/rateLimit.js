// Per-IP rate limiting for the serverless routes (weather.js, insight.js).
//
// A sliding log: each IP keeps the times of its recent calls, and a call is
// refused once `limit` of them fall inside the last `windowMs`. A timestamp
// only counts while its age is in [0, windowMs) — if the host clock jumps
// backward, earlier calls look like they happen in the future, and counting
// them (or waiting for a reset deadline that is now further away) would lock
// that IP out until the instance recycles. Same rule as the insight cache.
//
// State lives in module memory, so it is per warm instance — a speed bump, not
// a quota. Idle IPs are dropped as calls come in (at most once per window),
// so no timer is needed.

// The caller's IP: the first x-forwarded-for hop (Vercel sets it), else the socket.
export function clientIp(req) {
  const fwd = req?.headers?.['x-forwarded-for'];
  const first = typeof fwd === 'string' ? fwd.split(',')[0].trim() : '';
  return first || req?.socket?.remoteAddress || 'unknown';
}

export function createRateLimiter({ limit, windowMs }) {
  const log = new Map(); // ip → call times, oldest first
  let lastSweep = null;

  const inWindow = (ts, now) => {
    const age = now - ts;
    return age >= 0 && age < windowMs;
  };

  function sweep(now) {
    for (const [ip, times] of log) {
      if (!times.some(ts => inWindow(ts, now))) log.delete(ip);
    }
    lastSweep = now;
  }

  return {
    // Records a call from `ip`; true when it is over the limit (and not recorded).
    hit(ip, now = Date.now()) {
      if (lastSweep === null || !inWindow(lastSweep, now)) sweep(now);
      const recent = (log.get(ip) ?? []).filter(ts => inWindow(ts, now));
      if (recent.length >= limit) {
        log.set(ip, recent);
        return true;
      }
      recent.push(now);
      log.set(ip, recent);
      return false;
    },
    // How many IPs are being tracked (for tests).
    get size() { return log.size; },
  };
}
