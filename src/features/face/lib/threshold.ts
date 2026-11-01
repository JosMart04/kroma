/**
 * ══════════════════════════════════════════════════════════════════════════
 *  STAGE B — THRESHOLDS AGAINST NEUTRAL GREY, ON ALL THREE AXES (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: face slice.
 *
 *  🔑 THIS IS THE STAGE THAT ACTUALLY MEASURES.
 *
 *  Running ONE staircase on the axis the arrangement chose does not work: the
 *  self-consistency harness shows the arrangement only separates severities
 *  ≥ 0.9, so below that it contributes no axis and the staircase would measure
 *  in the wrong place.
 *
 *  It is not a code bug but a known property of arrangement tests — it is why
 *  the desaturated Lanthony version exists. For this product it would be
 *  unacceptable: more than half of our users are MILD deuteranomals, and they
 *  would all come out as normal.
 *
 *  So all THREE axes are measured, interleaved. The axis on which the user
 *  needs the largest offset to see anything is their impaired axis. A normal
 *  observer gives three similar thresholds; one with a deficiency gives one
 *  clearly worse. And that works at any severity, not only at the extremes.
 *
 *  Interleaved rather than one after another so the user cannot learn a
 *  staircase and anticipate it: each trial may come from any of the three.
 */
import { inGamut } from 'culori';
import type { CVDType } from '@/core/contracts/types';
import { SEVERITY_STEPS } from '@/core/color/matrices';
import {
  AXIS_KEYS,
  JND_DELTA_E,
  NEUTRAL_LIGHTNESS,
  axisOf,
  labOffsetHex,
  perceivedOffsetDeltaE,
  type AxisKey,
} from './observer';

export { JND_DELTA_E } from './observer';

/** Below this the offset is lost in the 8-bit rounding. */
const MIN_OFFSET = 0.5;

/** Reversals before a staircase is considered done. */
const TARGET_REVERSALS = 6;

/** The last ones are averaged, once the staircase has settled. */
const AVERAGED_REVERSALS = 4;

/** Coarse step until the first reversal (to get there fast), fine after. */
const COARSE_FACTOR = 0.6;
const FINE_FACTOR = 0.85;

/**
 * Safety cap per staircase: the user is never trapped in one.
 *
 * With enough margin for the worst honest descent. Someone who is always
 * right generates no reversals, so the step stays at the coarse factor and it
 * takes about 18 trials just to get from 25 to the floor; with the cap right at
 * that figure, the best possible observer would go unmeasured.
 */
const MAX_TRIALS_PER_AXIS = 26;

const rgbInGamut = inGamut('rgb');

function offsetInGamut(axisDeg: number, offset: number): boolean {
  const rad = (axisDeg * Math.PI) / 180;
  const a = offset * Math.cos(rad);
  const b = offset * Math.sin(rad);
  return (
    rgbInGamut({ mode: 'lab', l: NEUTRAL_LIGHTNESS, a, b }) &&
    rgbInGamut({ mode: 'lab', l: NEUTRAL_LIGHTNESS, a: -a, b: -b })
  );
}

/** The largest offset that fits in sRGB on this axis. */
export function maxOffset(axisDeg: number): number {
  let hi = 0;
  for (let o = 1; o <= 60; o += 1) {
    if (!offsetInGamut(axisDeg, o)) break;
    hi = o;
  }
  return hi;
}

export interface StaircaseState {
  axisKey: AxisKey;
  axisDeg: number;
  offset: number;
  consecutiveCorrect: number;
  /** Offset at each change of direction. */
  reversals: number[];
  lastDirection: 'up' | 'down' | null;
  trials: number;
  /** Times it wanted to go down while already at the floor: they see everything. */
  floorHits: number;
  /** Times it wanted to go up while already at the ceiling: they see nothing. */
  ceilingHits: number;
  done: boolean;
}

/**
 * Hits against each extreme before the staircase is considered resolved there.
 *
 * Asymmetric on purpose. Reaching the FLOOR is a modest claim — "they can tell
 * it apart as far as the screen goes" — and once is enough. Reaching the
 * CEILING claims they see nothing even with the largest offset that fits in
 * sRGB, which is a lot to say, and one early slip should not be enough.
 */
