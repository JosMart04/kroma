/**
 * ══════════════════════════════════════════════════════════════════════════
 *  STAGE A — SCORING THE ARRANGEMENT (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: face slice.
 *
 *  In comes the permutation the user produced. Out comes which synthetic
 *  observer explains it best. Pure model comparison: no hand-written clinical
 *  constant — see the header of `observer.ts` for why.
 */
import type { CVDType } from '@/core/contracts/types';
import { deltaE, hexToLab } from '@/core/color';
import { CAPS, CAP_COUNT } from './caps';
import {
  allHypotheses,
  NORMAL_HYPOTHESIS,
  predictedOrder,
  type Hypothesis,
} from './observer';

export interface RankedHypothesis {
  hypothesis: Hypothesis;
  /** Permutation distance to the predicted arrangement. Lower = better fit. */
  footrule: number;
}

export interface ArrangementResult {
  best: Hypothesis;
  runnerUp: Hypothesis | null;
  /** Gap between the best hypothesis and the best one of ANOTHER type, normalised 0–1. */
  margin: number;
  /** Accumulated ΔE of the user's path, in normal vision. */
  userCost: number;
  /** Accumulated ΔE of the ideal path. The theoretical floor. */
  normalCost: number;
  /** userCost / normalCost. 1 = perfect. High = they crossed the circle. */
  errorIndex: number;
  ranked: RankedHypothesis[];
}

/**
 * The other direction around the same path.
 *
 * The hue circle has no beginning and no end: going round it clockwise or
 * anticlockwise are both correct answers. Without this, half of all people
 * with normal vision would be diagnosed for turning the other way. The
 * reference stays fixed at the head; only the tail is reversed.
 */
function mirror(order: number[]): number[] {
  return [order[0], ...order.slice(1).reverse()];
}

/** Position of each sample within an arrangement. */
function positions(order: number[]): number[] {
  const pos = new Array<number>(CAP_COUNT);
  order.forEach((cap, i) => {
    pos[cap] = i;
  });
  return pos;
}

/** Spearman's footrule: sum of the displacement of each sample. */
function footrule(a: number[], b: number[]): number {
  const pa = positions(a);
  const pb = positions(b);
  let sum = 0;
  for (let i = 0; i < CAP_COUNT; i++) sum += Math.abs(pa[i] - pb[i]);
  return sum;
}

/** Footrule that does not care which way round the circle you went. */
function ringFootrule(user: number[], predicted: number[]): number {
  return Math.min(footrule(user, predicted), footrule(user, mirror(predicted)));
}

/** Accumulated ΔE of walking the samples in this order, in NORMAL VISION. */
function pathCost(order: number[]): number {
  const labs = CAPS.map((cap) => hexToLab(cap.hex));
  let sum = 0;
  for (let i = 0; i < order.length - 1; i++) {
    sum += deltaE(labs[order[i]], labs[order[i + 1]]);
  }
  return sum;
}

/**
 * How far a colour-blindness hypothesis has to beat normal vision before we
 * tell the user.
 *
 * 🔑 IT IS NOT A HAND-PICKED NUMBER. It is the midpoint between the arrangement
 *    normal vision predicts and that of the mildest deficiency the model GENUINELY
 *    SEPARATES. The midpoint-classifier rule: to be called colour-blind, your
 *    arrangement has to look more like a colour-blind observer's than a normal
 *    one's.
 *
 * ⚠️ THE `> 0` FILTER IS NOT COSMETIC.
 *    At the lowest severities Machado distorts so little that the predicted
 *    path is IDENTICAL to normal vision's, so its distance is 0. Taking the
 *    minimum without filtering gives a margin of 0, and then every tie resolves
 *    in favour of colour blindness: a perfect arrangement comes out diagnosed.
 *    What matters is the mildest DISTINGUISHABLE deficiency, which is not the
 *    same as the mildest representable one.
 *
 *    Telling someone "you may have a deficiency" when they do not is a real
 *    harm, and this is the only product decision in the file. That is why it
 *    is here, named, and not buried inside a comparison.
 */
function normalMargin(): number {
  const normalOrder = predictedOrder(NORMAL_HYPOTHESIS);
  const gaps = allHypotheses()
    .filter((h) => h.type !== 'normal')
    .map((h) => ringFootrule(normalOrder, predictedOrder(h)))
    .filter((gap) => gap > 0);
  return gaps.length > 0 ? Math.min(...gaps) / 2 : Infinity;
}

let _margin: number | null = null;
export function getNormalMargin(): number {
  _margin ??= normalMargin();
  return _margin;
}

/** Largest possible footrule, to normalise margins to 0–1. */
const MAX_FOOTRULE = Math.floor((CAP_COUNT * CAP_COUNT) / 2);

export function scoreArrangement(userOrder: number[]): ArrangementResult {
  if (userOrder.length !== CAP_COUNT || new Set(userOrder).size !== CAP_COUNT) {
    throw new Error(
      `[face/arrangement] Expected a permutation of ${CAP_COUNT} samples, ` +
        `got ${userOrder.length} (${new Set(userOrder).size} distinct).`,
    );
  }

  const ranked: RankedHypothesis[] = allHypotheses()
    .map((hypothesis) => ({
      hypothesis,
      footrule: ringFootrule(userOrder, predictedOrder(hypothesis)),
    }))
    // Ties → lower severity. The simplest hypothesis wins, which is what stops
    // noise being read as a diagnosis.
    .sort((a, b) => a.footrule - b.footrule || a.hypothesis.severity - b.hypothesis.severity);

  const normalFit = ranked.find((r) => r.hypothesis.type === 'normal')!;
  const bestDeficiency = ranked.find((r) => r.hypothesis.type !== 'normal')!;

  // Strictly greater: on a tie, normal vision wins. The asymmetry is
  // deliberate — telling a person with normal vision they may be colour-blind
  // costs more than falling short, because stage B can still correct it.
  const beatsNormal = normalFit.footrule - bestDeficiency.footrule > getNormalMargin();
  const winner = beatsNormal ? bestDeficiency : normalFit;

  // The relevant competitor is the best of ANOTHER type: knowing that deutan
  // 0.5 is ahead of deutan 0.6 says nothing about whether the diagnosis is firm.
  const runnerUp =
    ranked.find((r) => r.hypothesis.type !== winner.hypothesis.type) ?? null;

  const margin = runnerUp
    ? Math.min(1, Math.abs(runnerUp.footrule - winner.footrule) / (MAX_FOOTRULE / 4))
    : 1;

  const normalCost = pathCost(predictedOrder(NORMAL_HYPOTHESIS));
  const userCost = pathCost(userOrder);

  return {
    best: winner.hypothesis,
    runnerUp: runnerUp?.hypothesis ?? null,
    margin,
    userCost,
    normalCost,
    errorIndex: userCost / normalCost,
    ranked,
  };
}

/** Best fit per axis. For the diagnostic panel. */
export function bestPerType(ranked: RankedHypothesis[]): Record<CVDType, RankedHypothesis> {
  const out = {} as Record<CVDType, RankedHypothesis>;
  for (const r of ranked) {
    if (!out[r.hypothesis.type]) out[r.hypothesis.type] = r;
  }
  return out;
}
