/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F1 · CALIBRATION — orchestration and final profile
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: face slice.
 *
 *  Combines the two stages and produces the `CVDProfile` the rest of the
 *  product depends on.
 *
 *  🔑 WHO DECIDES, AND WHY IT IS NOT OBVIOUS.
 *
 *     Stage B (thresholds on all three axes) is the PRIMARY instrument: it
 *     measures at any severity. Stage A (arrangement) only separates
 *     severities ≥ 0.9 — the self-consistency harness shows it, and it is a
 *     known property of arrangement tests, not a fault of ours.
 *
 *     So A does not decide: it CORROBORATES. When the two agree, confidence
 *     rises. When A sees nothing and B does, that is not a contradiction — it
 *     is A's expected blind spot, and confidence must not drop because of it.
 *     But when A sees a marked deficiency and B does not find it, that is a
 *     real contradiction and it has to be said.
 *
 *  ⚠️ Confidence is NOT decorative. The contract says that below 0.5 the test
 *     should be retaken, and that is the user's only defence: they cannot look
 *     at the result and notice it is wrong.
 */
import type { CVDProfile, CVDType } from '@/core/contracts/types';
import {
  AXIS_KEYS,
  allHypotheses,
  axisOf,
  predictedThreshold,
  type AxisKey,
  type Hypothesis,
} from './observer';
import type { ArrangementResult } from './arrangement';
import { severityFromThreshold, type ThresholdSet } from './threshold';

/** Severity below which stage A is blind, according to the harness itself. */
const ARRANGEMENT_BLIND_BELOW = 0.9;

/** If a staircase did not converge, the measurement is worth less. */
const NON_CONVERGENCE_PENALTY = 0.75;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface AxisClassification {
  type: CVDType;
  severity: number;
  worstAxis: AxisKey;
  /** Threshold of the worst axis divided by the mean of the other two. Informative. */
  ratio: number;
  /** Noise reference for that ratio. Informative. */
  boundary: number;
  /** How far the best deficiency candidate beats normal vision. */
  evidence: number;
  /** Relative spread of the user's answers. The bar to clear. */
  noise: number;
}

/** Divides a threshold triple by its mean: compares the SHAPE, not the scale. */
function normalizeTriple(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return mean > 0 ? values.map((v) => v / mean) : values.map(() => 1);
}

/**
 * Classifies from the three thresholds.
 *
 * 🔑 THE WHOLE PATTERN IS COMPARED, NOT JUST WHICH ONE IS WORST.
 *
 *    Taking the axis with the highest threshold looks natural, and the harness
 *    shows it does not work: protan and deutan confuse along almost the same
 *    directions in Lab, so the maximum flips from one to the other with almost
 *    no noise and protans come out classified as deutans.
 *
 *    What does separate them is the SHAPE of all three thresholds together: how
 *    much red-green rises RELATIVE to blue-yellow differs between protan and
 *    deutan, even when their worst axis is nearly the same. So the model
 *    predicts the threshold triple of each hypothesis and the one that best
 *    matches the measured triple is chosen — the same model comparison as in
 *    stage A, applied here.
 *
 * 🔑 AND THE DECISION BOUNDARY COMES FROM THE USER'S OWN DATA, not from a
 *    table: the best deficiency candidate has to beat normal vision by more
 *    than the user's own answers vary. Someone answering erratically needs
 *    more evidence; someone answering consistently, less.
 */