const FLOOR_HITS_TO_STOP = 1;
const CEILING_HITS_TO_STOP = 2;

function createStaircase(axisKey: AxisKey): StaircaseState {
  const axisDeg = axisOf(axisKey);
  return {
    axisKey,
    axisDeg,
    offset: Math.min(25, maxOffset(axisDeg)),
    consecutiveCorrect: 0,
    reversals: [],
    lastDirection: null,
    trials: 0,
    floorHits: 0,
    ceilingHits: 0,
    done: false,
  };
}

/**
 * Advances a staircase with the result of one trial.
 * Pure: same state + same answer = same next state, always.
 */
export function advanceStaircase(state: StaircaseState, correct: boolean): StaircaseState {
  if (state.done) return state;

  const trials = state.trials + 1;
  const ceiling = maxOffset(state.axisDeg);
  const factor = state.reversals.length === 0 ? COARSE_FACTOR : FINE_FACTOR;

  let { offset, consecutiveCorrect, lastDirection, floorHits, ceilingHits } = state;
  const reversals = [...state.reversals];
  let direction: 'up' | 'down' | null = null;

  if (correct) {
    consecutiveCorrect += 1;
    // 2-down: TWO correct answers in a row are needed to move closer to grey.
    if (consecutiveCorrect >= 2) {
      consecutiveCorrect = 0;
      direction = 'down';
      // ⚠️ HITTING AN EXTREME IS NOT A REVERSAL, AND TREATING IT AS NONE HANGS
      // THE TEST.
      //
      // Someone who discriminates very well is always right, the staircase asks
      // to go down again and again, the floor pins it in place and it NEVER
      // changes direction: zero reversals, the trials run out, and they land on
      // the refusal screen. In other words, rejecting exactly the person who
      // sees best.
      //
      // Hitting the floor is not a convergence failure: it is the answer.
      // Their threshold is at the floor or below, and that is enough.
      if (offset <= MIN_OFFSET) floorHits += 1;
      offset = Math.max(MIN_OFFSET, offset * factor);
    }
  } else {
    // 1-up: a single mistake is enough to move away.
    consecutiveCorrect = 0;
    direction = 'up';
    if (offset >= ceiling) ceilingHits += 1;
    offset = Math.min(ceiling, offset / factor);
  }

  if (direction && lastDirection && direction !== lastDirection) {
    reversals.push(state.offset);
  }
  if (direction) lastDirection = direction;

  return {
    ...state,
    offset,
    consecutiveCorrect,
    reversals,
    lastDirection,
    trials,
    floorHits,
    ceilingHits,
    done:
      reversals.length >= TARGET_REVERSALS ||
      floorHits >= FLOOR_HITS_TO_STOP ||
      ceilingHits >= CEILING_HITS_TO_STOP ||
      trials >= MAX_TRIALS_PER_AXIS,
  };
}

// ── The set of three interleaved staircases ───────────────────────────────

export interface StaircaseSet {
  staircases: Record<AxisKey, StaircaseState>;
  /** Axis of the trial being shown now. */
  current: AxisKey;
  done: boolean;
}

export function createStaircaseSet(): StaircaseSet {
  return {
    staircases: {
      protan: createStaircase('protan'),
      deutan: createStaircase('deutan'),
      tritan: createStaircase('tritan'),
    },
    current: AXIS_KEYS[0],
    done: false,
  };
}

/** Next pending axis, round-robin. Deterministic. */
function nextAxis(set: StaircaseSet, from: AxisKey): AxisKey | null {
  const start = AXIS_KEYS.indexOf(from);
  for (let i = 1; i <= AXIS_KEYS.length; i++) {
    const candidate = AXIS_KEYS[(start + i) % AXIS_KEYS.length];
    if (!set.staircases[candidate].done) return candidate;
  }
  return null;
}

