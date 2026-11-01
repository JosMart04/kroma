/**
 * ══════════════════════════════════════════════════════════════════════════
 *  CONTRACTS — THE BOUNDARY BETWEEN THE FOUR SLICES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: core. Changing a type here changes every slice at once.
 *
 *  If a slice needs a change, it is proposed, decided by the core owner,
 *  made in one commit and announced — even for "just one small field".
 *
 *  Everything that crosses a slice boundary goes through here.
 *  What is internal to a slice does NOT belong in this file.
 */

// ─────────────────────────────────────────────────────────────────────────
//  BLOCK A · The user's perceptual profile
// ─────────────────────────────────────────────────────────────────────────

/** The three supported confusion axes. Achromatopsia is out of scope. */
export type CVDType = 'protan' | 'deutan' | 'tritan' | 'normal';

/**
 * The user's profile. Product of F1 (calibration).
 * The WHOLE system computes against this: no profile, no verdict.
 */
export interface CVDProfile {
  type: CVDType;
  /** 0.0 = normal vision · 1.0 = full dichromacy. Most people land in 0.3–0.7. */
  severity: number;
  source: 'calibrated' | 'self_reported';
  /** How conclusive the test was, 0–1. Below 0.5, suggest repeating it. */
  confidence: number;
  calibratedAt: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────────────
//  Confidence layer — it runs through EVERY measurement
// ─────────────────────────────────────────────────────────────────────────

/**
 * 'measured'  → the measurement is reliable and can be shown
 * 'low_light' → shown, but degraded and with a visible warning
 * 'refuse'    → NOT SHOWN. A refusal screen. This is not an error:
 *               it is a product feature.
 */
export type ConfidenceLevel = 'measured' | 'low_light' | 'refuse';

export interface MeasurementConfidence {
  level: ConfidenceLevel;
  /**
   * Shift between the raw reading and the light-normalised one. High = the
   * light is lying.
   *
   * ⚠️ NULL MEANS THE CHECK NEVER RAN, and it is not interchangeable with 0.
   * Zero is a verified result: we looked and the light was honest. Null is the
   * absence of a result, and reporting it as 0 would show a perfect-confidence
   * badge for a measurement nobody checked.
   */
  lightingDeltaE: number | null;
  /** Actionable text for the user when level !== 'measured'. Null when fine. */
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOCK A · Colour portrait — the user's FIXED palette
// ─────────────────────────────────────────────────────────────────────────

export type FitzpatrickType = 1 | 2 | 3 | 4 | 5 | 6;

/** The exact values the Facial Color Tones Analyzer returns. Do not invent others. */
export type EyeColorName = 'Amber' | 'Brown' | 'Green' | 'Blue' | 'Gray' | 'Other';
export type HairColorName = 'Auburn' | 'Black' | 'Blonde' | 'Brown' | 'Grey/White' | 'Red';

/**
 * Product of F2. The palette the user wears ALL THE TIME.
 * The F11 traffic light must treat it as one more element of the outfit:
 * a shirt does not only compete with the trousers, but with skin and hair too.
 */
export interface ColorPortrait {
  /**
   * ⚠️ NULL MEANS THE PHOTOTYPE WAS NOT MEASURED, and it must be shown as such.
   * Redness is uninterpretable without it, which is a reason to SAY it is
   * missing — never a reason to invent one.
   */
  fitzpatrick: FitzpatrickType | null;

  skinHex: string;
  eyeHex: string;
  eyeName: EyeColorName;
  eyebrowHex: string;
  lipHex: string;
  /**
   * ⚠️ A CATEGORY SWATCH, NOT A MEASUREMENT. The analyser's documented schema
   *    allows only seven preset hex values for hair, one per hair category —
   *    unlike skin, eyes, brows and lips, which are free measured values. The
   *    screen must say so. Null when the engine returned none: a hair colour we
   *    made up would enter every hair verdict as if it were real.
   */
  hairHex: string | null;
  /** Null when the engine named no category we recognise. */
  hairName: HairColorName | null;

  /**
   * ⚠️ raw_score, NEVER ui_score. The official documentation admits ui_score is
   * adjusted upwards as a "psychological motivator". This whole product rests
   * on the user being unable to detect us flattering them, so the raw value is
   * not optional.
   *
   * ⚠️ INVERTED SCALE: higher = BETTER condition. 72 is not "72% redness".
   *
   * ⚠️ `null` means WE DID NOT MEASURE IT, and it must be shown as such. A
   *    `?? 0` default would turn a missing entry into 0 — the most alarming
   *    value on an inverted scale. A type that cannot say "unknown" forces a
   *    lie at the first gap.
   */
  rednessRaw: number | null;

  confidence: MeasurementConfidence;
  measuredAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOCK B · Wardrobe
// ─────────────────────────────────────────────────────────────────────────

/**
 * Categories. Only some have a try-on in the API — see `CATEGORIES_WITH_VTO`.
 * The ones without one STILL ENTER the wardrobe and every verdict: belt
 * against shoes and tie against shirt are among the most cited clash points in
 * the research, and neither has a render.
 */
export type GarmentCategory =
  | 'top' | 'bottom' | 'outerwear' | 'dress'
  | 'shoes' | 'scarf' | 'hat' | 'bag'
  | 'belt' | 'tie' | 'socks' | 'other';

/** CIELAB coordinates. ALL of the project's maths runs on these. */
export type Lab = readonly [L: number, a: number, b: number];

export interface Garment {
  id: string;
  userId: string;
  imageUrl: string;
  category: GarmentCategory;

