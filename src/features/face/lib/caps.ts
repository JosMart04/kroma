/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ARRANGEMENT TEST SAMPLES (F1) — Farnsworth D-15 style
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: face slice.
 *
 *  16 samples spread around the hue circle at CONSTANT LIGHTNESS AND CHROMA.
 *  That constancy is not an aesthetic preference: it is the only reason the
 *  test measures anything.
 *
 *  🔑 IF LIGHTNESS VARIES, THE TEST MEASURES NOTHING.
 *     Lightness is the channel that survives colour blindness — exactly what
 *     `srgb.ts` says about `contrastRatio`. If the samples differ in lightness,
 *     the user sorts them by lightness, gets a perfect score, and we have
 *     measured their achromatic vision instead of their confusion axis. For the
 *     same reason chroma is shared by all of them: if each sample had its own,
 *     saturation would be another rescue cue.
 *
 *  🚫 The original test's caps are not used: they are a commercial product with
 *     their own Munsell specification. The PROCEDURE (order by similarity
 *     starting from a reference) belongs to nobody; the samples are generated
 *     here in CIELAB. Same reason Ishihara plates are off-limits.
 *
 *  culori's `lch` mode is CIELAB D50 — the SAME space as `converter('lab')` in
 *  `@/core/color/deltae`. Mixing D50 and D65 would bias every distance silently.
 */
import { converter, formatHex, inGamut, type Lch } from 'culori';

/** 1 fixed reference + 15 movable samples, like the D-15. */
export const CAP_COUNT = 16;

/**
 * Lightness of every sample. Mid-range, to leave room for chroma above and
 * below without leaving the gamut at any hue.
 */
export const CAP_LIGHTNESS = 55;

/** Starting chroma. Lowered until all 16 fit in sRGB (see `solveChroma`). */
const START_CHROMA = 38;

/** Below this the samples are nearly grey and the test stops discriminating. */
const MIN_CHROMA = 12;

const toRgb = converter('rgb');
const toLch = converter('lch');
const rgbInGamut = inGamut('rgb');

export interface Cap {
  /** Stable index 0–15. It is also the label the user sees (+1). */
  index: number;
  hex: string;
  /** Hue in degrees, for debugging and the diagnostic panel. */
  hue: number;
}

function ringAtChroma(chroma: number): Lch[] {
  return Array.from({ length: CAP_COUNT }, (_, i) => ({
    mode: 'lch' as const,
    l: CAP_LIGHTNESS,
    c: chroma,
    h: (i * 360) / CAP_COUNT,
  }));
}

/**
 * The highest chroma (in steps of 1) at which all 16 samples fit in sRGB.
 *
 * Searched rather than fixed because the sRGB gamut is not a cylinder: at
 * L*=55 yellow-green admits far more chroma than blue. It has to be the common
 * minimum, or some samples would be clipped and their hue would shift —
 * precisely the error that would ruin the measurement.
 */
function solveChroma(): number {
  for (let c = START_CHROMA; c >= MIN_CHROMA; c -= 1) {
    if (ringAtChroma(c).every((color) => rgbInGamut(color))) return c;
  }
  throw new Error(
    `[face/caps] No chroma in [${MIN_CHROMA}, ${START_CHROMA}] fits all ` +
      `${CAP_COUNT} samples in sRGB at L*=${CAP_LIGHTNESS}. Check CAP_LIGHTNESS.`,
  );
}

export const CAP_CHROMA = solveChroma();

/**
 * The test samples. Deterministic: same code, same colours, always. A test
 * whose samples changed between runs would not be reproducible.
 */
export const CAPS: readonly Cap[] = ringAtChroma(CAP_CHROMA).map((color, index) => ({
  index,
  hex: formatHex(color),
  hue: color.h ?? 0,
}));

/** The fixed reference sample the chain starts from. */
export const REFERENCE_CAP = CAPS[0];

/** The 15 the user arranges. */
export const MOVABLE_CAPS: readonly Cap[] = CAPS.slice(1);

/**
 * Checks the invariants that make the test valid, ALREADY QUANTISED to 8 bits.
 *
 * Verified on the final hex, not the theoretical Lch: between the ideal colour
 * and what ends up on screen there is an 8-bit-per-channel rounding, and the
 * on-screen one is what the user sees. If rounding misaligned the lightness,
 * this check catches it.
 *
 * It fails loudly, like `assertReady()` in the core: better for the app not to
 * start than to measure wrongly in silence, because our user cannot detect
 * that the samples were wrong.
 */
export function assertCapsValid(): void {
  const back = CAPS.map((cap) => toLch(cap.hex));

  const missing = back.findIndex((c) => !c);
  if (missing >= 0) {
    throw new Error(`[face/caps] Sample ${missing} could not be converted back to Lch.`);
  }

  const ls = back.map((c) => c!.l);
  const cs = back.map((c) => c!.c);
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

  if (spread(ls) > 1) {
    throw new Error(
      `[face/caps] Lightness is not constant (range ${spread(ls).toFixed(2)} L*). ` +
        `The user would sort by lightness and the test would not measure the confusion axis.`,
    );
  }
  if (spread(cs) > 1) {
    throw new Error(
      `[face/caps] Chroma is not constant (range ${spread(cs).toFixed(2)}). ` +
        `Saturation would become an alternative cue.`,
    );
  }
  const outOfGamut = CAPS.filter((cap) => !toRgb(cap.hex));
  if (outOfGamut.length) {
    throw new Error(`[face/caps] ${outOfGamut.length} samples are outside sRGB.`);
  }
}

assertCapsValid();
