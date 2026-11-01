/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MEASURING THE COLOUR OF A GARMENT
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  This is the number the whole product hangs on. Every verdict, every family
 *  and every "does this go with what I own" traces back to it — and our user
 *  cannot check it. So it is deterministic, auditable, and it reports how much
 *  it trusts itself.
 *
 *  ── THE ONE HARD PROBLEM: SHADING IS NOT A SECOND COLOUR ─────────────────
 *
 *  A photograph of fabric is mostly shadow. A plain t-shirt runs from a lit
 *  highlight to a deep fold, and in raw pixel terms those two ends are further
 *  apart than a lot of genuinely different colours. So the naive readings both
 *  fail, and both failed here in front of a user:
 *
 *    · the CENTRE OF THE FRAME → a black tee with a printed circle came back
 *      "light yellow", because the centre of the picture was the print;
 *    · LAB CELLS BY AREA → a plain orange tee came back "37% dominant,
 *      patterned", because one colour spread across three cells of lightness
 *      and no cell held a majority.
 *
 *  What separates the two cases is not how far apart the pixels are, it is HOW
 *  THEY ARE DISTRIBUTED. Shading is a continuous ramp: every value between the
 *  highlight and the shadow is present, because the fabric curves smoothly. A
 *  print is a gap: the shirt's pixels are here, the graphic's are over there,
 *  and nothing lies between. That distinction is the whole method.
 *
 *  ── METHOD ──────────────────────────────────────────────────────────────
 *
 *   1. Decide which pixels are the GARMENT. Given a cut-out from the engine's
 *      background removal, the alpha channel answers it exactly. Without one,
 *      estimate the backdrop from the outer ring and drop what matches it.
 *   2. Group by HUE, which shading barely moves — never by lightness, which
 *      shading dominates. Pixels too grey to have a meaningful hue go into one
 *      neutral pool.
 *   3. Split that neutral pool only at a real VALLEY in lightness: two peaks
 *      with a gap between them. Black-and-white stripes split here. A shaded
 *      black shirt does not, because it has no gap.
 *   4. Take the largest group and absorb what is merely the same colour under
 *      different light — a neighbouring hue band, or a shadow dark enough to
 *      have lost its colour, but only when the values run continuously into it.
 *   5. Report the median of that group, and the share of the garment it covers.
 *      A genuine second colour makes itself known as a second large group, and
 *      the user is told the answer is only the dominant colour.
 *
 *  ⚠️ NOTHING HERE IS TUNED BY EYE. `scripts/garment-harness.mjs` builds garments whose colour
 *     is known by construction, with shading harsher than any real photo, and
 *     asserts both directions: solid must not read as patterned, and patterned
 *     must not read as solid.
 *
 *  ⚠️ NO PIXELS ARE READ HERE. It takes a raw buffer so it works unchanged from
 *     a Canvas `ImageData` in the browser and from `sharp` on the server, which
 *     is what keeps `core/color` free of Node dependencies.
 */
import { converter, differenceEuclidean } from 'culori';
import type { Lab } from '@/core/contracts/types';

const toLab = converter('lab');
const toLch = converter('lch');
const toRgb = converter('rgb');
const deltaE76 = differenceEuclidean('lab');

/** ΔE76 below which a pixel counts as background. */
const BACKGROUND_MATCH = 14;
/**
 * Hue band, in degrees.
 * ⚠️ It must divide 360 exactly, or the band at the top of the circle is a
 * different width from the rest and red straddles the seam.
 */
const HUE_BIN = 24;
const HUE_BANDS = 360 / HUE_BIN;
/** Below this chroma a pixel has no usable hue: its angle is mostly noise. */
const ACHROMATIC_CHROMA = 8;
/** A group covering at least this much of the garment is a second colour. */
const SECOND_COLOUR_SHARE = 0.12;
/** Alpha above which a cut-out pixel counts as garment. */
const OPAQUE = 200;
/** Sensor saturation and the floor of the encoding. Neither carries colour. */
const CLIP_HIGH = 250;
const CLIP_LOW = 5;

// ── Valley detection: the test that tells a shadow from a print ────────────
/** Lightness histogram resolution, in L*. */
const VALLEY_BIN = 4;
/** Peaks closer than this in L* are one colour under different light. */
const MIN_PEAK_SEPARATION = 20;
/** A second peak below this fraction of the first is noise, not a colour. */
const SECOND_PEAK_MIN = 0.22;
/** The dip between two peaks must fall below this fraction of the smaller one. */
const VALLEY_MAX = 0.4;
/** Below this many pixels a histogram is too sparse to read honestly. */
const MIN_PIXELS_TO_SPLIT = 200;
/** Guard against pathological recursion on noisy images. */
const MAX_SPLIT_DEPTH = 3;