  colorHex: string;
  colorLab: Lab;
  /** Natural-language name: "olive green", "navy blue". */
  colorName: string;

  /** When patterned, the dominant colour is indicative only: say so. */
  isPatterned: boolean;

  /**
   * ⚠️ A garment measured as 'low_light' contaminates EVERY future combination
   * it takes part in. The traffic light must degrade its verdict.
   */
  confidence: MeasurementConfidence;

  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
//  Verdict — the heart of the product
// ─────────────────────────────────────────────────────────────────────────

export type Verdict = 'safe' | 'risky' | 'clash';

export interface PairVerdict {
  verdict: Verdict;

  /** Perceptual distance in normal vision. */
  deltaENormal: number;
  /** Perceptual distance in the user's simulated space. This is what matters. */
  deltaESimulated: number;
  /** WCAG-style luminance contrast ratio. */
  luminanceContrast: number;

  /**
   * 🔑 THE RULE THAT SETS US APART.
   * True when the pair collides in HUE but is told apart by LIGHTNESS.
   * Lightness is the channel that survives colour blindness. Flagging these
   * cases as a clash produces constant false alarms and destroys trust.
   */
  savedByLuminance: boolean;

  /** The why, in the user's language. Never raw numbers in the interface. */
  explanation: string;
}

/** Product of F8. Computed on the fly, NOT persisted. */
export interface ColorFamily {
  id: number;
  garmentIds: string[];
  representativeHex: string;
  /** Smallest separation inside the family, in the user's space. */
  minInternalDeltaE: number;
}

/**
 * F9 · "You may already own this."
 *
 * ⚠️ TWO DIFFERENT WARNINGS LIVE HERE AND THEY MUST NOT BE MERGED, because the
 *    advice differs and one of them can embarrass the user.
 *
 *    · `same_colour` — the two garments really are the same colour, and anyone
 *      would agree. Safe to say out loud: "you already own this."
 *    · `indistinguishable` — they are genuinely DIFFERENT colours that this
 *      person cannot separate. Telling them "you already own this navy" when
 *      the new one is dark green would be wrong, and someone with normal vision
 *      would contradict us in front of them. The honest sentence is that they
 *      will not be able to tell the two apart.
 *
 *    Collapsing them into one message would make us confidently wrong in the
 *    case our user can least afford.
 */
export type DuplicateKind = 'same_colour' | 'indistinguishable';

export interface DuplicateAlert {
  newGarmentId: string;
  collidesWith: Array<{
    garmentId: string;
    colorName: string;
    kind: DuplicateKind;
    /** Distance between the measured colours. Small = the same colour. */
    deltaEReal: number;
    /**
     * Distance as THIS person sees them. Small = they cannot be separated.
     *
     * ⚠️ Null when there is no calibrated profile yet, and it must never be
     * rendered as a number in that case. "Not computed" is not "computed and
     * zero" — zero would claim the two are identical to them, which is the
     * strongest statement this type can make and one we have not earned.
     */
    deltaESimulated: number | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOCK C · Purchase decision — the output that closes the demo
// ─────────────────────────────────────────────────────────────────────────

export interface GarmentAnalysis {
  garment: Garment;
  /** "Goes with 62% of your wardrobe". This figure is the retail argument. */
  compatibilityPercent: number;
  worksWith: Garment[];
  clashesWith: Garment[];
  /** Binary already downloaded to OUR storage. Never the YouCam URL: it expires in 2 h. */
  vtoImageUrl: string | null;
  /** Verdict against F2's fixed palette (skin, eyes, hair). */
  verdictVsPortrait: PairVerdict;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOCK D · Makeup
// ─────────────────────────────────────────────────────────────────────────

/** Product of F16: redness before and after a corrector, both measured. */
export interface CorrectionResult {
  rednessBefore: number;
  rednessAfter: number;
  delta: number;
  correctorUsed: string;
  neutralized: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
//  Shared constants
// ─────────────────────────────────────────────────────────────────────────

/**
 * Wardrobe categories with a real try-on in the API. The rest enter the logic
 * without a render.
 *
 * ⚠️ OUR `outerwear` IS THE ENGINE'S `outer`. `cloth-v4` rejects `outerwear`
 *    with 400 "garment_category is not one of the accepted values" and accepts
 *    `outer`; the mapping lives in `core/youcam/tryOnCategory.ts`. In our own
 *    vocabulary a jacket stays `outerwear`, because that is what the user owns.
 */
export const CATEGORIES_WITH_VTO: readonly GarmentCategory[] = [
  'top', 'bottom', 'outerwear', 'dress', 'shoes', 'scarf', 'hat', 'bag',
] as const;

/**
 * These four require an explicit `gender` parameter, which is absent from the
 * generic examples in the documentation. Omitting it produces an unclear error.
 */
export const CATEGORIES_REQUIRING_GENDER: readonly GarmentCategory[] = [
  'shoes', 'scarf', 'hat', 'bag',
] as const;

/** Practical hue-collision threshold, in ΔE over the simulated space. */
export const COLLISION_THRESHOLD_DELTA_E = 11;

/** Below this, two garments are "almost the same" → duplicate alert (F9). */
export const DUPLICATE_THRESHOLD_DELTA_E = 5;

/** Luminance contrast above which a pair is saved despite colliding in hue. */
export const LUMINANCE_RESCUE_THRESHOLD = 1.8;
