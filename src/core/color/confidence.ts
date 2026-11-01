/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F4 · THE CONFIDENCE LAYER, AND THE RIGHT TO REFUSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  The feature no competitor will have, and the reason this product is worth
 *  building at all.
 *
 *  Our user cannot look at a colour we report and notice it is wrong. Every
 *  other app can be audited by its own user; ours cannot. So the honesty has to
 *  be built in, and that means being able to say **"I cannot tell in this
 *  light"** and stop.
 *
 *  ── HOW WE KNOW THE LIGHT IS LYING ──────────────────────────────────────
 *
 *  We measure the same face twice: once on the photo as taken, and once on the
 *  same photo after the engine normalises its lighting. **The distance between
 *  those two readings is the measurement of the lie.** If normalising the light
 *  barely moves the colour, the light was honest. If it moves it a lot, the
 *  original reading was mostly telling us about the lamp.
 *
 *  That is a real, measured quantity — not a guess about the pixels, and not a
 *  heuristic we invented.
 *
 *  ── THE THRESHOLD IS BORROWED, NOT INVENTED ─────────────────────────────
 *
 *  The refusal threshold is COLLISION_THRESHOLD_DELTA_E, the same distance at
 *  which two garments become indistinguishable to this user. The reasoning: if
 *  the lighting shifted our reading by more than the amount that makes two
 *  colours the same to them, we do not know their colour. Reusing a threshold
 *  the project already justifies beats inventing a new number to defend.
 */
import type { Lab, MeasurementConfidence } from '@/core/contracts/types';
import { COLLISION_THRESHOLD_DELTA_E } from '@/core/contracts/types';
import { deltaE, hexToLab, labToRgb, rgbToLab } from './deltae';

/** Below this the lighting shift is not worth mentioning. */
const TRUSTWORTHY_DELTA_E = 5;

/** What the engine reports about the capture. Any field may be absent. */
export interface CaptureQuality {
  has_face?: boolean;
  area?: string;
  frontal?: string;
  lighting?: string;
  faceangle?: string;
}

/**
 * Build the confidence for one measurement.
 *
 * @param rawHex     colour read from the photo as taken
 * @param normalisedHex colour read after lighting normalisation
 * @param quality    what the engine says about the capture, when available
 */
export function assessConfidence(
  rawHex: string,
  normalisedHex: string,
  quality?: CaptureQuality | null,
): MeasurementConfidence {
  const lightingDeltaE = Math.round(deltaE(hexToLab(rawHex), hexToLab(normalisedHex)) * 10) / 10;

  // No face, no measurement. Nothing else matters.
  if (quality && quality.has_face === false) {
    return {
      level: 'refuse',
      lightingDeltaE,
      reason:
        'I could not find a face in that photo. I need a straight-on shot where your face fills more than half the width.',
    };
  }

  const badLighting = Boolean(quality?.lighting && quality.lighting !== 'good');

  if (lightingDeltaE >= COLLISION_THRESHOLD_DELTA_E) {
    return {
      level: 'refuse',
      lightingDeltaE,
      reason:
        'The light in that photo shifted the colours more than the difference I am supposed to detect. Anything I told you now would be about the lamp, not about you. Try again near a window, away from direct sun.',
    };
  }

  if (lightingDeltaE >= TRUSTWORTHY_DELTA_E || badLighting) {
    return {
      level: 'low_light',
      lightingDeltaE,
      reason: badLighting
        ? 'The lighting was uneven, so these colours are approximate. Daylight from a window gives a much better reading.'
        : 'The light shifted these colours a little, so treat them as approximate rather than exact.',
    };
  }

  return { level: 'measured', lightingDeltaE, reason: null };
}