export function classifyFromThresholds(thresholds: ThresholdSet): AxisClassification {
  const value = (k: AxisKey) => thresholds[k].threshold;
  const measured = normalizeTriple(AXIS_KEYS.map(value));

  const fit = (h: Hypothesis) => {
    const predicted = normalizeTriple(AXIS_KEYS.map((k) => predictedThreshold(h, axisOf(k))));
    return measured.reduce((acc, m, i) => acc + Math.abs(m - predicted[i]), 0);
  };

  const ranked = allHypotheses()
    .map((hypothesis) => ({ hypothesis, distance: fit(hypothesis) }))
    // Ties → lower severity. The simplest hypothesis wins.
    .sort((a, b) => a.distance - b.distance || a.hypothesis.severity - b.hypothesis.severity);

  const normalFit = ranked.find((r) => r.hypothesis.type === 'normal')!;
  const bestDeficiency = ranked.find((r) => r.hypothesis.type !== 'normal')!;

  const relativeSpread = (k: AxisKey) =>
    value(k) > 0 ? thresholds[k].spread / value(k) : 1;
  const noise = Math.max(...AXIS_KEYS.map(relativeSpread));

  const worstAxis = AXIS_KEYS.reduce((a, b) => (value(b) > value(a) ? b : a));
  const others = AXIS_KEYS.filter((k) => k !== worstAxis);
  const baseline = others.reduce((acc, k) => acc + value(k), 0) / others.length;
  const ratio = baseline > 0 ? value(worstAxis) / baseline : 1;
  const boundary = 1 + noise;

  const evidence = normalFit.distance - bestDeficiency.distance;
  if (evidence <= noise) {
    return { type: 'normal', severity: 0, worstAxis, ratio, boundary, evidence, noise };
  }

  const type = bestDeficiency.hypothesis.type as AxisKey;
  return {
    type,
    severity: severityFromThreshold(type, axisOf(type), value(type)),
    worstAxis,
    ratio,
    boundary,
    evidence,
    noise,
  };
}

export interface CalibrationInput {
  arrangement: ArrangementResult;
  thresholds: ThresholdSet;
}

export interface CalibrationOutcome {
  profile: CVDProfile;
  /**
   * 🔑 FALSE = WE GIVE NO RESULT. Not an error: a product feature.
   *
   * If the staircases did not converge or hit the ceiling, nothing was
   * measured — whatever the classifier says. `CLAUDE.md` states it for optical
   * measurements and it holds here too: our user cannot detect that we handed
   * them an invented number, so we would rather not hand it over. The
   * interface shows a refusal, not a diagnosis.
   */
  measurable: boolean;
  detail: {
    typeFromArrangement: CVDType;
    severityFromArrangement: number;
    typeFromThresholds: CVDType;
    severityFromThresholds: number;
    ratio: number;
    boundary: number;
    agreement: number;
    evidence: number;
    consistency: number;
    errorIndex: number;
    /**
     * ⚠️ WHY the refusal fired, per axis, and it is not a diagnostic luxury.
     * "I could not measure it" was a dead end for the person taking the test
     * AND for whoever had to fix it: a tester with normal colour vision was
     * refused repeatedly and neither of us could say which axis gave up. A
     * refusal that cannot be acted on teaches nobody anything.
     */
    axes: Array<{ axis: AxisKey; converged: boolean; saturated: boolean; trials: number }>;
  };
}

/**
 * How much the two stages corroborate each other.
 *
 * Not a simple equality, because the two stages neither measure the same thing
 * nor have the same sensitivity. Each case is spelled out on purpose: hiding
 * this inside a formula would make it impossible to know why confidence fell.
 */
function agreementBetweenStages(
  typeA: CVDType,
  severityA: number,
  typeB: CVDType,
  severityB: number,
): number {
  // Both agree on the axis: confidence depends on how close the severities are.
  if (typeA === typeB && typeA !== 'normal') {
    return clamp01(1 - Math.abs(severityA - severityB));
  }

  // Both say "no deficiency". Clean corroboration.
  if (typeA === 'normal' && typeB === 'normal') return 1;

  // B finds something A does not see. If it falls in A's known blind spot, it
  // is not a contradiction: it is expected. If it is marked, A should have
  // seen it and something does not add up.
  if (typeA === 'normal' && typeB !== 'normal') {
    return severityB < ARRANGEMENT_BLIND_BELOW ? 0.9 : 0.3;
  }

  // A sees a marked deficiency (the only kind it sees) and B does not find it.
  // A real contradiction between the sensitive instrument and the arrangement.
  if (typeA !== 'normal' && typeB === 'normal') return 0.2;

  // Each names a different axis. The worst case.
  return 0.1;
}

