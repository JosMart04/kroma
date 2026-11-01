/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TRANSCRIBER FOR THE MACHADO 2009 MATRICES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: core.
 *
 *  WHY THIS SCRIPT EXISTS AND THE NUMBERS WERE NOT COPIED BY HAND:
 *
 *  They are 297 floats. Copying them by hand — or worse, dictating them from a
 *  language model's memory — is exactly the mistake this project exists not to
 *  make: our user cannot detect a false simulation. Here the numbers are
 *  downloaded, transcribed mechanically, and the SHA256 of the source file is
 *  kept so anyone can audit the whole chain.
 *
 *  ── TWO MODES ───────────────────────────────────────────────────────────
 *
 *    node scripts/gen-matrices.mjs           generate (npm run gen:matrices)
 *    node scripts/gen-matrices.mjs --check   verify, WITHOUT NETWORK
 *
 *  ⚠️ IT DOES NOT RUN AT BUILD TIME. It ran once, its output is committed, and
 *     it lives here only so the table can be audited and regenerated. A
 *     deployment must not have a network dependency on its critical path.
 *
 *  `--check` closes the audit gap: the source SHA256 does NOT detect a hand
 *  edit of the generated file. So a checksum of the 297 emitted values is
 *  sealed as well, and `--check` recomputes it reading only the local file.
 *  No network, CI-safe.
 *
 *  ⚠️ MIND THE TRAP: five lines below the correct table, the same source file
 *     defines `coblis_v1_matrices`, the early-2000s web approximation that the
 *     DaltonLens literature itself advises against. Parsing is bounded BEFORE
 *     that symbol and aborts if the boundary is not found.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/DaltonLens/DaltonLens-Python/master/daltonlens/simulate.py';
const PRIMARY_SOURCE =
  'https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html';

// Anchored to the script itself, not the working directory: it works the same
// via `npm run` from the root as when run from anywhere else.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/core/color/matrices.generated.ts');

const EXPECTED_STEPS = 11;
const EXPECTED_FLOATS = 297; // 11 steps × 3 deficiencies × 9 values

/** The ONLY accepted number format. Anything else aborts: see checkTokens. */
const FLOAT_TOKEN = /^-?\d+\.\d+$/;

const DEFICIENCIES = [
  ['protan', 'Deficiency.PROTAN'],
  ['deutan', 'Deficiency.DEUTAN'],
  ['tritan', 'Deficiency.TRITAN'],
];

/** Abort loudly: better to generate nothing than something doubtful. */
function abort(msg) {
  console.error(`\n❌ ABORTED — nothing was written.\n   ${msg}\n`);
  process.exit(1);
}

/** Canonical checksum of the values. It is what allows offline verification. */
function dataChecksum(values) {
  return createHash('sha256').update(values.join(','), 'utf8').digest('hex');
}

/** Extracts the 297 literals from the generated file, in order. */
function valuesFromGenerated(ts) {
  const body = ts
    .slice(ts.indexOf('= {'), ts.indexOf('\n};'))
    .replace(/\/\/.*$/gm, ''); // drop the "// severity 0.4" comments
  return body.match(/-?\d+\.\d+/g) ?? [];
}