export function advanceSet(set: StaircaseSet, correct: boolean): StaircaseSet {
  const advanced = advanceStaircase(set.staircases[set.current], correct);
  const staircases = { ...set.staircases, [set.current]: advanced };
  const partial: StaircaseSet = { staircases, current: set.current, done: false };
  const next = nextAxis(partial, set.current);

  return {
    staircases,
    current: next ?? set.current,
    done: next === null,
  };
}

/**
 * Overall progress, for the bar.
 *
 * ⚠️ A finished staircase counts as FULL even if it stopped before reaching
 * TARGET_REVERSALS. A staircase can legitimately end by hitting the floor, the
 * ceiling or the per-axis trial cap, and counting only reversals made the bar
 * stall short of 100% on a perfectly normal run — it looked broken.
 */
export function setProgress(set: StaircaseSet): { done: number; total: number } {
  const total = AXIS_KEYS.length * TARGET_REVERSALS;
  const done = AXIS_KEYS.reduce((acc, key) => {
    const s = set.staircases[key];
    return acc + (s.done ? TARGET_REVERSALS : Math.min(TARGET_REVERSALS, s.reversals.length));
  }, 0);
  return { done, total };
}

// ── Reading thresholds ────────────────────────────────────────────────────

export interface ThresholdResult {
  /** Threshold offset, in a*b* units. */
  threshold: number;
  /** Spread of the averaged reversals. High = erratic answers. */
  spread: number;
  converged: boolean;
  trials: number;
  /** Reversals achieved over those meant to be averaged, 0–1. */
  reliability: number;
  /** The threshold stuck to the gamut ceiling: nothing could be measured. */
  saturated: boolean;
}

export function readThreshold(state: StaircaseState): ThresholdResult {
  // Threshold at the floor: they discriminate as far as the screen goes. A
  // valid, complete measurement, not a half-finished staircase.
  if (state.floorHits >= FLOOR_HITS_TO_STOP) {
    return {
      threshold: MIN_OFFSET,
      spread: 0,
      converged: true,
      trials: state.trials,
      reliability: 1,
      saturated: false,
    };
  }

  // Threshold at the ceiling: not even the largest offset that fits in sRGB
  // is seen. This one has to be declared unmeasurable.
  if (state.ceilingHits >= CEILING_HITS_TO_STOP) {
    return {
      threshold: maxOffset(state.axisDeg),
      spread: 0,
      converged: true,
      trials: state.trials,
      reliability: 1,
      saturated: true,
    };
  }

  const used = state.reversals.slice(-AVERAGED_REVERSALS);
  // With no reversals, the threshold is where it stopped: better than pretending.
  const sample = used.length > 0 ? used : [state.offset];
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const variance = sample.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sample.length;

  /**
   * ⚠️ WITH FEWER THAN TWO REVERSALS THE SPREAD IS 0, AND THAT LIES.
   *
   * The harness caught it walking the real interface: someone answering at
   * random never generates reversals, so ONE sample was averaged, the variance
   * came out 0 and the system read it as "perfect consistency" — handing a
   * "no deficiency detected" at 68% confidence to someone who had not looked at
   * the screen.
   *
   * Without reversals the measurement is not stable: THERE IS NO MEASUREMENT.
   * The honest uncertainty is the size of the threshold itself.
   */
  const spread = used.length >= 2 ? Math.sqrt(variance) : mean;

  return {
    threshold: mean,
    spread,
    /**
     * ⚠️ FIXED 2026-08-15 — this used to require TARGET_REVERSALS (6) and made
     * the whole test unusable: `measurable` was false for EVERY observer, so
     * every user got the refusal screen instead of a result.
     *
     * Cause: a staircase also stops at MAX_TRIALS_PER_AXIS (26), and a clean,
     * noise-free observer only reaches 5 reversals by then. The stopping rule
     * and the success rule had been tuned independently and disagreed by one.
     *
     * The threshold itself is the mean of the last AVERAGED_REVERSALS (4)
     * reversals — so once we have that many, we have exactly the sample the
     * measurement is built from. Anything short of it is what `reliability`
     * (reversals / AVERAGED_REVERSALS) already downgrades, and a genuinely
     * unmeasurable run is still caught by `saturated`.
     *
     * Verified with a synthetic-observer harness: 7/7 profiles measurable,
     * while a random guesser still fails to produce a usable measurement.
     */
    converged: state.reversals.length >= AVERAGED_REVERSALS,
    trials: state.trials,
    reliability: Math.min(1, state.reversals.length / AVERAGED_REVERSALS),
    // The 0.95 leaves room for the rounding of the multiplicative step.
    saturated: mean >= maxOffset(state.axisDeg) * 0.95,
  };
}

