/**
 * Outfit traffic light (F11) — the heart of the product.
 * ⛔ OWNER: core. Consumed by the wardrobe and the purchase analyser.
 */
import type { CVDProfile, PairVerdict, MeasurementConfidence } from '@/core/contracts/types';
import { COLLISION_THRESHOLD_DELTA_E, LUMINANCE_RESCUE_THRESHOLD } from '@/core/contracts/types';
import { deltaE, deltaEHue, rgbToLab } from './deltae';
import { hexToRgb, contrastRatio } from './srgb';
import { simulateRgb } from './simulate';

/**
 * Above this contrast, the pair is NOT flagged even if it collides in hue.
 *
 * ⚠️ WHY IT IS NEEDED: two NEUTRALS have no hue to collide. A white T-shirt and
 * charcoal trousers give a hue ΔE of 5.3 — simply because neither has chroma —
 * and slipped through as "risky". Nobody confuses white with charcoal: that is
 * a false alarm, and a product that over-warns stops being used.
 *
 * 4.5 is the WCAG AA minimum for normal text: the threshold below which the
 * accessibility standard itself considers two lightnesses no longer reliably
 * distinguishable. Using the number from an existing standard, rather than one
 * we invented, is deliberate.
 *
 * It lives here rather than in `contracts/types.ts` because it is internal to
 * this module.
 */
const LUMINANCE_OBVIOUS_THRESHOLD = 4.5;

export interface VerdictInput {
  aHex: string;
  bHex: string;
  aName: string;
  bName: string;
  profile: CVDProfile;
  /** If either measurement is doubtful, the verdict is downgraded. */
  aConfidence?: MeasurementConfidence;
  bConfidence?: MeasurementConfidence;
}

/**
 * Issues the verdict for one pair.
 *
 * 🔑 THE RULE THAT SETS US APART FROM ANY GENERIC "COLOUR-BLIND MODE":
 * a pair that collides in HUE but has enough LUMINANCE contrast is NOT a
 * clash — the user separates them by lightness. Flagging it produces false
 * alarms, and a product that over-warns stops being used.
 */