// ═══════════════════════════════════════════════════════════════════════════
//  GARMENTS ARE A DIFFERENT MEASUREMENT, AND NEED A DIFFERENT CONFIDENCE
// ═══════════════════════════════════════════════════════════════════════════
//
//  ⚠️ THE LIGHTING TRICK ABOVE DOES NOT WORK ON CLOTHES. WE MEASURED IT.
//
//  The same garment was photographed under five lights and put through the real
//  endpoint. If the raw-vs-normalised gap measured the light lying, an even
//  daylight shot would come back low and a tungsten cast high. It did the
//  opposite:
//
//      photo                        gap    what the layer would have said
//      even daylight, true colour   16.9   REFUSE      ← the best photo we had
//      strong folds, true colour     1.2   measured
//      warm bulb, colour IS shifted  5.9   low_light
//      cold cast, colour IS shifted 14.9   refuse
//      underexposed                 22.6   refuse
//
//  And on that daylight shot the normalisation did not correct the colour, it
//  destroyed it: the garment reads ΔE 1.8 from its true colour as taken, and
//  ΔE 20.2 after normalising. The engine is built to relight photographs of
//  scenes and faces; pointed at flat fabric on a plain backdrop it "fixes"
//  something that was not broken.
//
//  So the gap is a measurement of what the engine did, not of what the light
//  did, and using it here would have refused the good photos — the precise
//  failure that makes a product unusable. The lighting pass stays where it was
//  validated, on the face (observed gap ΔE 0.5–0.7, a real cast removed), and
//  the garment path uses signals we can defend instead.
//
//  ── WHAT WE CAN HONESTLY CLAIM ABOUT A GARMENT PHOTO ─────────────────────
//
//  We measured the colour of those pixels exactly. Whether those pixels show
//  the garment under neutral light depends on the lamp, and WITHOUT A SURFACE
//  OF KNOWN COLOUR IN THE FRAME THAT IS NOT RECOVERABLE. That is physics, not
//  a gap in our effort, and pretending otherwise is the failure this product
//  exists to prevent. What we can detect is when the pixels themselves cannot
//  carry the answer:
//
//   · CLIPPING — a channel pinned at 0 or 255 is not a colour, it is a missing
//     measurement, and no processing recovers it.
//   · THE ENCODING FLOOR — near black, neighbouring 8-bit values are far apart
//     in perceptual terms. On a very dark garment the format itself cannot
//     express the colour more precisely than a certain ΔE, and we say so.
//   · FRAMING — a garment covering little of the frame was measured from few
//     pixels.

/**
 * The frame is underexposed when nothing in it reached mid-grey.
 *
 * ⚠️ L* 50 IS NOT A TASTE, IT IS THE MIDPOINT OF THE LIGHTNESS SCALE — the
 * anchor CIELAB is built around. Saying "the brightest surface in this photo is
 * darker than mid-grey" needs no further justification, and it is a statement
 * about the photograph rather than a guess about the room.
 *
 * Measured across the test set: evenly lit frames land at 91–100, a frame shot
 * at 42% of the light lands at 44. Nothing sits near the line.
 */
const UNDEREXPOSED = 50;
/** Above this share of clipped pixels the fabric's colour is unknowable. */
const CLIPPING_REFUSE = 35;
/** Above this it is still readable, but only approximately. */
const CLIPPING_DOUBT = 12;
/** Below this share of the frame there were too few pixels to be sure. */
const FRAMING_DOUBT = 12;

/**
 * The smallest colour difference 8-bit sRGB can express at this colour.
 *
 * ⚠️ THIS IS NOT A GUESS, IT IS THE FORMAT'S OWN GRANULARITY. Step each channel
 * by one and see how far the colour moved. In the mid-tones that is a fraction
 * of a ΔE and irrelevant. Near black it grows, because sRGB spends few codes
 * down there — which is exactly where navy, charcoal and dark purple live, the
 * colours this product's users most need told apart. When the floor exceeds the
 * distance we call trustworthy, the limit is the photograph's encoding and the
 * honest thing is to report the reading as approximate.
 */
export function encodingFloor(lab: Lab): number {
  const rgb = labToRgb(lab);
  // Measure from the colour the photo can actually hold, not from the ideal
  // one: rounding to 8 bits has already happened by the time we read a pixel.
  const anchor = rgbToLab(rgb);
  let worst = 0;
  for (let c = 0; c < 3; c++) {
    for (const step of [-1, 1]) {
      const probe: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
      probe[c] = Math.max(0, Math.min(255, probe[c] + step));
      worst = Math.max(worst, deltaE(anchor, rgbToLab(probe)));
    }
  }
  return Math.round(worst * 10) / 10;
}

/** What the pixel measurement itself reports about its own conditions. */
export interface GarmentReading {
  lab: Lab;
  /** 0–100, share of garment pixels with a channel pinned at either end. */
  clippedShare: number;
  /** 0–100, share of the frame that was garment at all. */
  coverage: number;
  /** L* of the brightest real surface in the frame. */
  exposure: number;
  /** Whether the engine's cut-out isolated the garment from the backdrop. */
  isolated: boolean;
}

