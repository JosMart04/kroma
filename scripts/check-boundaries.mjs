/**
 * Architectural guard: `src/core` must not import from `src/features`.
 *
 * This used to enforce four-person ownership zones. That is gone — one
 * developer now — but the layering rule survives on its own merits: the core
 * (colour engine, YouCam client, storage, shared UI) must never depend on the
 * features that consume it, or it stops being reusable and starts being a
 * tangle. It is cheap to check and it catches a real mistake.
 *
 *     node scripts/check-boundaries.mjs
 *
 * ⚠️ No shell commands and no dependencies: this has to behave the same on
 *    Windows, macOS and the CI runner.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Walks src/ and returns POSIX-separated paths. */
function collect(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) collect(path, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const files = collect('src').sort();
const IMPORT_RE = /^\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/gm;
const BARE_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]/gm;
const errors = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // Strip comments so a code sample inside a doc block is not a false positive.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const isClient = /^\s*['"]use client['"]/.test(code);
  // Everything under app/api is server; page/layout/template are too unless
  // they opt into the client.
  const isServer =
    file.startsWith('src/app/api/') ||
    (/^src\/app\/.*\/(page|layout|template)\.tsx$/.test(file) && !isClient) ||
    (/^src\/app\/(page|layout|template)\.tsx$/.test(file) && !isClient);

  const specs = [
    ...[...code.matchAll(IMPORT_RE)].map((m) => m[1]),
    ...[...code.matchAll(BARE_IMPORT_RE)].map((m) => m[1]),
  ];

  for (const spec of specs) {
    if (file.startsWith('src/core/') && spec.startsWith('@/features/')) {
      errors.push(`${file}: core must not import from a feature -> ${spec}`);
    }
    // IndexedDB only exists in the browser: importing storage from the server
    // blows up at runtime, not at compile time. Hence this check.
    if (isServer && /^@\/core\/db(\/|$)/.test(spec)) {
      errors.push(
        `${file}: server code importing ${spec}. Local storage is client-only: ` +
          `add 'use client' or move it into a client component`,
      );
    }

    /**
     * ⚠️ F18 · THE MEASUREMENT LAYER MUST NEVER TOUCH THE PRESENTATION FILTER.
     *
     * Assisted contrast deliberately moves colours AWAY from the truth so they
     * can be told apart. The lighting pass moves them TOWARDS it so they can be
     * measured. Opposite intentions, and a route that imported the filter could
     * measure our own distortion and report it as the colour of someone's
     * shirt — to the one person who could not detect it.
     *
     * The rule is machine-checked rather than written in a comment, because a
     * comment does not survive somebody in a hurry at three in the morning.
     */
    if (file.startsWith('src/app/api/') && /daltonize/.test(spec)) {
      errors.push(
        `${file}: an API route importing ${spec}. Assisted contrast is a display ` +
          `filter — measuring it would report our own distortion as a real colour`,
      );
    }
  }
}

if (errors.length) {
  console.error('❌ Boundary violations:\n' + errors.map((e) => '  · ' + e).join('\n'));
  process.exit(1);
}
console.log(`✅ Boundaries respected (${files.length} files checked)`);