// ══════════════════════════════════════════════════════════════════════════
//  --check MODE · no network, reads only the local file
// ══════════════════════════════════════════════════════════════════════════
if (process.argv.includes('--check')) {
  let ts;
  try {
    ts = readFileSync(OUT, 'utf8');
  } catch {
    abort(`${OUT} does not exist. Generate it with: npm run gen:matrices`);
  }

  const declared = ts.match(/MACHADO_2009_DATA_SHA256 = '([a-f0-9]{64})'/)?.[1];
  if (!declared) {
    abort(
      'The generated file does not declare MACHADO_2009_DATA_SHA256. ' +
        'It is from an older version: regenerate it with npm run gen:matrices',
    );
  }

  const values = valuesFromGenerated(ts);
  if (values.length !== EXPECTED_FLOATS) {
    abort(`The generated file has ${values.length} values and should have ${EXPECTED_FLOATS}.`);
  }

  const actual = dataChecksum(values);
  if (actual !== declared) {
    abort(
      `The values in ${OUT} do NOT match their own checksum.\n` +
        `   declared: ${declared}\n` +
        `   actual:   ${actual}\n` +
        `   Someone edited the matrices by hand. Regenerate with: npm run gen:matrices`,
    );
  }

  console.log(`✅ Matrices intact · ${values.length} values · ${actual.slice(0, 16)}…`);
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════
//  GENERATE MODE
// ══════════════════════════════════════════════════════════════════════════

// ── 1. Download and seal ─────────────────────────────────────────────────
const res = await fetch(SOURCE_URL);
if (!res.ok) abort(`Could not download the source (HTTP ${res.status}).`);
const source = await res.text();
const sha256 = createHash('sha256').update(source, 'utf8').digest('hex');

console.log(`· source  ${SOURCE_URL}`);
console.log(`· bytes   ${Buffer.byteLength(source, 'utf8')}`);
console.log(`· sha256  ${sha256}`);

// ── 2. Bound the right block, excluding coblis ───────────────────────────
const start = source.indexOf('machado_2009_matrices');
if (start < 0) abort('`machado_2009_matrices` was not found in the source.');

const coblis = source.indexOf('coblis_v1_matrices');
if (coblis < 0) {
  abort(
    '`coblis_v1_matrices`, the lower boundary of the cut, was not found. ' +
      'The source file has changed shape: review it by hand before continuing.',
  );
}
if (coblis <= start) abort('`coblis_v1_matrices` appears before the Machado table.');

const block = source.slice(start, coblis);

// ── 3. Extract, deficiency by deficiency ─────────────────────────────────
/** Position of each deficiency inside the block, to cut out its section. */
const bounds = DEFICIENCIES.map(([key, marker]) => {
  const at = block.indexOf(marker);
  if (at < 0) abort(`Section \`${marker}\` was not found.`);
  return { key, at };
}).sort((a, b) => a.at - b.at);

const MATRIX_RE = /(\d+)\s*:\s*np\.array\(\s*\[([\s\S]*?)\]\s*\)/g;

/**
 * Tokenises the inside of a matrix and REQUIRES all 9 values to have exactly
 * the expected shape.
 *
 * ⚠️ A loose `.match(/-?\d+\.\d+/g)` has a real hole: a value in scientific
 *    notation (`1.234e-05`) would match as `1.234`, silently dropping the
 *    exponent. There would still be 9 values and 297 in total, so EVERY gate
 *    would pass and a false matrix would ship with an audit seal. It is the one
 *    path that produces wrong numbers that look verified.
 */
function checkTokens(inner, key, step) {
  const tokens = inner
    .replace(/[[\]]/g, ' ')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length !== 9) {
    abort(`${key}, step ${step}: expected 9 values and read ${tokens.length}.`);
  }
  for (const t of tokens) {
    if (!FLOAT_TOKEN.test(t)) {
      abort(
        `${key}, step ${step}: value "${t}" is not in the expected decimal format. ` +
          `The source changed notation (scientific?) and transcribing it this way would corrupt it.`,
      );
    }
  }
  return tokens;
}

const parsed = {};
let totalFloats = 0;

for (let i = 0; i < bounds.length; i++) {
  const { key, at } = bounds[i];
  const end = i + 1 < bounds.length ? bounds[i + 1].at : block.length;
  const section = block.slice(at, end);

  const steps = new Map();
  for (const m of section.matchAll(MATRIX_RE)) {
    const step = Number(m[1]);
    if (steps.has(step)) abort(`${key}: step ${step} appears twice.`);
    // The literals are kept EXACTLY as they come from the source: the
    // transcription is textual, not a rounding of ours.
    steps.set(step, checkTokens(m[2], key, step));
    totalFloats += 9;
  }

  if (steps.size !== EXPECTED_STEPS) {
    abort(`${key}: expected ${EXPECTED_STEPS} steps and read ${steps.size}.`);
  }
  for (let s = 0; s < EXPECTED_STEPS; s++) {
    if (!steps.has(s)) abort(`${key}: step ${s} is missing.`);
  }

  // Severity 0 must be the identity. If it is not, the parse is misaligned and
  // everything else would be rubbish that looks like data.
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const zero = steps.get(0).map(Number);
  for (let k = 0; k < 9; k++) {
    if (Math.abs(zero[k] - identity[k]) > 1e-9) {
      abort(`${key}: severity 0 is not the identity (position ${k} = ${zero[k]}).`);
    }
  }

  parsed[key] = Array.from({ length: EXPECTED_STEPS }, (_, s) => steps.get(s));
  console.log(`· ${key.padEnd(7)} ${steps.size} steps ✓  identity at 0 ✓  format ✓`);
}

