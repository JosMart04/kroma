/**
 * ══════════════════════════════════════════════════════════════════════════
 *  SELF-CONSISTENCY HARNESS FOR THE COLOUR-VISION CALIBRATION (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *      node scripts/calibration-harness.mjs        (npm run harness:calibration)
 *
 *  WHY THIS EXISTS
 *
 *  A synthetic observer with a KNOWN profile "takes" the whole test, and we
 *  check the calibration recovers the profile it started from. If it cannot
 *  recover a profile it generated itself, it certainly cannot measure a person.
 *
 *  Clicking through the UI proves nothing here: whoever clicks is not colour
 *  blind, so any output looks plausible. This is the only way to know.
 *
 *  ⚠️ IT ALREADY CAUGHT A TOTAL BLOCKER. On 2026-08-15 every single observer
 *     came back `measurable: false` — the app would have shown the refusal
 *     screen to every user instead of a result. A staircase stops at
 *     MAX_TRIALS_PER_AXIS (26) but `converged` demanded TARGET_REVERSALS (6),
 *     and a clean observer only reaches 5 by then. Two rules tuned apart.
 *
 *  THE NEGATIVE CASES MATTER AS MUCH AS THE POSITIVE ONES. It is trivial to
 *  "fix" measurability by making everything measurable — that would destroy the
 *  refusal, which is the feature no competitor has. A random guesser must still
 *  be refused, and that is asserted below.
 *
 *  ⚠️ Node cannot resolve the `@/core/*` alias (it is a bundler convention), so
 *     the sources are copied to a scratch folder with rewritten specifiers and
 *     run with native type stripping. Nothing else about them is touched.
 */
import { mkdtempSync, rmSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ⚠️ The scratch folder must live INSIDE the project: Node resolves bare
// imports (culori) by walking up to node_modules, and the OS temp dir has none.
const dir = mkdtempSync(join(ROOT, '.harness-'));

const FILES = [
  ['src/core/contracts/types.ts', 'types.ts'],
  ['src/core/color/srgb.ts', 'srgb.ts'],
  ['src/core/color/deltae.ts', 'deltae.ts'],
  ['src/core/color/simulate.ts', 'simulate.ts'],
  ['src/core/color/daltonize.ts', 'daltonize.ts'],
  ['src/core/color/verdict.ts', 'verdict.ts'],
  ['src/core/color/families.ts', 'families.ts'],
  // ⚠️ Every file `color/index.ts` re-exports has to be here, or the harness
  //    dies on an import it never uses. F19 added `outfits.ts` and broke this
  //    without `npm run check` noticing — checks do not run harnesses.
  ['src/core/color/outfits.ts', 'outfits.ts'],
  ['src/core/color/naming.ts', 'naming.ts'],
  ['src/core/color/makeup.ts', 'makeup.ts'],
  ['src/core/color/matrices.ts', 'matrices.ts'],
  ['src/core/color/matrices.generated.ts', 'matrices.generated.ts'],
  ['src/core/color/index.ts', 'color.ts'],
  ['src/features/face/lib/caps.ts', 'caps.ts'],
  ['src/features/face/lib/observer.ts', 'observer.ts'],
  ['src/features/face/lib/threshold.ts', 'threshold.ts'],
  ['src/features/face/lib/arrangement.ts', 'arrangement.ts'],
  ['src/features/face/lib/calibration.ts', 'calibration.ts'],
];

try {
  for (const [from, to] of FILES) {
    copyFileSync(join(ROOT, from), join(dir, to));
    const p = join(dir, to);
    let src = readFileSync(p, 'utf8');
    // Relative first, aliases after — the other order double-appends ".ts".
    src = src.replace(/from '\.\/([a-zA-Z.]+)'/g, "from './$1.ts'");
    src = src
      .replace(/from '@\/core\/color\/matrices'/g, "from './matrices.ts'")
      .replace(/from '@\/core\/contracts\/types'/g, "from './types.ts'")
      .replace(/from '@\/core\/color'/g, "from './color.ts'");
    writeFileSync(p, src);
  }

  const load = (f) => import(pathToFileURL(join(dir, f)).href);
  const { predictedOrder, perceivedOffsetDeltaE, JND_DELTA_E } = await load('observer.ts');
  const { scoreArrangement } = await load('arrangement.ts');
  const { createStaircaseSet, buildTrial, advanceSet, setProgress, readSet } =
    await load('threshold.ts');
  const { buildProfile } = await load('calibration.ts');

  /** Deterministic RNG: a failing run is reproducible exactly. */
  const rng = (seed) => {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  function session(order, answer, seed) {
    const arrangement = scoreArrangement(order);
    let set = createStaircaseSet();
    const next = rng(seed);
    for (let i = 0; i < 4000; i++) {
      const p = setProgress(set);
      if (p.done >= p.total) break;
      const st = set.staircases[set.current];
      buildTrial(set, next); // the exact call the UI makes
      set = advanceSet(set, answer(st, next));
    }
    return buildProfile({ arrangement, thresholds: readSet(set) });
  }

  /** Answers correctly only when the shift is visible TO THIS observer. */
  const truthful = (truth) => (st) =>
    perceivedOffsetDeltaE(truth, st.axisDeg, st.offset) >= JND_DELTA_E;

  let failures = 0;

  console.log('REAL OBSERVERS — must be measurable and recover the type');
  console.log('-'.repeat(74));
  const CASES = [
    { type: 'normal', severity: 0 },
    { type: 'deutan', severity: 0.4 },
    { type: 'deutan', severity: 0.6 },
    { type: 'deutan', severity: 1.0 },
    { type: 'protan', severity: 0.6 },
    { type: 'protan', severity: 1.0 },
    { type: 'tritan', severity: 0.8 },
  ];
  for (const t of CASES) {
    const o = session(predictedOrder(t), truthful(t), 12345);
    const ok = o.profile.type === t.type && o.measurable;
    if (!ok) failures++;
    console.log(
      `  ${`${t.type} ${t.severity.toFixed(1)}`.padEnd(14)}` +
        `-> ${`${o.profile.type} ${o.profile.severity.toFixed(2)}`.padEnd(15)}` +
        `conf=${o.profile.confidence.toFixed(2)}  measurable=${String(o.measurable).padEnd(6)}` +
        (ok ? 'OK' : '✗ FAIL'),
    );
  }

  console.log('\nDEGENERATE OBSERVERS — the refusal MUST still fire');
  console.log('-'.repeat(74));
  const base = predictedOrder({ type: 'normal', severity: 0 });
  const shuffled = (seed) => {
    const r = rng(seed);
    const a = [...base];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const DEGENERATE = [
    ['random guesser (25%)', shuffled(7), (_s, r) => r() < 0.25],
    ['always wrong', shuffled(9), () => false],
  ];
  for (const [name, order, ans] of DEGENERATE) {
    const o = session(order, ans, 999);
    if (o.measurable) failures++;
    console.log(
      `  ${name.padEnd(24)}measurable=${String(o.measurable).padEnd(6)}` +
        (o.measurable ? '✗ FAIL — should refuse' : 'OK refuses'),
    );
  }

  console.log('-'.repeat(74));
  if (failures) {
    console.error(`\n❌ ${failures} failure(s). F1 does not measure what it claims to.`);
    process.exit(1);
  }
  console.log('\n✅ Calibration is self-consistent, and still refuses when it should.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
