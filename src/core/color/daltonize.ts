/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F18 · ASSISTED CONTRAST — moving information, not inventing colour
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️⚠️ THIS IS A PRESENTATION FILTER ⚠️⚠️
 *
 *  Its output is NEVER measured, NEVER sent to the YouCam API, and NEVER used
 *  to name a colour. Measuring a daltonised image would mean measuring our own
 *  filter and handing a false colour to the one person who cannot detect it.
 *  `scripts/check-boundaries.mjs` enforces this: nothing under `src/app/api/`
 *  may import this file.
 *
 *  ── THE CORRECTION THAT MADE THIS NECESSARY ─────────────────────────────
 *
 *  Every dual panel used to show "others see" beside "you see" — the original
 *  next to a Machado simulation. That default was incoherent, and naming why
 *  is the whole idea of this feature:
 *
 *      For the colour-blind user, the ORIGINAL IS ALREADY THEIR VIEW.
 *      Their eyes do the simulation. Computing it and showing it back hands
 *      them what they were already looking at.
 *
 *  The simulation is not useless — it is for SOMEBODY ELSE. It is how a
 *  partner, a shop assistant or a judge understands the gap. It was simply
 *  occupying the slot that belongs to the one render that tells the user
 *  something new.
 *
 *  ── WHAT THIS DOES, AND ITS HARD LIMIT ──────────────────────────────────
 *
 *  Nothing can create information the eye cannot receive. Every daltonisation
 *  technique does the same thing underneath: move information out of a broken
 *  channel into one that still works.
 *
 *      protan / deutan   red-green broken   →  blue-yellow and lightness live
 *      tritan            blue-yellow broken →  red-green and lightness live
 *
 *  The method here is the canonical one: simulate the deficiency, subtract, and
 *  the difference IS the information being lost — quantified as an image. Then
 *  decide where to put it.
 *
 *      Fidaner, Lin & Ozgüven, "Analysis of Color Blindness"
 *      Stanford Psych 221 (2005) · http://www.daltonize.org
 *
 *  ⚠️ WE DO NOT CORRECT COLOUR BLINDNESS AND MUST NEVER SAY WE DO. This makes
 *     an image easier to tell apart on a screen. That is all it does.
 */
import type { CVDProfile } from '@/core/contracts/types';
import { linearize, delinearize, hexToRgb, rgbToHex, type RGB } from './srgb';
import { simulateRgb } from './simulate';

/**
 * Where the lost information gets re-aimed.
 *
 * ⚠️ THESE ARE DESIGN PARAMETERS, NOT PHYSICAL CONSTANTS — the exact opposite
 *    of `matrices.generated.ts`, which is sealed behind a SHA256 precisely
 *    because those values were MEASURED and may never be invented. The 0.7 here
 *    is a strength of redistribution, chosen and tunable. Do not "protect" it,
 *    and do not treat it as a citation.
 *
 * The broken channel's own row is zero: handing the error back to the channel
 * that cannot receive it would achieve nothing.
 */
const SHIFT = {
  // Red-green is broken; the error goes to green and blue, which is what makes
  // reds drift towards purple in every classic daltonised image.
  protan: [
    [0, 0, 0],
    [0.7, 1, 0],
    [0.7, 0, 1],
  ],
  deutan: [
    [0, 0, 0],
    [0.7, 1, 0],
    [0.7, 0, 1],
  ],
  // Blue is the broken channel here, so the error is shared out to red and green.
  tritan: [
    [1, 0, 0.7],
    [0, 1, 0.7],
    [0, 0, 0],
  ],
} as const;

export interface DaltonizeOptions {
  /**
   * 0 = untouched · 1 = maximum.
   *
   * ⚠️ THE DEFAULT IS DELIBERATELY GENTLE, AND THE EVIDENCE IS THE REASON.
   * Over 90% of people with CVD, and 95% of trichromats, preferred a
   * naturalness-preserving method over an aggressive one — and the measured
   * contrast gain of the gentle method was close to the aggressive one anyway.
   * People switch off a filter that makes images look wrong, however well it
   * separates. So: gentle by default, and let them push it up.
   */
  strength?: number;
}

const DEFAULT_STRENGTH = 0.55;

/**
 * Re-inject the information this person is losing, into channels they still
 * have. Returns the input untouched when there is nothing to do.
 */
export function daltonizeRgb(
  c: RGB,
  profile: CVDProfile,
  { strength = DEFAULT_STRENGTH }: DaltonizeOptions = {},
): RGB {
  if (profile.type === 'normal' || strength <= 0 || profile.severity <= 0) return c;

  const m = SHIFT[profile.type];
  const original = linearize(c);
  // ⚠️ Linearised on BOTH sides. `simulateRgb` returns sRGB, so subtracting it
  //    from a linear original would compare two different spaces — the exact
  //    gamma mistake that several published implementations make.
  const simulated = linearize(simulateRgb(c, profile));

  const error: RGB = [
    original[0] - simulated[0],
    original[1] - simulated[1],
    original[2] - simulated[2],
  ];

  const shifted: RGB = [
    m[0][0] * error[0] + m[0][1] * error[1] + m[0][2] * error[2],
    m[1][0] * error[0] + m[1][1] * error[1] + m[1][2] * error[2],
    m[2][0] * error[0] + m[2][1] * error[1] + m[2][2] * error[2],
  ];

  /**
   * Modulated by severity as well as by strength: a mild deuteranomal is losing
   * less information than a complete deuteranope, so pushing the same
   * correction at both would over-treat the milder one — which is the case
   * where an unnatural image is most likely to be rejected.
   */
  const k = strength * profile.severity;
  return delinearize([
    original[0] + shifted[0] * k,
    original[1] + shifted[1] * k,
    original[2] + shifted[2] * k,
  ]);
}

export function daltonizeHex(hex: string, profile: CVDProfile, opts?: DaltonizeOptions): string {
  return rgbToHex(daltonizeRgb(hexToRgb(hex), profile, opts));
}

/**
 * Daltonise a whole image, in place.
 *
 * ⚠️ DOWNSCALE TO ~1200 px ON THE LONG EDGE BEFORE CALLING. At 2000×2000 this
 *    is four million round trips through two matrices, on the main thread, and
 *    the interface visibly stutters. Same warning `simulateImageData` carries,
 *    for the same reason.
 */
export function daltonizeImageData(
  img: ImageData,
  profile: CVDProfile,
  opts: DaltonizeOptions = {},
): ImageData {
  const strength = opts.strength ?? DEFAULT_STRENGTH;
  if (profile.type === 'normal' || strength <= 0 || profile.severity <= 0) return img;

  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const out = daltonizeRgb([d[i], d[i + 1], d[i + 2]], profile, opts);
    d[i] = out[0];
    d[i + 1] = out[1];
    d[i + 2] = out[2];
    // Alpha (d[i + 3]) is left alone.
  }
  return img;
}
