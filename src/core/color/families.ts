/**
 * Colour families (F8) and duplicate alerts (F9).
 * ⛔ OWNER: core. Consumed by the wardrobe slice.
 *
 * 💡 All of this is pure maths on colours ALREADY measured: zero API calls,
 *    zero cost. Measuring a garment is a one-off cost; comparing 25 garments
 *    with each other is 300 pairs of arithmetic. The wardrobe does not multiply
 *    the cost, it amortises it.
 */
import type {
  CVDProfile,
  ColorFamily,
  Garment,
  DuplicateAlert,
  DuplicateKind,
} from '@/core/contracts/types';
import { COLLISION_THRESHOLD_DELTA_E, DUPLICATE_THRESHOLD_DELTA_E } from '@/core/contracts/types';
import { deltaE, rgbToLab } from './deltae';
import { hexToRgb } from './srgb';
import { simulateRgb } from './simulate';

function simulatedLab(hex: string, profile: CVDProfile) {
  return rgbToLab(simulateRgb(hexToRgb(hex), profile));
}

/**
 * Groups the wardrobe into families that are mutually distinguishable FOR THIS USER.
 *
 * Agglomerative hierarchical clustering with single linkage, cut at the
 * collision threshold. Preferred over k-means because it is DETERMINISTIC: the
 * same input always gives the same output, with no k to choose and no
 * run-to-run variation. Reproducibility is worth more here than sophistication.
 */
export function computeFamilies(garments: Garment[], profile: CVDProfile): ColorFamily[] {
  if (garments.length === 0) return [];

  const labs = garments.map((g) => simulatedLab(g.colorHex, profile));
  // Every garment starts in its own group.
  let clusters: number[][] = garments.map((_, i) => [i]);

  const dist = (A: number[], B: number[]) => {
    let min = Infinity;
    for (const i of A) for (const j of B) min = Math.min(min, deltaE(labs[i], labs[j]));
    return min;
  };

  // Merge while two groups are below the collision threshold.
  for (;;) {
    let bi = -1, bj = -1, best = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = dist(clusters[i], clusters[j]);
        if (d < best) { best = d; bi = i; bj = j; }
      }
    }
    if (best >= COLLISION_THRESHOLD_DELTA_E || bi < 0) break;
    clusters[bi] = clusters[bi].concat(clusters[bj]);
    clusters = clusters.filter((_, k) => k !== bj);
  }

  return clusters.map((members, idx) => {
    let minInternal = Infinity;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++)
        minInternal = Math.min(minInternal, deltaE(labs[members[i]], labs[members[j]]));
    return {
      id: idx + 1,
      garmentIds: members.map((i) => garments[i].id),
      representativeHex: garments[members[0]].colorHex,
      minInternalDeltaE: members.length > 1 ? Math.round(minInternal * 10) / 10 : Infinity,
    };
  });
}

/**
 * F9 · "You may already own this, and have no way of knowing."
 *
 * Buying a second copy of something you cannot recognise as a second copy is a
 * real, ordinary loss, and no product has ever named it. It costs one
 * comparison against a wardrobe we have already measured.
 *
 * ⚠️ IT REPORTS BOTH DISTANCES, AND THAT IS THE WHOLE CARE HERE. The simulated
 *    distance says whether THIS PERSON can separate the two; the real distance
 *    says whether they ARE the same colour. Only the second one licenses the
 *    sentence "you already own this" — a green shirt that simulates onto a navy
 *    one is a garment they cannot distinguish, not a garment they own, and
 *    anyone with normal vision would contradict us if we said otherwise.
 *
 * ⚠️ FULL ΔE HERE, NOT `deltaEHue`. Elsewhere collision is measured with
 *    lightness equalised, because two colours of the same hue at different
 *    lightness are still separable. For duplicates that reasoning inverts: a
 *    pale blue and a navy are emphatically NOT the same garment, and lightness
 *    is exactly what says so. Different question, different metric.
 *
 * Only within the same category: a navy jumper and navy socks are not a
 * duplicate purchase, they are an outfit.
 */
export function detectDuplicates(
  candidate: Garment,
  wardrobe: Garment[],
  /**
   * ⚠️ NULLABLE, AND A USER CAUGHT WHY. Two shirts ΔE 0.71 apart — the same
   * orange twice — sat in a wardrobe with no warning, because this function
   * demanded a calibrated profile and the person had not calibrated yet.
   *
   * But "these are the same colour" is a fact about the garments, not about the
   * eyes looking at them: it comes from the real distance and needs no profile.
   * Only "you cannot separate these" does. Requiring the profile for both
   * withheld the answer we already had.
   */
  profile: CVDProfile | null,
): DuplicateAlert {
  const candSim = profile ? simulatedLab(candidate.colorHex, profile) : null;
  const candReal = rgbToLab(hexToRgb(candidate.colorHex));

  const collidesWith = wardrobe
    .filter((g) => g.id !== candidate.id && g.category === candidate.category)
    .map((g) => {
      const deltaESimulated =
        candSim && profile
          ? Math.round(deltaE(candSim, simulatedLab(g.colorHex, profile)) * 10) / 10
          : null;
      const deltaEReal = Math.round(deltaE(candReal, rgbToLab(hexToRgb(g.colorHex))) * 10) / 10;
      return {
        garmentId: g.id,
        colorName: g.colorName,
        kind: (deltaEReal < DUPLICATE_THRESHOLD_DELTA_E
          ? 'same_colour'
          : 'indistinguishable') as DuplicateKind,
        deltaEReal,
        deltaESimulated,
      };
    })
    // Either the colours really are the same, or this person cannot separate
    // them. Without a profile only the first question has an answer, and it is
    // still worth giving.
    .filter(
      (x) =>
        x.deltaEReal < DUPLICATE_THRESHOLD_DELTA_E ||
        (x.deltaESimulated !== null && x.deltaESimulated < DUPLICATE_THRESHOLD_DELTA_E),
    )
    .sort((a, b) => a.deltaEReal - b.deltaEReal);

  return { newGarmentId: candidate.id, collidesWith };
}