export interface ColorMeasurement {
  hex: string;
  lab: Lab;
  /** Estimated background colour, for diagnostics. */
  backgroundHex: string;
  /** 0–100. How much of the garment is this colour. */
  dominantShare: number;
  /** True when a second colour covers enough of the garment to matter. */
  looksPatterned: boolean;
  /** 0–100. How much of the frame was garment at all. Low = framed too far. */
  coverage: number;
  /**
   * 0–100. Garment pixels with a channel pinned at the top or bottom of the
   * 8-bit range. Those pixels are not a dark colour or a light one — they are
   * an absence of measurement, and a photo made mostly of them cannot be read.
   */
  clippedShare: number;
  /**
   * L* of the 95th-percentile pixel of the WHOLE frame — how bright the
   * brightest real surface in the photo is.
   *
   * ⚠️ It is about the photograph, not about the world, and that is what makes
   * it usable. A camera has no lightness constancy: halve the light and every
   * colour in the frame is recorded darker, so an underexposed photo reports a
   * teal shirt as a dark teal one. We cannot know the lamp, but we can see that
   * nothing in the frame came out bright, and say the reading runs dark.
   */
  exposure: number;
}

export interface RawImage {
  /** Interleaved pixel data. RGBA from Canvas, RGB from sharp. */
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  /** 4 for Canvas ImageData, 3 for sharp `.raw()` after `removeAlpha()`. */
  channels: 3 | 4;
  /**
   * Set this when the alpha channel is a real cut-out mask — the output of the
   * engine's background removal — and transparent means "not the garment".
   *
   * ⚠️ It is opt-in on purpose. A Canvas `ImageData` is also 4-channel, but its
   * alpha is 255 everywhere; treating that as a mask would silently do nothing,
   * and treating an absent mask as one would measure the whole frame.
   */
  alphaIsMask?: boolean;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const medianLab = (px: Lab[]): Lab => [
  median(px.map((p) => p[0])),
  median(px.map((p) => p[1])),
  median(px.map((p) => p[2])),
];

const hex2 = (v: number) =>
  Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

function labToHex(lab: Lab): string {
  const c = toRgb({ mode: 'lab', l: lab[0], a: lab[1], b: lab[2] });
  return `#${hex2(c.r * 255)}${hex2(c.g * 255)}${hex2(c.b * 255)}`;
}

/** Chroma and hue of a Lab triple. Hue is meaningless when chroma is tiny. */
function lch(t: Lab): { c: number; h: number } {
  const v = toLch({ mode: 'lab', l: t[0], a: t[1], b: t[2] });
  return { c: v?.c ?? 0, h: v?.h ?? 0 };
}

/** Shortest angular distance between two hues, in degrees. */
const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * Find one deep valley in the lightness histogram, and cut there.
 *
 * Returns `null` when the values form a single continuous run — which is what
 * shading looks like, and the reason a folded shirt is not called patterned.
 * Returns the two sides when there are two populated regions with a genuine gap
 * between them, which is what a print or a stripe looks like.
 */
function splitAtValley(px: Lab[]): [Lab[], Lab[]] | null {
  if (px.length < MIN_PIXELS_TO_SPLIT) return null;

  let lo = Infinity;
  let hi = -Infinity;
  for (const p of px) {
    if (p[0] < lo) lo = p[0];
    if (p[0] > hi) hi = p[0];
  }
  if (hi - lo < MIN_PEAK_SEPARATION) return null;

  const n = Math.floor((hi - lo) / VALLEY_BIN) + 1;
  const hist = new Array<number>(n).fill(0);
  for (const p of px) hist[Math.floor((p[0] - lo) / VALLEY_BIN)]++;

  let p1 = 0;
  for (let i = 1; i < n; i++) if (hist[i] > hist[p1]) p1 = i;

  // The second peak has to be far enough away to be a different colour rather
  // than the same colour a bit darker.
  const sep = Math.ceil(MIN_PEAK_SEPARATION / VALLEY_BIN);
  let p2 = -1;
  for (let i = 0; i < n; i++) {
    if (Math.abs(i - p1) < sep) continue;
    if (p2 < 0 || hist[i] > hist[p2]) p2 = i;
  }
  if (p2 < 0 || hist[p2] < hist[p1] * SECOND_PEAK_MIN) return null;

  const [a, b] = p1 < p2 ? [p1, p2] : [p2, p1];
  let v = a;
  for (let i = a + 1; i < b; i++) if (hist[i] < hist[v]) v = i;

  // ⚠️ THE DECISIVE TEST. A shallow dip is a fold; a deep one is an edge. If
  // the pixels between the two peaks are nearly as many as the peaks
  // themselves, the fabric runs continuously from one to the other and this is
  // one colour being lit unevenly.
  if (hist[v] > hist[p2] * VALLEY_MAX) return null;

  const cut = lo + (v + 0.5) * VALLEY_BIN;
  const below = px.filter((p) => p[0] < cut);
  const above = px.filter((p) => p[0] >= cut);
  if (!below.length || !above.length) return null;
  return [below, above];
}

/** Apply `splitAtValley` until the pixels form continuous runs. */
function lightnessClusters(px: Lab[], depth = 0): Lab[][] {
  if (depth >= MAX_SPLIT_DEPTH) return [px];
  const split = splitAtValley(px);
  if (!split) return [px];
  return [
    ...lightnessClusters(split[0], depth + 1),
    ...lightnessClusters(split[1], depth + 1),
  ];
}

/**
 * Measure the dominant colour of a garment photo.
 *
 * Feed it a DOWNSCALED image (≈256 px long edge): it averages out JPEG noise
 * without shifting hue, and keeps the work cheap.
 */
export function measureDominantColor(img: RawImage): ColorMeasurement {
  const { data, width: w, height: h, channels } = img;
  const masked = img.alphaIsMask === true && channels === 4;

  const labAt = (x: number, y: number): Lab => {
    const i = (y * w + x) * channels;
    const c = toLab({ mode: 'rgb', r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255 });
    return [c.l, c.a, c.b];
  };
  const alphaAt = (x: number, y: number): number => data[(y * w + x) * channels + 3];

  // ── 1. Which pixels are the garment ──────────────────────────────────
  // With a cut-out we know exactly. Without one, the outer ring is the best
  // available guess: what sits at the edge of the photo is rarely the garment.
  const ring: Lab[] = [];
  const sampleEdge = (x: number, y: number) => {
    if (!masked || alphaAt(x, y) < OPAQUE) ring.push(labAt(x, y));
  };
  for (let x = 0; x < w; x++) {
    sampleEdge(x, 0);
    sampleEdge(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    sampleEdge(0, y);
    sampleEdge(w - 1, y);
  }
  // A cut-out that reaches all four edges leaves no backdrop to sample. The
  // measurement does not need one; only the diagnostic field does.
  const bg: Lab = ring.length ? medianLab(ring) : [100, 0, 0];
  const bgColor = { mode: 'lab' as const, l: bg[0], a: bg[1], b: bg[2] };

  // How bright the brightest real surface in the frame came out. The 95th
  // percentile rather than the maximum, so one specular highlight or a stuck
  // pixel cannot declare a dim photo well exposed.
  const allL: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) allL.push(labAt(x, y)[0]);
  allL.sort((a, b) => a - b);
  const exposure = Math.round(allL[Math.floor(allL.length * 0.95)]);

  const total = w * h;
  let garment: Lab[] = [];

  /**
   * ⚠️ PROGRESSIVE THRESHOLD, and it fixes a real failure.
   *
   * A generous threshold is right for the common case — a garment on a plain
   * backdrop — but it erases a PALE garment on a PALE background: an off-white
   * shirt on white came back as 0% garment, and an earlier version reported the
   * backdrop's colour as the shirt's. Rather than loosen it for everyone and
   * start eating backdrops, we tighten it only when the first pass found almost
   * nothing.
   *
   * With a cut-out this runs once and skips the comparison entirely: the mask
   * has already answered the question exactly.
   */
  let clipped = 0;
  const isClipped = (x: number, y: number): boolean => {
    const i = (y * w + x) * channels;
    for (let c = 0; c < 3; c++) {
      if (data[i + c] >= CLIP_HIGH || data[i + c] <= CLIP_LOW) return true;
    }
    return false;
  };

  for (const threshold of masked ? [0] : [BACKGROUND_MATCH, 6, 2.5]) {
    garment = [];
    clipped = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (masked) {
          if (alphaAt(x, y) < OPAQUE) continue;
        } else {
          const p = labAt(x, y);
          if (deltaE76({ mode: 'lab', l: p[0], a: p[1], b: p[2] }, bgColor) < threshold) continue;
        }
        garment.push(labAt(x, y));
        if (isClipped(x, y)) clipped++;
      }
    }
    // 4% of the frame is enough to measure from; below that, try harder.
    if (garment.length / total >= 0.04) break;
  }

  // Nothing separable from the background: the frame is all backdrop, or the
  // garment is the same colour as it. Report the background and let the caller
  // tell the user to reframe — never invent a garment colour.
  if (!garment.length) {
    return {
      hex: labToHex(bg),
      lab: [Math.round(bg[0] * 10) / 10, Math.round(bg[1] * 10) / 10, Math.round(bg[2] * 10) / 10],
      backgroundHex: labToHex(bg),
      dominantShare: 0,
      looksPatterned: false,
      coverage: 0,
      clippedShare: 0,
      exposure,
    };
  }

  // ── 2. Group by hue; pool everything too grey to have one ────────────
  const byHue = new Map<number, Lab[]>();
  const neutral: Lab[] = [];
  for (const p of garment) {
    const { c, h: hue } = lch(p);
    if (c < ACHROMATIC_CHROMA) {
      neutral.push(p);
      continue;
    }
    // ⚠️ The modulo closes the hue circle. Without it a red garment sitting at
    // 358° and 2° lands in two bands 4° apart, and a plain red shirt is split
    // in half by arithmetic.
    const band = Math.round(hue / HUE_BIN) % HUE_BANDS;
    const bucket = byHue.get(band);
    if (bucket) bucket.push(p);
    else byHue.set(band, [p]);
  }

  // ── 3. The neutral pool splits only at a real valley ─────────────────
  // Black and white stripes separate here. A shaded black shirt does not.
  const groups: Lab[][] = [...byHue.values(), ...lightnessClusters(neutral)].filter(
    (g) => g.length > 0,
  );

  // ── 4. Largest group, plus what is only itself under different light ──
  groups.sort((a, b) => b.length - a.length);
  let dominant = groups[0];
  const dominantWasChromatic = lch(medianLab(dominant)).c >= ACHROMATIC_CHROMA;
  const rest: Lab[][] = [];

  for (const g of groups.slice(1)) {
    const dm = medianLab(dominant);
    const gm = medianLab(g);
    const dLch = lch(dm);
    const gLch = lch(gm);

    let sameColour = false;
    if (dominantWasChromatic && gLch.c >= ACHROMATIC_CHROMA) {
      // Two chromatic groups: the same garment can straddle a band boundary,
      // and rounding must not be allowed to invent a second colour.
      sameColour = hueGap(dLch.h, gLch.h) <= HUE_BIN;
    } else if (dominantWasChromatic) {
      /**
       * A grey group next to a coloured one is the ambiguous case, and the
       * valley test is what resolves it: the deep fold of a navy jumper loses
       * its chroma and reads as near-black, but the fabric ramps continuously
       * into it. A black print on a navy jumper does not — there is a gap.
       */
      sameColour = gLch.c < ACHROMATIC_CHROMA * 2 && splitAtValley([...dominant, ...g]) === null;
    }
    // Two neutral groups are never merged: they only exist because the valley
    // test already separated them, and undoing that would report mid-grey for
    // a black-and-white striped shirt — a colour that is nowhere on it.

    if (sameColour) dominant = [...dominant, ...g];
    else rest.push(g);
  }

  // ── 5. Answer, and how much of the garment it speaks for ─────────────
  const lab = medianLab(dominant);
  const share = dominant.length / garment.length;
  const secondShare = rest.length
    ? Math.max(...rest.map((g) => g.length)) / garment.length
    : 0;

  return {
    hex: labToHex(lab),
    lab: [Math.round(lab[0] * 10) / 10, Math.round(lab[1] * 10) / 10, Math.round(lab[2] * 10) / 10],
    backgroundHex: labToHex(bg),
    dominantShare: Math.round(share * 100),
    /**
     * ⚠️ DECIDED BY THE SECOND COLOUR, NOT BY THE FIRST ONE'S SHARE.
     *
     * "Dominant below 70%" was the old rule and it produced the false alarm a
     * user reported: shading pushed a plain shirt under the line with no second
     * colour anywhere in the frame. What makes a garment patterned is that
     * something else is genuinely on it, covering enough area to be seen.
     */
    looksPatterned: secondShare >= SECOND_COLOUR_SHARE,
    coverage: Math.round((garment.length / total) * 100),
    clippedShare: Math.round((clipped / garment.length) * 100),
    exposure,
  };
}