if (totalFloats !== EXPECTED_FLOATS) {
  abort(`Expected ${EXPECTED_FLOATS} floats in total and read ${totalFloats}.`);
}
console.log(`· total   ${totalFloats} floats ✓`);

// Checksum of the values in the same order they are emitted.
const orderedValues = DEFICIENCIES.flatMap(([key]) => parsed[key].flat());
const dataSha = dataChecksum(orderedValues);
console.log(`· data    ${dataSha}`);

// ── 4. Emit TypeScript ───────────────────────────────────────────────────
const generatedAt = new Date().toISOString().slice(0, 10);

const body = DEFICIENCIES.map(([key]) => {
  const rows = parsed[key]
    .map((f, step) => {
      const sev = (step / 10).toFixed(1);
      return (
        `    // severity ${sev}\n` +
        `    [[${f[0]}, ${f[1]}, ${f[2]}], ` +
        `[${f[3]}, ${f[4]}, ${f[5]}], ` +
        `[${f[6]}, ${f[7]}, ${f[8]}]],`
      );
    })
    .join('\n');
  return `  ${key}: [\n${rows}\n  ],`;
}).join('\n\n');

const out = `/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ GENERATED FILE — DO NOT EDIT BY HAND ⚠️
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Machado 2009 matrices in LINEAR RGB, 11 severity steps (0.0–1.0).
 *  Regenerate with:  npm run gen:matrices
 *  Verify offline with:  npm run verify:matrices
 *
 *  ── Provenance ──────────────────────────────────────────────────────────
 *
 *  Transcribed mechanically by scripts/gen-matrices.mjs from:
 *    ${SOURCE_URL}
 *    source sha256: ${sha256}
 *    generated on: ${generatedAt}
 *
 *  Licence of the source file: MIT
 *    Copyright (c) 2021 Nicolas Burrus / DaltonLens
 *
 *  ── Primary source ──────────────────────────────────────────────────────
 *
 *  The numbers come from the original paper, not from DaltonLens:
 *    Machado, Oliveira & Fernandes (2009),
 *    "A Physiologically-based Model for Simulation of Color Vision Deficiency",
 *    IEEE TVCG 15(6). Table 1.
 *    ${PRIMARY_SOURCE}
 *
 *  ⚠️ NOTE: libDaltonLens (the C project, public domain) does NOT contain these
 *     matrices — only Brettel 1997 and Viénot 1999. Machado lives in the sister
 *     project DaltonLens-Python. If anyone sends you to libDaltonLens for
 *     Machado, it is not there.
 */

import type { Matrix3 } from './matrices';

export const MACHADO_2009_GENERATED: Record<'protan' | 'deutan' | 'tritan', Matrix3[]> = {
${body}
};

// Deep-frozen: every slice shares this table BY REFERENCE. An accidental
// sort(), push() or reverse() by any consumer would corrupt it for the whole
// process — and would also break isReady(), which checks the length. The cost
// is a single pass when the module loads.
for (const steps of Object.values(MACHADO_2009_GENERATED)) {
  for (const matrix of steps) {
    matrix.forEach(Object.freeze);
    Object.freeze(matrix);
  }
  Object.freeze(steps);
}
Object.freeze(MACHADO_2009_GENERATED);

/** SHA256 of the source file this table came from. For auditing. */
export const MACHADO_2009_SOURCE_SHA256 = '${sha256}';
export const MACHADO_2009_SOURCE_URL = '${SOURCE_URL}';

/**
 * SHA256 of the ${EXPECTED_FLOATS} values above, in order.
 * Unlike the source hash, this one can be verified WITHOUT NETWORK:
 *   npm run verify:matrices
 * It is what detects a hand edit of the matrices.
 */
export const MACHADO_2009_DATA_SHA256 = '${dataSha}';
`;

writeFileSync(OUT, out, 'utf8');
console.log(`\n✅ Wrote ${OUT}`);
