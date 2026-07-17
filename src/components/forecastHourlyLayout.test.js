import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// The hourly strip's overnight cards overlap the evening cards on iOS Safari —
// and only there. Chrome, Android, and DevTools device emulation all run Blink,
// which lays this out correctly, so no amount of resizing a desktop browser
// reproduces it and no test here can render it.
//
// Round 1 was `inline-flex` (a shrink-to-fit container) — fixed in 0d6ec59
// (1.1.1), then silently reverted in 5c4cf2d (1.2.0) when the strip was
// rewritten for NWS.
//
// Round 2 was `width`/`min-width: max-content` on the track/group — sized both
// levels from content, which is exactly what's unreliable here. The track
// holds ~1500px of cards inside a ~390px `overflow-x: auto` viewport, so the
// boundary between today's remaining hours and tomorrow's sits off-screen at
// first paint almost all the time. iOS Safari has a long-documented history of
// misjudging intrinsic (max-content) sizing for flex children that are
// off-screen inside a scrollable container, and not correcting it once
// they're scrolled into view. So this isn't tied to elapsed time or time of
// day — it reproduces the moment you scroll forward to the day boundary,
// whether that's at 2pm or 2am. "Overnight" describes which cards end up
// corrupted (the ones past the boundary), not when scrolling to them breaks.
//
// The actual fix: stop asking WebKit to derive width from content at all.
// The track and every group get an explicit pixel width computed in JS
// (HOUR_CARD_W / HOUR_CARD_GAP / groupWidthPx), baked in at mount regardless
// of scroll position, so there's no intrinsic-sizing pass left to go stale or
// get deferred for off-screen content. These assertions exist to make that
// contract explicit so the next rewrite fails loudly instead of shipping the
// same bug back to an iPhone.
//
// See the .fc-hourly-track comment in src/index.css for the full mechanism.

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '../index.css'), 'utf8');
const JSX = readFileSync(resolve(HERE, 'ForecastTab.jsx'), 'utf8');

function ruleBody(css, selector) {
  const m = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
}

describe('hourly strip layout contract (iOS Safari)', () => {
  it('the track and group CSS no longer size from content', () => {
    const track = ruleBody(CSS, '.fc-hourly-track');
    const group = ruleBody(CSS, '.fc-hourly-group');
    expect(track, '.fc-hourly-track missing from index.css').not.toBeNull();
    expect(group, '.fc-hourly-group missing from index.css').not.toBeNull();
    // inline-flex is the round-1 regression: a shrink-to-fit box constrained to
    // the visible width, which collapses the day groups.
    expect(track).not.toMatch(/display:\s*inline-flex/);
    // max-content is the round-2 regression: it fixes first paint but goes
    // stale on the incremental mutation that happens every hour overnight.
    expect(track).not.toMatch(/max-content/);
    expect(group).not.toMatch(/max-content/);
    expect(group).toMatch(/flex-shrink:\s*0/);
  });

  it('ForecastTab computes explicit pixel widths for the track and each group', () => {
    expect(JSX).toContain('className="fc-hourly-track"');
    expect(JSX).toContain('className="fc-hourly-group"');
    // Guards the guard: a rewrite that reintroduces an inline shrink-to-fit
    // container, or drops back to letting CSS derive width from content,
    // would otherwise pass the CSS checks above untouched.
    expect(JSX, 'inline-flex reintroduced in ForecastTab — see .fc-hourly-track in index.css')
      .not.toMatch(/display:\s*'inline-flex'/);
    expect(JSX, 'groupWidthPx helper removed — width must be computed explicitly, not left to CSS')
      .toContain('groupWidthPx');
    expect(JSX, 'group no longer receives an explicit computed width')
      .toMatch(/width:\s*groupWidthPx\(/);
  });

  it('the reasoning is recorded where the next person will edit', () => {
    // A bare width rule reads like something safe to tidy away. It was tidied
    // away once already. The comment is the actual regression guard.
    const marker = CSS.indexOf('.fc-hourly-track');
    expect(CSS.slice(Math.max(0, marker - 2200), marker)).toMatch(/iOS Safari/i);
  });
});
