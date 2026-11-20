// Sends unexpected errors to /api/client-error, which writes them to Vercel's
// logs. The point is devices we can't attach a debugger to (an iOS 10 iPad).
//
// Each report carries the error, where it happened, the app version, the
// browser and the page path (no query or fragment, so no setup link). The
// server scrubs key-shaped strings again on arrival.

import { STORAGE_KEYS, readStored } from './storageKeys';

const MAX_REPORTS = 5; // per page load: a render loop shouldn't send hundreds
const sent = new Set();
let count = 0;

// 'auto' / 'large' / … when the dashboard layout is on, '' for the phone layout.
function dashboardSize() {
  if (readStored(STORAGE_KEYS.DASHBOARD) !== '1') return '';
  return readStored(STORAGE_KEYS.DASHBOARD_SIZE, 'auto');
}

export function buildReport(error, { where = '', componentStack = '' } = {}) {
  const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'));
  return {
    message: `${err.name}: ${err.message}`,
    stack: err.stack ?? '',
    componentStack,
    where,
    version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '',
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    size: dashboardSize(),
  };
}

export function reportError(error, context) {
  try {
    const report = buildReport(error, context);
    const fingerprint = `${report.where}|${report.message}`;
    if (sent.has(fingerprint) || count >= MAX_REPORTS) return;
    sent.add(fingerprint);
    count += 1;
    if (typeof fetch !== 'function') return;
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(() => { /* offline: nothing to do */ });
  } catch { /* reporting must never cause an error of its own */ }
}

// iOS 10.3's Safari runs <script type="module"> but not `nomodule`, so it
// tries to parse the modern bundle too, fails on syntax it doesn't know
// (object spread), and then runs the legacy bundle as intended. The parse
// error is expected there and says nothing about the app working.
export function isModernBundleParseError(message, filename) {
  return /SyntaxError/.test(String(message ?? ''))
    && /\/assets\/[^/]+\.js/.test(String(filename ?? ''))
    && !/-legacy/.test(String(filename));
}

// Errors no error boundary sees: event handlers, timers, promise rejections.
export function installGlobalErrorReporting() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // Cross-origin script errors arrive as a bare "Script error." with nothing to act on.
    if (!e || (!e.error && e.message === 'Script error.')) return;
    if (isModernBundleParseError(e.message, e.filename)) return;
    const err = e.error ?? new Error(String(e.message ?? 'Unknown error'));
    // Errors without a stack (parse errors) still say which file and line.
    if (!e.error?.stack && e.filename) err.stack = `${e.filename}:${e.lineno ?? 0}:${e.colno ?? 0}`;
    reportError(err, { where: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    if (reason?.name === 'AbortError') return; // cancelled fetches are expected
    reportError(reason, { where: 'unhandledrejection' });
  });
}
