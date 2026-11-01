/**
 * ══════════════════════════════════════════════════════════════════════════
 *  SYNTHETIC OBSERVERS — where the confusion axis comes from (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: face slice.
 *
 *  Scoring a D-15 requires knowing in which direction each deficiency
 *  confuses colours. Those are published constants (Vingrys & King-Smith, 1988).
 *
 *  🚫 WE DO NOT WRITE THEM FROM MEMORY. It is exactly the mistake that is so
 *     easy to make with the matrices: cite the right source and put in
 *     plausible but invented numbers. Our user cannot audit the result, so a
 *     wrongly placed axis would give them a wrong diagnosis they would have no
 *     way of detecting.
 *
 *  💡 INSTEAD OF CITING THEM, WE DERIVE THEM. There is already a sealed
 *     perceptual model: Machado 2009 in `matrices.generated.ts`, with the
 *     source SHA256 and 11 severity steps. Simulate the samples under a
 *     hypothesis and order them by proximity IN THAT SPACE, and you get the
 *     arrangement an observer with that profile would produce. The confusion
 *     axis comes out of the model, not out of our memory.
 *
 *     A product advantage, not just an honesty one: the engine that CALIBRATES
 *     is the same one that later SIMULATES what the user sees. One source of truth.
 */
import { converter, formatHex } from 'culori';
import type { CVDProfile, CVDType, Lab } from '@/core/contracts/types';
import { simulateHex, hexToLab, deltaE } from '@/core/color';
import { SEVERITY_STEPS } from '@/core/color/matrices';
import { CAPS, CAP_LIGHTNESS } from './caps';

const fromLab = converter('rgb');

/** Stage B's neutral grey sits at the same lightness as the samples. */
export const NEUTRAL_LIGHTNESS = CAP_LIGHTNESS;

export interface Hypothesis {
  type: CVDType;
  severity: number;
}

export const NORMAL_HYPOTHESIS: Hypothesis = { type: 'normal', severity: 0 };

/** The three axes measured. `normal` is not an axis: it is the absence of all of them. */
export type AxisKey = Exclude<CVDType, 'normal'>;
export const AXIS_KEYS: readonly AxisKey[] = ['protan', 'deutan', 'tritan'];

/**
 * Just-noticeable difference, in CIEDE2000.
 *
 * ΔE2000 = 1 is the standard definition of the perception threshold — it is the
 * metric's stated purpose, not a value we chose. It is the only external
 * constant in the whole test, and it is a definition.
 */
export const JND_DELTA_E = 1.0;

export function labToHex(lab: Lab): string {
  return formatHex(fromLab({ mode: 'lab', l: lab[0], a: lab[1], b: lab[2] }));
}

/** Neutral grey shifted by (a*, b*) at the test's lightness, as hex. */
export function labOffsetHex(a: number, b: number): string {
  return labToHex([NEUTRAL_LIGHTNESS, a, b]);
}

/** `simulateHex` wants a whole profile; it only looks at `type` and `severity`. */
function asProfile(h: Hypothesis): CVDProfile {
  return {
    type: h.type,
    severity: h.severity,
    source: 'calibrated',
    confidence: 1,
    calibratedAt: '1970-01-01T00:00:00.000Z',
  };
}

/**
 * The hypotheses put in competition.
 *
 * 3 deficiencies × 11 steps, but at `severity: 0` the Machado matrix is the
 * identity (verified when the table is generated), so all three collapse into
 * the same observer. It is counted once, as `normal` → 31 in total.
 */
export function allHypotheses(): Hypothesis[] {
  const deficiencies: Exclude<CVDType, 'normal'>[] = ['protan', 'deutan', 'tritan'];
  const out: Hypothesis[] = [NORMAL_HYPOTHESIS];
  for (const type of deficiencies) {
    for (const severity of SEVERITY_STEPS) {
      if (severity > 0) out.push({ type, severity });
    }
  }
  return out;
}

/** The 16 samples as this observer sees them, in Lab. Memoised: asked for a lot. */
const simulatedCache = new Map<string, Lab[]>();

export function simulatedCaps(h: Hypothesis): Lab[] {
  const key = `${h.type}:${h.severity}`;
  let labs = simulatedCache.get(key);
  if (!labs) {
    const profile = asProfile(h);
    labs = CAPS.map((cap) => hexToLab(simulateHex(cap.hex, profile)));
    simulatedCache.set(key, labs);
  }
  return labs;
}