export function buildProfile(input: CalibrationInput): CalibrationOutcome {
  const { arrangement, thresholds } = input;

  const classification = classifyFromThresholds(thresholds);
  const typeA = arrangement.best.type;
  const severityA = arrangement.best.severity;

  // Stage B decides unless it finds nothing and A does: then A's axis is kept,
  // since A only fires on marked deficiencies, but confidence sinks because
  // of the contradiction.
  const type = classification.type !== 'normal' ? classification.type : typeA;
  const severity =
    classification.type !== 'normal'
      ? classification.severity
      : typeA !== 'normal'
        ? severityA
        : 0;

  // 🔑 THE STRENGTH OF THE EVIDENCE COMES FROM STAGE B, NOT A.
  //
  // Using the arrangement's margin gives confidences of 0.42 even in cases the
  // system nails: since the arrangement is blind below severity 0.9, its margin
  // is almost always low and drags the total down. Almost everyone, including
  // people whose measurement was impeccable, would be asked to retake the test.
  //
  // What truly measures robustness is how many "noises" away from its own
  // boundary the decision landed. Signal-to-noise, in both directions.
  //
  // ⚠️ The absolute value is wrong, as the harness shows: it would leave the
  //    `normal` case at 0.45 and ask every person without colour blindness to
  //    retake the test. No deficiency beating normal vision is NOT a lack of
  //    evidence — it is evidence of normal vision, and good evidence. The
  //    distance from the boundary is what must be measured, not its raw size.
  const distanceFromBoundary =
    classification.type === 'normal'
      ? classification.noise - classification.evidence
      : classification.evidence - classification.noise;

  const evidence = clamp01(
    classification.noise > 0 ? distanceFromBoundary / classification.noise : 1,
  );

  const agreement = agreementBetweenStages(
    typeA,
    severityA,
    classification.type,
    classification.severity,
  );

  const consistency = clamp01(
    1 -
      Math.max(
        ...AXIS_KEYS.map((k) =>
          thresholds[k].threshold > 0 ? thresholds[k].spread / thresholds[k].threshold : 1,
        ),
      ),
  );

  const allConverged = AXIS_KEYS.every((k) => thresholds[k].converged);
  const anySaturated = AXIS_KEYS.some((k) => thresholds[k].saturated);
  const reliability = Math.min(...AXIS_KEYS.map((k) => thresholds[k].reliability));

  const raw = (evidence + agreement + consistency) / 3;
  const confidence = clamp01(
    raw * reliability * (allConverged ? 1 : NON_CONVERGENCE_PENALTY),
  );

  return {
    measurable: allConverged && !anySaturated,
    profile: {
      type,
      severity: Math.round(clamp01(severity) * 100) / 100,
      source: 'calibrated',
      confidence: Math.round(confidence * 100) / 100,
      calibratedAt: new Date().toISOString(),
    },
    detail: {
      typeFromArrangement: typeA,
      severityFromArrangement: severityA,
      typeFromThresholds: classification.type,
      severityFromThresholds: classification.severity,
      ratio: classification.ratio,
      boundary: classification.boundary,
      agreement,
      evidence,
      consistency,
      errorIndex: arrangement.errorIndex,
      axes: AXIS_KEYS.map((k) => ({
        axis: k,
        converged: thresholds[k].converged,
        saturated: thresholds[k].saturated,
        trials: thresholds[k].trials,
      })),
    },
  };
}

/**
 * Secondary path: the user already has a diagnosis and prefers to enter it.
 *
 * ⚠️ It is never the opening question. More than half of our users are
 *    undiagnosed mild deuteranomals: asking them what they have is asking for
 *    exactly the answer they came for.
 *
 * That the information came from the user, not from a measurement, is carried
 * by `source`, which is in the contract for exactly that.
 */
