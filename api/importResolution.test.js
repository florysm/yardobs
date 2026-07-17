import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// The api/ functions run on Vercel's Node ESM runtime, which requires explicit
// file extensions on relative imports. Vite resolves extensionless specifiers
// for the browser bundle, so `npm run build` passes and the UI works while the
// serverless function crashes on load — taking every insight endpoint with it.
//
// These files are shared between the two runtimes (api/insight.js imports
// src/utils/*), so the browser-side convention of omitting extensions is a live
// hazard the moment a shared module picks it up. Walk everything reachable from
// api/ and require an extension.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const ENTRY_POINTS = ['api/insight.js', 'api/weather.js'];

function collectRelativeImports(entry) {
  const seen = new Set();
  const offenders = [];

  function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { return; }

    for (const [, spec] of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), spec);
      if (/\.(js|jsx|json)$/.test(spec)) {
        walk(target);
      } else {
        offenders.push(`${file.replace(REPO + '/', '')} imports '${spec}'`);
        walk(`${target}.js`); // keep walking so one miss doesn't hide others
      }
    }
  }

  walk(resolve(REPO, entry));
  return { seen, offenders };
}

describe('api import resolution', () => {
  it.each(ENTRY_POINTS)('%s: every relative import in the closure has a file extension', (entry) => {
    const { offenders } = collectRelativeImports(entry);
    expect(offenders, `extensionless imports fail at runtime on Vercel:\n  ${offenders.join('\n  ')}`)
      .toEqual([]);
  });

  it('actually traverses the shared src/utils modules', () => {
    // Guards the guard: if the walk silently stopped at api/, the check above
    // would pass vacuously while the real hazard lives in src/utils.
    const { seen } = collectRelativeImports('api/insight.js');
    const files = [...seen].map(f => f.replace(REPO + '/', ''));
    expect(files).toContain('src/utils/insightVocab.js');
    expect(files).toContain('src/utils/format.js');
    expect(files).toContain('src/utils/units.js');
  });
});