/**
 * Confidence for a garment colour.
 *
 * ⚠️ `lightingDeltaE` is null here on purpose, and the UI must not render it as
 * zero. No lighting comparison was made, because the measurement above shows it
 * would be misleading for this input. Null is "not checked"; zero would claim
 * "checked and perfect".
 */
export function assessGarmentConfidence(r: GarmentReading): MeasurementConfidence {
  if (r.coverage === 0) {
    return {
      level: 'refuse',
      lightingDeltaE: null,
      reason:
        'I could not separate the garment from what it is lying on — they are too close in colour for me to tell where one ends. Put it on a surface of a clearly different shade and try again.',
    };
  }

  if (r.clippedShare >= CLIPPING_REFUSE) {
    return {
      level: 'refuse',
      lightingDeltaE: null,
      reason: `${r.clippedShare}% of this garment is either blown out by the light or lost in shadow. Those pixels hold no colour at all, so any name I gave you would be invented. Move out of direct sun or away from the lamp and take it again.`,
    };
  }

  /**
   * ⚠️ THIS COMES BEFORE THE ENCODING FLOOR, AND THE ORDER IS THE POINT. A dim
   * photo makes every garment in it read dark, so it would also trip the floor
   * test — and that message says "this garment is dark", which is a statement
   * about their clothes when the truth is a statement about their lamp. Telling
   * someone the wrong thing to fix is worse than telling them nothing.
   */
  if (r.exposure < UNDEREXPOSED) {
    return {
      level: 'low_light',
      lightingDeltaE: null,
      reason:
        'Nothing in this photo came out brighter than mid-grey, so the whole frame is underexposed and every colour in it reads darker than it really is. The family is right; the shade will be too dark until you take it somewhere brighter.',
    };
  }

  const floor = encodingFloor(r.lab);
  if (floor > TRUSTWORTHY_DELTA_E) {
    return {
      level: 'low_light',
      lightingDeltaE: null,
      reason: `This garment is dark enough that the photo itself cannot pin the colour down closer than about ΔE ${floor}. I can tell you the family with confidence; treat the exact shade as approximate.`,
    };
  }

  if (r.clippedShare >= CLIPPING_DOUBT) {
    return {
      level: 'low_light',
      lightingDeltaE: null,
      reason: `${r.clippedShare}% of the fabric is over- or under-exposed, so this reading comes from the rest of it. Softer, more even light would give a firmer answer.`,
    };
  }

  if (r.coverage < FRAMING_DOUBT) {
    return {
      level: 'low_light',
      lightingDeltaE: null,
      reason:
        'The garment fills very little of the frame, so this colour comes from relatively few pixels. Move closer for a firmer reading.',
    };
  }

  return { level: 'measured', lightingDeltaE: null, reason: null };
}

/**
 * Plain-language framing advice from the same quality report. Returned
 * separately because it is about *how to retake the photo*, not about how much
 * to trust the numbers.
 */
export function framingHints(quality?: CaptureQuality | null): string[] {
  if (!quality) return [];
  const hints: string[] = [];
  /**
   * ⚠️ THE FRAME HAS A CEILING AS WELL AS A FLOOR, and this hint used to name
   *    only the floor. The engine documents a band — the face should occupy
   *    roughly 60–80% of the width — and it rejects a face that runs past the
   *    edges just as readily as one that is too small. "Move closer" is then
   *    exactly the wrong instruction, and the user follows it into a second
   *    refusal. `area` does not say which side of the band was missed, so the
   *    hint names the band instead of guessing a direction.
   */
  if (quality.area && quality.area !== 'good') hints.push('Aim for your face filling roughly two thirds to four fifths of the width — closer than a snapshot, but not so close that your chin or forehead leaves the frame.');
  if (quality.frontal && quality.frontal !== 'good') hints.push('Look straight at the camera — within about 10 degrees of square on.');
  if (quality.faceangle && quality.faceangle !== 'good') hints.push('Keep your head level, not tilted.');
  if (quality.lighting && quality.lighting !== 'good') hints.push('Find softer, more even light — a window works well.');
  return hints;
}
