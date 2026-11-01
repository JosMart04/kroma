/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F15 · WHAT COLOUR CANCELS WHAT WE MEASURED ON YOUR FACE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Choosing a colour corrector is a decision made entirely by eye: you look at
 *  your own face, judge the cast, and pick its opposite. Our user cannot do the
 *  first step, so they cannot do any of it — and the shop assistant's answer
 *  ("you look a bit red today") is one they have to take on trust.
 *
 *  Their face has now been measured. The opposite of a measured colour is
 *  arithmetic.
 *
 *  ── WHAT IS COMPUTED, AND WHY IT IS NOT A LOOKUP TABLE ──────────────────
 *
 *  The conventional advice is a table: mint green for light skin, olive green
 *  for medium, and something warmer for deep skin. That table is a *shadow* of
 *  one rule, and the rule is what we implement:
 *
 *      the corrector is your own colour with its red component mirrored,
 *      at your own lightness.
 *
 *  Mirroring a* is what cancels red — it is the definition of the complement on
 *  that axis. Holding L* is what stops the corrector lifting the skin into
 *  ashiness. Holding b* is what keeps it as warm as the face it goes on. Run
 *  that rule on a fair face and it produces mint; run it on a medium one and it
 *  produces olive. The table falls out. We never had to copy it.
 *
 *  ── WHAT IS DELIBERATELY NOT DECIDED HERE ───────────────────────────────
 *
 *  ⚠️ NO REDNESS CUTOFF. The specification called for per-phototype thresholds
 *     "calibrated empirically with real captures, never copied from an invented
 *     table". That calibration never happened, so there is no honest cutoff to
 *     apply, and inventing one would be precisely the failure this product
 *     exists to prevent — our user cannot check a threshold any more than they
 *     can check a colour. So we report the vendor's measured score as it is,
 *     on its own scale, and we do not tell anyone whether it counts as "a lot".
 *     What we answer is the question they genuinely cannot: WHICH colour.
 *
 *  ⚠️ REDNESS IS NOT THE ONLY REASON PEOPLE USE CORRECTORS. Conventional
 *     practice reaches for peach and orange on deeper skin, and that is aimed
 *     at blue-toned hyperpigmentation, which is a different concern that we do
 *     not measure. This function answers redness only, and says so.
 *
 *  ⚠️ NOT MEDICAL. Persistent facial redness has causes worth a doctor rather
 *     than a corrector. Nothing here is a diagnosis.
 */
import type { FitzpatrickType, Lab } from '@/core/contracts/types';
import { labToRgb, rgbToLab } from './deltae';
import { rgbToHex } from './srgb';

/**
 * The angle in Lab where a colour is exactly as yellow as it is red.
 *
 * ⚠️ 45° IS NOT A TASTE, IT IS WHERE b* EQUALS a*. Every "warm or cool?" chart
 *    draws this line somewhere and never says where; this one is the diagonal,
 *    which is the only boundary on that plane that needs no justification.
 */
const EQUAL_WARMTH_ANGLE = 45;

/** How far past the diagonal a face has to sit before the lean is worth naming. */
const LEAN_IS_CLEAR = 6;

export interface CorrectorRecommendation {
  /** The colour that cancels the red measured in this skin. */
  hex: string;
  /** Its measured coordinates, so the recommendation can be audited. */
  lab: Lab;
  /** Plain-language description of the family it lands in. */
  family: string;
  /** Why this colour and not the one in the magazine. */
  why: string;
}

export type UndertoneLean = 'warm' | 'cool' | 'balanced';

export interface FoundationRecommendation {
  /** Fitzpatrick, as measured by the engine. The standard depth scale. */
  phototype: FitzpatrickType;
  /** L* of the measured skin — the number behind the word. */
  lightness: number;
  undertone: UndertoneLean;
  /** Hue angle of the skin in Lab, and its distance from the diagonal. */
  hueAngle: number;
  why: string;
}

/** Name the green a mirrored skin tone lands on, from its own coordinates. */
function greenFamily(lab: Lab): string {
  const [l, , b] = lab;
  if (l >= 70 && b < 22) return 'mint green';
  if (l >= 70) return 'pale sage green';
  if (l >= 45) return b > 18 ? 'olive green' : 'sage green';
  return 'deep olive green';
}

/**
 * The corrector that cancels the red in a measured skin colour.
 *
 * ⚠️ IT MIRRORS a* IN FULL, and that is the honest number rather than a
 *    flattering one. This is the colour that, mixed evenly with the skin,
 *    neutralises the red axis exactly. How much of it to use is a matter of
 *    application, and the measured redness score is shown next to it so the
 *    decision is informed rather than guessed — we do not scale the colour by a
 *    coefficient we cannot defend.
 */
export function recommendCorrector(skinLab: Lab): CorrectorRecommendation {
  const [l, a, b] = skinLab;
  const mirrored: Lab = [l, -a, b];
  const hex = rgbToHex(labToRgb(mirrored));
  // Round-trip through 8-bit, so the coordinates we publish are the ones a
  // screen or a product can actually hold.
  const lab = rgbToLab(labToRgb(mirrored));

  return {
    hex,
    lab: [Math.round(lab[0] * 10) / 10, Math.round(lab[1] * 10) / 10, Math.round(lab[2] * 10) / 10],
    family: greenFamily(mirrored),
    why:
      'This is your own measured skin colour with its red component mirrored, at exactly ' +
      'your own lightness and warmth. Mirroring the red axis is what cancels redness; ' +
      'holding the lightness is what stops a corrector turning skin ashy, which is the ' +
      'real reason a mint green made for fair skin goes grey on deeper skin.',
  };
}

/** Depth and undertone for choosing a foundation, from the same measurement. */
export function describeFoundation(
  skinLab: Lab,
  phototype: FitzpatrickType,
): FoundationRecommendation {
  const [l, a, b] = skinLab;
  // atan2 gives the hue angle; skin sits in the first quadrant, red to yellow.
  const hueAngle = (Math.atan2(b, a) * 180) / Math.PI;
  const offDiagonal = hueAngle - EQUAL_WARMTH_ANGLE;

  const undertone: UndertoneLean =
    Math.abs(offDiagonal) < LEAN_IS_CLEAR ? 'balanced' : offDiagonal > 0 ? 'warm' : 'cool';

  const why =
    undertone === 'balanced'
      ? 'Your skin carries almost exactly as much yellow as red, so neither a warm nor a ' +
        'cool foundation will fight it. Neutral shades are the safe buy.'
      : undertone === 'warm'
        ? 'Your skin carries more yellow than red, so warm and golden shades sit on it ' +
          'without going pink.'
        : 'Your skin carries more red than yellow, so cool and rosy shades sit on it ' +
          'without going sallow.';

  return {
    phototype,
    lightness: Math.round(l * 10) / 10,
    undertone,
    hueAngle: Math.round(hueAngle),
    why,
  };
}