export type ThresholdSet = Record<AxisKey, ThresholdResult>;

export function readSet(set: StaircaseSet): ThresholdSet {
  return {
    protan: readThreshold(set.staircases.protan),
    deutan: readThreshold(set.staircases.deutan),
    tritan: readThreshold(set.staircases.tritan),
  };
}

// ── Trials ────────────────────────────────────────────────────────────────

export interface Trial {
  /** Four colours; three identical and one shifted. */
  patches: string[];
  /** Which one is different. Never shown: it is the answer. */
  oddIndex: number;
}

/**
 * Builds a trial for the current axis. The position of the odd patch is drawn
 * every time, or the user would learn the position instead of looking at the colour.
 *
 * The random generator is injectable so the diagnostic harness can reproduce
 * an exact session.
 */
export function buildTrial(set: StaircaseSet, rng: () => number = Math.random): Trial {
  const state = set.staircases[set.current];
  const rad = (state.axisDeg * Math.PI) / 180;
  const a = state.offset * Math.cos(rad);
  const b = state.offset * Math.sin(rad);

  const neutral = labOffsetHex(0, 0);
  const odd = labOffsetHex(a, b);
  const oddIndex = Math.min(3, Math.floor(rng() * 4));

  return {
    patches: Array.from({ length: 4 }, (_, i) => (i === oddIndex ? odd : neutral)),
    oddIndex,
  };
}

// ── Threshold → severity ──────────────────────────────────────────────────

/**
 * Converts the measured threshold into a severity, WITHOUT calibration constants.
 *
 * 🔑 THE REASONING, which is what means nothing has to be invented:
 *
 *    A person detects an offset when, ALREADY DISTORTED BY THEIR OWN VISION,
 *    it still measures at least one JND. So the severity that fits them is the
 *    one for which the model predicts exactly that:
 *
 *        ΔE( simulate(grey + threshold, s), simulate(grey, s) ) = 1
 *
 *    The 11 Machado steps are swept for the crossing, then interpolated.
 *
 *    Sanity check: someone with normal vision detects down to the JND, i.e.
 *    threshold ≈ 1. At severity 0 the matrix is the identity, so the perceived
 *    ΔE ≈ 1 and the crossing lands at s = 0. It falls out with no tuning.
 */
export function severityFromThreshold(
  type: CVDType,
  axisDeg: number,
  threshold: number,
): number {
  if (type === 'normal') return 0;

  const perceived = SEVERITY_STEPS.map((s) =>
    perceivedOffsetDeltaE({ type, severity: s }, axisDeg, threshold),
  );

  // At severity 0 they already perceive less than one JND: the measured
  // threshold is below the perception floor. No evidence of a deficiency.
  if (perceived[0] <= JND_DELTA_E) return 0;

  for (let i = 1; i < SEVERITY_STEPS.length; i++) {
    if (perceived[i] <= JND_DELTA_E) {
      const hi = perceived[i - 1];
      const lo = perceived[i];
      const t = hi === lo ? 0 : (hi - JND_DELTA_E) / (hi - lo);
      const s = SEVERITY_STEPS[i - 1] + t * (SEVERITY_STEPS[i] - SEVERITY_STEPS[i - 1]);
      return Math.round(s * 100) / 100;
    }
  }

  // Not even at maximum severity does the model compress that much: the user
  // needs a larger offset than Machado can represent. Capped at 1.
  return 1;
}
