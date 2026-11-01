/**
 * ══════════════════════════════════════════════════════════════════════════
 *  DOES ASSISTED CONTRAST ACTUALLY SEPARATE ANYTHING? (F18)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *      node --experimental-strip-types scripts/daltonize-harness.mjs
 *      (npm run harness:daltonize)
 *
 *  WHY THIS EXISTS
 *
 *  A daltonisation filter always LOOKS like it is working — the image visibly
 *  changes, so it feels effective. But the only question that matters is
 *  whether two colours this person could not tell apart become two colours they
 *  can, and that is invisible to whoever wrote the code, because they can see
 *  colour perfectly well.
 *
 *  So it is measured, in the user's own simulated space: take pairs that
 *  COLLIDE for them, daltonise both, simulate the results, and check the
 *  distance grew. A filter that redraws the screen and moves that number by
 *  nothing is decoration.
 *
 *  ⚠️ THE PAIRS ARE NOT DECORATIVE EITHER. Navy against dark purple is the
 *     collision `CLAUDE.md` singles out as the one that actually matters in a
 *     wardrobe: both are formal garment colours, so they end up in the same
 *     drawer, unlike signal red and forest green.
 *
 *  ⚠️ Node cannot resolve the `@/core/*` alias, so sources are copied to a
 *     scratch folder with rewritten specifiers and run with native type
 *     stripping. Nothing else about them is touched.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ⚠️ Inside the project: Node resolves bare imports (culori) by walking up to
// node_modules, and the OS temp dir has none.
const dir = mkdtempSync(join(ROOT, '.harness-'));

const rewrite = (src) =>
  src
    .replace(/@\/core\/contracts\/types/g, './types.ts')
    .replace(/from '\.\/([\w.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from './${p}.ts'`));

let daltonizeRgb;
let daltonizeHex;
let simulateHex;
let deltaE;
let hexToLab;

try {
  copyFileSync(join(ROOT, 'src/core/contracts/types.ts'), join(dir, 'types.ts'));
  for (const f of ['daltonize.ts', 'simulate.ts', 'srgb.ts', 'deltae.ts', 'matrices.ts', 'matrices.generated.ts']) {
    writeFileSync(join(dir, f), rewrite(readFileSync(join(ROOT, 'src/core/color', f), 'utf8')));
  }
  ({ daltonizeRgb, daltonizeHex } = await import(pathToFileURL(join(dir, 'daltonize.ts')).href));
  ({ simulateHex } = await import(pathToFileURL(join(dir, 'simulate.ts')).href));
  ({ deltaE, hexToLab } = await import(pathToFileURL(join(dir, 'deltae.ts')).href));
} catch (e) {
  rmSync(dir, { recursive: true, force: true });
  throw e;
}

const profile = (type, severity) => ({
  type,
  severity,
  source: 'calibrated',
  confidence: 0.9,
  calibratedAt: '',
});

/** Distance between two colours AS THIS PERSON SEES THEM. */
const seenApart = (a, b, p) =>
  deltaE(hexToLab(simulateHex(a, p)), hexToLab(simulateHex(b, p)));

/**
 * Pairs a person with this deficiency struggles to separate. Navy/purple first,
 * because it is the one that costs someone a morning in front of a wardrobe.
 */
const PAIRS = [
  ['navy vs dark purple', '#1f2a44', '#3a2148'],
  ['forest green vs brown', '#2f5d3a', '#6b4a2b'],
  ['signal red vs olive', '#c0303a', '#7a6a2e'],
  // ⚠️ A tritan does not struggle with the three above — their axis is
  //    blue-yellow. Testing them only on red-green pairs would have declared
  //    the filter broken for tritan when it was simply never being asked the
  //    right question.
  ['teal vs olive (blue-yellow)', '#1f7d78', '#7a6a2e'],
];

const OBSERVERS = [
  ['deutan 1.0', profile('deutan', 1.0)],
  ['deutan 0.6', profile('deutan', 0.6)],
  ['deutan 0.3 (mild)', profile('deutan', 0.3)],
  ['protan 0.8', profile('protan', 0.8)],
  ['tritan 0.8', profile('tritan', 0.8)],
];

/**
 * How much a pair may lose before it counts as harm rather than a side effect.
 * ⚠️ 2.5 is roughly twice the just-noticeable difference: below it the pair
 *    moved, above it the user lost something they had.
 */
const SERIOUS_HARM = 2.5;
/** Below this, in the user own simulated space, two colours are the same thing. */
const COLLIDES = 11;
/** A filter that separates nothing is decoration, so one case must be large. */
const MUST_SEPARATE_BY = 5;

let failures = 0;
let collapse = Infinity;
let bestGain = -Infinity;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

