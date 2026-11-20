// Browser APIs that core-js (via @vitejs/plugin-legacy) doesn't provide.
// Each one installs only where the browser lacks it, so modern browsers are
// untouched. Imported first in main.jsx.

// AbortController arrived in Safari 11.1; iOS 10 (iPad 4) throws a
// ReferenceError on `new AbortController()`. This stand-in can't cancel a
// fetch in flight, but every caller also checks `signal.aborted` before using
// a response, which is the part that matters: stale replies are dropped.
if (typeof window !== 'undefined' && typeof window.AbortController === 'undefined') {
  class AbortSignalShim {
    constructor() { this.aborted = false; this.onabort = null; this._listeners = []; }
    addEventListener(type, fn) { if (type === 'abort') this._listeners.push(fn); }
    removeEventListener(type, fn) { this._listeners = this._listeners.filter(l => l !== fn); }
  }
  class AbortControllerShim {
    constructor() { this.signal = new AbortSignalShim(); }
    abort() {
      const s = this.signal;
      if (s.aborted) return;
      s.aborted = true;
      const evt = { type: 'abort', target: s };
      if (typeof s.onabort === 'function') s.onabort(evt);
      s._listeners.forEach(fn => fn(evt));
    }
  }
  window.AbortController = AbortControllerShim;
}

// ResizeObserver arrived in Safari 13.1. Recharts' ResponsiveContainer (Trends
// tab) calls `new ResizeObserver` and throws on iOS 10 without it. This
// stand-in reports each observed element's size when it starts observing,
// on window resize/rotation, and on a slow poll, which is enough for charts
// that size to their container.
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  const POLL_MS = 1000;
  class ResizeObserverShim {
    constructor(callback) {
      this._callback = callback;
      this._targets = [];
      this._sizes = [];
      this._check = this._check.bind(this);
    }
    _entry(el) {
      const r = el.getBoundingClientRect();
      const box = { width: r.width, height: r.height, top: 0, left: 0, right: r.width, bottom: r.height, x: 0, y: 0 };
      return { target: el, contentRect: box };
    }
    _check(force) {
      const changed = [];
      this._targets.forEach((el, i) => {
        const e = this._entry(el);
        const prev = this._sizes[i];
        if (force === true || !prev || prev.width !== e.contentRect.width || prev.height !== e.contentRect.height) {
          this._sizes[i] = e.contentRect;
          changed.push(e);
        }
      });
      if (changed.length) this._callback(changed, this);
    }
    observe(el) {
      if (!el || this._targets.indexOf(el) >= 0) return;
      this._targets.push(el);
      this._sizes.push(null);
      if (this._targets.length === 1) {
        window.addEventListener('resize', this._check);
        window.addEventListener('orientationchange', this._check);
        this._timer = setInterval(this._check, POLL_MS);
      }
      setTimeout(this._check, 0);
    }
    unobserve(el) {
      const i = this._targets.indexOf(el);
      if (i < 0) return;
      this._targets.splice(i, 1);
      this._sizes.splice(i, 1);
      if (!this._targets.length) this.disconnect();
    }
    disconnect() {
      this._targets = [];
      this._sizes = [];
      window.removeEventListener('resize', this._check);
      window.removeEventListener('orientationchange', this._check);
      clearInterval(this._timer);
    }
  }
  window.ResizeObserver = ResizeObserverShim;
}