/**
 * The arrangement this observer would produce: a greedy nearest-neighbour
 * walk in THEIR perceptual space, starting from the reference.
 *
 * Greedy and not optimal on purpose. This is not the travelling salesman:
 * it imitates what a person does, looking at the last cap placed and choosing
 * the remaining one that looks most like it. The D-15's characteristic error —
 * crossing the circle along the blind axis — comes precisely from that myopia.
 *
 * Deterministic: ties are broken by the lower index.
 */
const orderCache = new Map<string, number[]>();

export function predictedOrder(h: Hypothesis): number[] {
  const key = `${h.type}:${h.severity}`;
  const hit = orderCache.get(key);
  if (hit) return hit;
  const computed = computeOrder(h);
  orderCache.set(key, computed);
  return computed;
}

function computeOrder(h: Hypothesis): number[] {
  const labs = simulatedCaps(h);
  const remaining = new Set(CAPS.map((c) => c.index).slice(1));
  const order = [0];
  let current = 0;

  while (remaining.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const candidate of remaining) {
      const d = deltaE(labs[current], labs[candidate]);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = candidate;
      }
    }
    remaining.delete(best);
    order.push(best);
    current = best;
  }
  return order;
}

/**
 * A hypothesis's confusion axis, in degrees on the a*b* plane.
 *
 * The direction in which the model COMPRESSES most is searched numerically:
 * two colours symmetric about grey are pulled apart along each direction,
 * simulated, and the surviving separation is measured. The direction where
 * least survives is that observer's blind axis.
 *
 * Stage B uses it to put the staircase on the axis that genuinely troubles
 * this user, instead of on a generic one.
 */
export function confusionAxisDeg(h: Hypothesis): number {
  if (h.type === 'normal' || h.severity <= 0) return 0;
  const profile = asProfile(h);
  const probe = 20;

  let bestDeg = 0;
  let bestSurviving = Infinity;
  for (let deg = 0; deg < 180; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const a = probe * Math.cos(rad);
    const b = probe * Math.sin(rad);
    const surviving = deltaE(
      hexToLab(simulateHex(labOffsetHex(a, b), profile)),
      hexToLab(simulateHex(labOffsetHex(-a, -b), profile)),
    );
    if (surviving < bestSurviving) {
      bestSurviving = surviving;
      bestDeg = deg;
    }
  }
  return bestDeg;
}

/**
 * Each deficiency's confusion axis, measured in its purest form (severity 1).
 * Machado interpolates towards the dichromat, so the axis DIRECTION is
 * practically the same at any severity; what changes is how much it
 * compresses. Taking it at 1.0 gives the cleanest estimate.
 */
const axisCache = new Map<AxisKey, number>();

export function axisOf(type: AxisKey): number {
  let deg = axisCache.get(type);
  if (deg === undefined) {
    deg = confusionAxisDeg({ type, severity: 1 });
    axisCache.set(type, deg);
  }
  return deg;
}

/**
 * The ΔE this observer would perceive between neutral grey and the same grey
 * shifted `offset` units along `axisDeg`.
 *
 * It is the function that turns a measured threshold into a severity: the
 * severity at which this value falls to the JND is searched for. See `threshold.ts`.
 */
export function perceivedOffsetDeltaE(h: Hypothesis, axisDeg: number, offset: number): number {
  const profile = asProfile(h);
  const rad = (axisDeg * Math.PI) / 180;
  const a = offset * Math.cos(rad);
  const b = offset * Math.sin(rad);
  return deltaE(
    hexToLab(simulateHex(labOffsetHex(a, b), profile)),
    hexToLab(simulateHex(labOffsetHex(0, 0), profile)),
  );
}

/**
 * The threshold an observer with this profile WOULD MEASURE on this axis: the
 * smallest offset that, once distorted by their vision, is still worth one JND.
 *
 * The inverse of `perceivedOffsetDeltaE`, by bisection. Used by the
 * self-consistency harness (to simulate whole sessions) and by the
 * classification (to know what difference between axes to expect at each
 * severity).
 */
const thresholdCache = new Map<string, number>();

export function predictedThreshold(h: Hypothesis, axisDeg: number): number {
  const key = `${h.type}:${h.severity}:${axisDeg}`;
  const hit = thresholdCache.get(key);
  if (hit !== undefined) return hit;
  const value = computeThreshold(h, axisDeg);
  thresholdCache.set(key, value);
  return value;
}

function computeThreshold(h: Hypothesis, axisDeg: number): number {
  let lo = 0;
  let hi = 60;
  if (perceivedOffsetDeltaE(h, axisDeg, hi) < JND_DELTA_E) return hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (perceivedOffsetDeltaE(h, axisDeg, mid) >= JND_DELTA_E) hi = mid;
    else lo = mid;
  }
  return hi;
}