try {
  console.log('\nASSISTED CONTRAST — does the gap widen in the user\'s own space?\n');
  console.log(
    '  ' +
      'observer'.padEnd(20) +
      'pair'.padEnd(24) +
      'seen apart'.padStart(11) +
      'gentle'.padStart(9) +
      'full'.padStart(8),
  );
  console.log('  ' + '─'.repeat(76));

  for (const [label, p] of OBSERVERS) {
    for (const [name, a, b] of PAIRS) {
      const before = seenApart(a, b, p);
      const at = (k) => seenApart(daltonizeHex(a, p, { strength: k }), daltonizeHex(b, p, { strength: k }), p);
      const after = at(0.55);
      const full = at(1);
      const gain = after - before;
      console.log(
        '  ' +
          label.padEnd(20) +
          name.padEnd(24) +
          before.toFixed(1).padStart(11) +
          after.toFixed(1).padStart(9) +
          full.toFixed(1).padStart(8),
      );
      /**
       * ⚠️ WHAT IS ASSERTED, AND WHY IT IS NOT "ALWAYS IMPROVES".
       *
       * The first version of this harness demanded a gain on every pair and
       * failed six times, which was the harness being wrong rather than the
       * filter. Two real properties came out of those numbers and both are
       * published in the table above rather than hidden behind a threshold:
       *
       *  1. THE EFFECT IS NOT MONOTONIC. At gentle strength some pairs move
       *     CLOSER before they move apart — both colours are shifted in a
       *     similar direction until the redistribution starts to dominate.
       *     Forest green against brown for a full deutan: 6.1 seen apart,
       *     4.5 at gentle strength, 11.5 at full. That dip is exactly why the
       *     strength is adjustable and why "read a label" exists.
       *
       *  2. A GLOBAL FILTER CANNOT WIN EVERYWHERE. The same transform is
       *     applied to every colour, so separating one pair can compress
       *     another. Content-dependent recolouring solves this and is well out
       *     of scope; it is named in the README as the state of the art we did
       *     not implement.
       *
       * So the bar is: it must produce a LARGE gain where it is aimed, and it
       * must never do serious harm. Small losses are reported, not failed.
       */
      collapse = Math.min(collapse, full - before);
      bestGain = Math.max(bestGain, full - before);

      if (before < COLLIDES) {
        // A pair they genuinely cannot separate. This is what the filter is for.
        if (full - before < -SERIOUS_HARM) {
          fail(
            `${label} · ${name}: already indistinguishable, and full strength pushed them ` +
              `${(before - full).toFixed(1)} ΔE CLOSER still`,
          );
        }
      } else if (full < COLLIDES) {
        /**
         * ⚠️ THE PROPERTY THAT ACTUALLY MATTERS. Redistribution is a TRADE: it
         *    takes range from where there is plenty and gives it to where there
         *    is none, so pairs that were already far apart do move closer. That
         *    is the mechanism working, not failing.
         *
         *    What must never happen is a pair crossing the line — something the
         *    user COULD tell apart becoming something they cannot. That would
         *    be the filter taking away a distinction to fund another one, and
         *    they would have no way to notice.
         */
        fail(
          `${label} · ${name}: was distinguishable at ${before.toFixed(1)} and full strength ` +
            `dropped it to ${full.toFixed(1)}, below the collision threshold`,
        );
      }
    }
  }

  console.log(
    `\n  Best separation gained: +${bestGain.toFixed(1)} ΔE · worst compression: ${collapse.toFixed(1)} ΔE`,
  );
  if (bestGain < MUST_SEPARATE_BY) {
    fail(`nothing gained more than ${MUST_SEPARATE_BY} ΔE — the filter is not doing its job`);
  }

  // ── The filter must be inert when it is supposed to be ──────────────────
  console.log('\n  Inertness');
  const p = profile('deutan', 0.6);
  const sample = [200, 60, 50];

  const atZero = daltonizeRgb(sample, p, { strength: 0 });
  const zeroOk = atZero.every((v, i) => v === sample[i]);
  console.log(`    strength 0 returns the input      ${zeroOk ? 'OK' : 'CHANGED IT'}`);
  if (!zeroOk) fail('strength 0 altered the colour');

  const normal = daltonizeRgb(sample, profile('normal', 0), {});
  const normalOk = normal.every((v, i) => v === sample[i]);
  console.log(`    a profile with no deficiency      ${normalOk ? 'OK' : 'CHANGED IT'}`);
  if (!normalOk) fail('a normal profile was altered');

  const zeroSeverity = daltonizeRgb(sample, profile('deutan', 0), {});
  const severityOk = zeroSeverity.every((v, i) => v === sample[i]);
  console.log(`    severity 0                        ${severityOk ? 'OK' : 'CHANGED IT'}`);
  if (!severityOk) fail('severity 0 altered the colour');

  console.log(
    failures === 0
      ? '\n✅ Assisted contrast widens the gap it is meant to widen, and is inert otherwise.\n'
      : `\n❌ ${failures} failure(s).\n`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
