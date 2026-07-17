import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// The hourly strip's overnight cards overlap the evening cards on iOS Safari —
// and only there. Chrome, Android, and DevTools device emulation all run Blink,
// which lays this out correctly, so no amount of resizing a desktop browser
// reproduces it and no test here can render it.
//
// This exact bug was fixed in 0d6ec59 (1.1.1) and silently reverted in 5c4cf2d
// (1.2.0) when the strip was rewritten for NWS — the rewrite dropped the layout
// properties without anything noticing. That is what these assertions are for:
// not to prove the layout is correct on a device, but to make the contract
// explicit so the next rewrite fails loudly instead of shipping to an iPhone.
//
// See the .fc-hourly-track comment in src/index.css for the mechanism.

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '../index.css'), 'utf8');
const JSX = readFileSync(resolve(HERE, 'ForecastTab.jsx'), 'utf8');

function ruleBody(css, selector) {
  const m = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

describe('hourly strip layout contract (iOS Safari)', () => {
  it('the track sizes to its content instead of shrink-to-fit', () => {
    const track = ruleBody(CSS, '.fc-hourly-track');
    expect(track, '.fc-hourly-track missing from index.css').not.toBeNull();
    expect(track).toMatch(/width:\s*max-content/);
    expect(track).toMatch(/display:\s*flex/);
    // inline-flex is the regression: a shrink-to-fit box constrained to the
    // visible width, which is what collapses the day groups.
    expect(track).not.toMatch(/display:\s*inline-flex/);
  });

  it('each day group keeps its full width so the next group cannot overlap it', () => {
    const group = ruleBody(CSS, '.fc-hourly-group');
    expect(group, '.fc-hourly-group missing from index.css').not.toBeNull();
    expect(group).toMatch(/min-width:\s*max-content/);
    expect(group).toMatch(/flex-shrink:\s*0/);
  });

  it('ForecastTab uses the classes rather than re-inlining the layout', () => {
    expect(JSX).toContain('className="fc-hourly-track"');
    expect(JSX).toContain('className="fc-hourly-group"');
    // Guards the guard: a rewrite that reintroduces an inline shrink-to-fit
    // container would otherwise pass the two CSS checks above untouched.
    expect(JSX, 'inline-flex reintroduced in ForecastTab — see .fc-hourly-track in index.css')
      .not.toMatch(/display:\s*'inline-flex'/);
  });

  it('the reasoning is recorded where the next person will edit', () => {
    // A bare `width: max-content` reads like something safe to tidy away. It was
    // tidied away once. The comment is the actual regression guard.
    const marker = CSS.indexOf('.fc-hourly-track');
    expect(CSS.slice(Math.max(0, marker - 1400), marker)).toMatch(/iOS Safari/i);
  });
});
