import { describe, it, expect } from 'vitest';
import { parseChangelog } from './parseChangelog';

const md = `# Changelog

Intro text.

## [1.10.1] - 2026-11-10

### Changed
- Livelier summaries
- Shorter tips

### Fixed
- Chart drew nothing

## 1.10.0
- Ungrouped item

## [Unreleased]
`;

describe('parseChangelog', () => {
  const releases = parseChangelog(md);

  it('reads versions and dates, with or without brackets', () => {
    expect(releases.map(r => [r.version, r.date])).toEqual([['1.10.1', '2026-11-10'], ['1.10.0', ''], ['Unreleased', '']]);
  });

  it('groups bullets under their section headings', () => {
    expect(releases[0].sections).toEqual([
      { heading: 'Changed', items: ['Livelier summaries', 'Shorter tips'] },
      { heading: 'Fixed', items: ['Chart drew nothing'] },
    ]);
  });

  it('keeps bullets with no heading in an unnamed section', () => {
    expect(releases[1].sections).toEqual([{ heading: '', items: ['Ungrouped item'] }]);
  });

  it('returns an empty release list for text without versions', () => {
    expect(parseChangelog('# Changelog\n\nNothing yet.')).toEqual([]);
    expect(releases[2].sections).toEqual([]);
  });

  it('parses the real CHANGELOG.md without dropping releases', async () => {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
    const parsed = parseChangelog(raw);
    expect(parsed.length).toBe((raw.match(/^## /gm) ?? []).length);
    expect(parsed.every(r => r.version)).toBe(true);
  });
});