export function judgePair(input: VerdictInput): PairVerdict {
  const { aHex, bHex, aName, bName, profile } = input;

  const aRgb = hexToRgb(aHex);
  const bRgb = hexToRgb(bHex);

  const deltaENormal = deltaE(rgbToLab(aRgb), rgbToLab(bRgb));

  const aSimLab = rgbToLab(simulateRgb(aRgb, profile));
  const bSimLab = rgbToLab(simulateRgb(bRgb, profile));
  const deltaESimulated = deltaE(aSimLab, bSimLab);

  const luminanceContrast = contrastRatio(aRgb, bRgb);

  /**
   * ⚠️ COLLISION IS MEASURED ON HUE, NOT ON THE FULL ΔE.
   *
   * `deltaESimulated` includes the lightness difference, so using it here makes
   * the two conditions mutually exclusive and `savedByLuminance` NEVER holds
   * (0 of 8,147 colliding pairs in a sweep of all of sRGB). See the note on
   * `deltaEHue()`.
   *
   * `deltaESimulated` is still reported as-is in the verdict: it is the real
   * perceptual distance and the contract does not change.
   */
  const collidesInHue = deltaEHue(aSimLab, bSimLab) < COLLISION_THRESHOLD_DELTA_E;
  const savedByLuminance = collidesInHue && luminanceContrast >= LUMINANCE_RESCUE_THRESHOLD;

  /**
   * Collides in hue, but lightness separates them so much there is nothing to
   * warn about. `savedByLuminance` stays `true` — the pair IS saved by
   * luminance, which is what the contract says that field means — but the
   * verdict is `safe`, not `risky`: warning here would be a false alarm.
   */
  const obviouslySeparated = luminanceContrast >= LUMINANCE_OBVIOUS_THRESHOLD;

  let verdict: PairVerdict['verdict'];
  if (!collidesInHue || obviouslySeparated) verdict = 'safe';
  else if (savedByLuminance) verdict = 'risky';
  else verdict = 'clash';

  // A doubtful measurement can never produce an emphatic "safe".
  const doubtful =
    input.aConfidence?.level === 'low_light' || input.bConfidence?.level === 'low_light';
  if (doubtful && verdict === 'safe') verdict = 'risky';

  return {
    verdict,
    deltaENormal: round(deltaENormal),
    deltaESimulated: round(deltaESimulated),
    luminanceContrast: round(luminanceContrast),
    savedByLuminance,
    explanation: explain({
      verdict, aName, bName, deltaESimulated, luminanceContrast, savedByLuminance, doubtful,
      collidesInHue,
    }),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The reason, in the user's language.
 * ⚠️ Never show raw numbers in the interface without this translation.
 */
function explain(a: {
  verdict: PairVerdict['verdict'];
  aName: string; bName: string;
  deltaESimulated: number; luminanceContrast: number;
  savedByLuminance: boolean; doubtful: boolean;
  collidesInHue: boolean;
}): string {
  const pct = Math.round((1 - 1 / a.luminanceContrast) * 100);
  const caveat = a.doubtful
    ? ' Careful: one of these was measured in poor light, so treat it as a rough guide.'
    : '';

  /**
   * ⚠️ A PAIR DOWNGRADED BY POOR LIGHT WAS BEING DESCRIBED AS A COLLISION, AND
   *    THE SENTENCE WAS FLATLY FALSE.
   *
   *    A `safe` pair becomes `risky` when either measurement came from bad
   *    light. That verdict is right — we should not be emphatic about a colour
   *    we are unsure of. But the explanation branched on the DOWNGRADED verdict
   *    with no memory of why, fell past both `safe` clauses, and landed on the
   *    clash text: "white and muddy brown will look like practically the same
   *    colour to you, and there is no difference in lightness to separate them
   *    either." White. And brown.
   *
   *    Our user cannot look at the screen and catch that. It is exactly the
   *    failure this product exists to prevent, so the doubt has to be named as
   *    doubt about the MEASUREMENT, never invented as a collision.
   */
  if (!a.collidesInHue) {
    return (
      `${cap(a.aName)} and ${a.bName} are easy for you to tell apart` +
      (a.doubtful
        ? ', but one of them was measured in poor light, so the colour itself may not be exact.'
        : '.')
    );
  }

  if (a.verdict === 'safe') {
    // The "same hue, very different lightness" case is worth saying out loud:
    // it explains WHY it is safe, and it is exactly the product's argument.
    if (a.savedByLuminance) {
      return (
        `${cap(a.aName)} and ${a.bName} are the same hue to you, but the difference in ` +
        `lightness is so large there is no way to confuse them.${caveat}`
      );
    }
    return `${cap(a.aName)} and ${a.bName} are easy for you to tell apart.${caveat}`;
  }
  if (a.savedByLuminance) {
    return (
      `To you, ${a.aName} and ${a.bName} are almost the same hue — but there is ${pct}% ` +
      `difference in lightness, so you will separate them by light and dark, not by colour.${caveat}`
    );
  }
  return (
    `${cap(a.aName)} and ${a.bName} will look like practically the same colour to you, ` +
    `and there is no difference in lightness to separate them either.${caveat}`
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface PaletteVerdict {
  skin: PairVerdict;
  /** Null when the portrait has no hair colour: nothing is judged against a guess. */
  hair: PairVerdict | null;
  /** The worse of the two. A garment only has to disappear against one of them. */
  worst: PairVerdict;
}

/**
 * Verdict for a garment against the palette the user always wears.
 *
 * 🔑 SKIN **AND** HAIR, and the second one is the fix. The specification of F11
 *    says the fixed palette is an element of the outfit like any other — "a
 *    shirt does not only compete against the trousers, it competes against the
 *    face wearing it". The code only ever compared against skin, so someone
 *    with auburn hair got no warning about the rust-coloured jumper that makes
 *    their head and shoulders merge into one shape.
 *
 * ⚠️ EYES ARE MEASURED AND DELIBERATELY NOT JUDGED HERE. An iris is about one
 *    percent of what another person sees; a garment "colliding" with it is not
 *    a failure anyone experiences. Skin and hair are large continuous areas
 *    that a garment can genuinely merge into. Declaring this beats silently
 *    dropping a third of the palette the portrait went to the trouble of
 *    measuring.
 *
 * ⚠️ This answers "can you TELL THEM APART", not "does it suit you". Those are
 *    different questions and we only measure the first one. A beige may be
 *    perfectly distinguishable from your skin and still drain your face.
 */
export function judgeAgainstPalette(
  garmentHex: string,
  garmentName: string,
  portrait: { skinHex: string; hairHex: string | null; confidence?: MeasurementConfidence },
  profile: CVDProfile,
  garmentConfidence?: MeasurementConfidence,
): PaletteVerdict {
  const common = {
    aHex: garmentHex,
    aName: garmentName,
    profile,
    aConfidence: garmentConfidence,
    bConfidence: portrait.confidence,
  };
  const skin = judgePair({ ...common, bHex: portrait.skinHex, bName: 'your skin' });
  const hair = portrait.hairHex
    ? judgePair({ ...common, bHex: portrait.hairHex, bName: 'your hair' })
    : null;

  const rank: Record<PairVerdict['verdict'], number> = { safe: 0, risky: 1, clash: 2 };
  return { skin, hair, worst: hair && rank[hair.verdict] > rank[skin.verdict] ? hair : skin };
}