export function selfReportedProfile(type: CVDType, severity: number): CVDProfile {
  return {
    type,
    severity: type === 'normal' ? 0 : clamp01(severity),
    source: 'self_reported',
    /**
     * ⚠️ NOT 1. The contract defines confidence as how conclusive the TEST was,
     * and here no test was taken. Reporting 1 made a self-report outrank a real
     * measurement — which rarely reaches 1 — everywhere confidence is used to
     * degrade a verdict.
     *
     * 0.6 sits above the 0.5 mark that prompts "take it again" (there is
     * nothing to retake) and below a good measurement, so measured data always
     * wins. That the information came from the user is carried by `source`.
     */
    confidence: 0.6,
    calibratedAt: new Date().toISOString(),
  };
}

/** Human-readable label for an axis. The interface never shows the internal code. */
export function typeLabel(type: CVDType): string {
  switch (type) {
    case 'protan':
      return 'Protan — red axis';
    case 'deutan':
      return 'Deutan — green axis';
    case 'tritan':
      return 'Tritan — blue axis';
    default:
      return 'No deficiency detected';
  }
}

/**
 * What the result MEANS, in plain language.
 *
 * ⚠️ A LABEL IS NOT AN ANSWER. The screen used to report "Deutan — green axis"
 *    and a severity, which is precise and tells a first-time reader nothing.
 *    Most of the people this product is for have never been diagnosed — more
 *    than half the target population are mild deuteranomals who went decades
 *    without knowing — so for many of them this screen is the first time anyone
 *    has named it. It has to say what it is.
 *
 * ⚠️ DESCRIPTIVE, NEVER CLINICAL. Every sentence here is about which colours
 *    are hard to separate and what that means inside this app. It does not
 *    diagnose, prognose, or advise, and the screen carries the disclaimer.
 */
export function describeType(type: CVDType): {
  what: string;
  everyday: string;
  inApp: string;
} {
  switch (type) {
    case 'protan':
      return {
        what: 'Your red-sensitive cones respond differently from the typical case, so red and green sit closer together for you than for most people.',
        everyday:
          'Reds also tend to look darker and less vivid than others perceive them — a red that others call bright can read as almost brown.',
        inApp:
          'KROMA will warn you about red-green pairs, and about the blue/purple ones that catch almost everybody with this.',
      };
    case 'deutan':
      return {
        what: 'Your green-sensitive cones respond differently from the typical case, so green and red sit closer together for you than for most people.',
        everyday:
          'This is the most common variant by a wide margin, and it darkens nothing — which is exactly why so many people who have it are never diagnosed. Nothing looks wrong; some colours simply are not separable.',
        inApp:
          'KROMA will warn you about red-green pairs, and about navy against dark purple, which is the pair that actually matters in a wardrobe.',
      };
    case 'tritan':
      return {
        what: 'Your blue-sensitive cones respond differently from the typical case, so blue and yellow sit closer together for you than for most people.',
        everyday:
          'This is the rarest of the three. Blues and greens can be hard to separate, and yellows can read as pale or washed out.',
        inApp:
          'KROMA will warn you about blue-yellow and blue-green pairs. ⚠️ Our simulation is less accurate for this type than for the other two — see the limitations in the README.',
      };
    default:
      return {
        what: 'This test did not find a colour vision deficiency. You separated the hues it presented about as well as typical colour vision does.',
        everyday:
          'A screen test is not an eye examination, and a mild deficiency can pass one. If you have reason to think otherwise, an optometrist has instruments this does not.',
        inApp:
          'KROMA still works: it will measure your colours and tell you what goes with what — it simply will not have many collisions to warn you about.',
      };
  }
}

/** How marked a severity is, in words. Text, never colour alone. */
export function severityLabel(severity: number): string {
  if (severity <= 0) return 'none';
  if (severity < 0.35) return 'mild';
  if (severity < 0.7) return 'moderate';
  return 'marked';
}

export function describeHypothesis(h: Hypothesis): string {
  return h.type === 'normal' ? 'normal' : `${h.type} ${h.severity.toFixed(1)}`;
}
