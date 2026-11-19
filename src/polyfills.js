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
