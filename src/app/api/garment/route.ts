/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F6 + F10 · GARMENT INTAKE — photo in, measured colour and honest name out
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ── ONE ENGINE CALL, AND IT ANSWERS THE QUESTION WE CANNOT ──────────────
 *
 *  BACKGROUND REMOVAL tells us *which pixels are the garment*. Guessing that
 *  from the outer ring of the photo works until the garment and the backdrop
 *  are the same colour — a white shirt on a white table came back "light grey",
 *  ΔE 14 from the truth, because the only pixels the guess could keep were the
 *  shadowed ones. Through the cut-out the same photo reads ΔE 3.7. There is no
 *  pixel rule that fixes that; you have to know where the garment is.
 *
 *  ⚠️ THE MASK IS USED AS A MASK, NOT AS AN IMAGE. Colour is read from OUR
 *     pixels, and the cut-out contributes only its alpha channel. The engine has
 *     no reason to preserve colour exactly through a re-encode, and this is the
 *     one number we cannot let drift.
 *
 *  ⚠️ THE LIGHTING PASS USED TO RUN HERE AND WAS REMOVED, ON EVIDENCE. The gap
 *     between the raw and light-normalised readings is how the colour portrait
 *     measures its own confidence, and on a face it works. On garments we
 *     measured it across five lights and it was worse than uninformative: an
 *     evenly lit shot of a true colour came back ΔE 16.9 — a REFUSAL on the best
 *     photo in the set — while a warm cast that really had shifted the colour
 *     came back 5.9. On that daylight shot the normalisation moved the garment
 *     from ΔE 1.8 to ΔE 20.2 away from its true colour. See the block comment in
 *     `core/color/confidence.ts` for the table and what replaced it.
 *
 *  ⚠️ THE CUT-OUT MAY NOT COST THE USER THEIR ANSWER. If it fails, or comes back
 *     covering everything or nothing, we fall back to the ring estimate and
 *     measure anyway. An error screen for a photo we could read would be the
 *     worst outcome available.
 *
 *  ⚠️ MEASURING THE COLOUR IS NOT AN API FEATURE. There is no endpoint for it;
 *     we do it over the pixels ourselves. What the API contributes here is
 *     knowing where the garment is.
 */
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { uploadImage, toEngineJpeg } from '@/core/youcam/upload';
import { youcam } from '@/core/youcam/client';
import { YouCamError } from '@/core/youcam/errors';
import { withBudget, ROUTE_BUDGET_MS } from '@/core/youcam/budget';
import { measureDominantColor, type ColorMeasurement } from '@/core/color/measure';
import { nameColor } from '@/core/color/naming';
import { assessGarmentConfidence } from '@/core/color/confidence';
import { hexToLab } from '@/core/color';

export const runtime = 'nodejs';
/**
 * ⚠️ 60 IS THE CEILING ON VERCEL'S FREE PLAN, not a number we picked. Hobby
 * defaults to 10s and allows up to 60; anything higher is rejected at build.
 */
export const maxDuration = 60;

/** Small enough for a fast median, large enough to keep the hue intact. */
const MEASURE_EDGE = 256;
/**
 * A mask that keeps almost everything removed nothing, and one that keeps
 * almost nothing found nothing. Either way it is not a usable answer about
 * where the garment is, so we ignore it rather than measure through it.
 */
const MASK_MIN_COVERAGE = 0.03;
const MASK_MAX_COVERAGE = 0.97;

interface Raster {
  data: Buffer;
  width: number;
  height: number;
}

/** Downscale to the measuring size and hand back plain RGB. */
async function rasterise(buf: Buffer, at?: { width: number; height: number }): Promise<Raster> {
  const resize = at
    ? // Matching an existing raster exactly, so a mask lines up pixel for pixel.
      { width: at.width, height: at.height, fit: 'fill' as const }
    : { width: MEASURE_EDGE, height: MEASURE_EDGE, fit: 'inside' as const };
  const { data, info } = await sharp(buf).resize(resize).removeAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  return { data, width: info.width, height: info.height };
}

/**
 * The alpha plane of the cut-out, at the measuring size — or null when it does
 * not say anything usable.
 */
async function maskFrom(cutout: Buffer, at: { width: number; height: number }): Promise<Uint8Array | null> {
  const { data, info } = await sharp(cutout)
    .ensureAlpha()
    .resize({ width: at.width, height: at.height, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 4) return null;

  const n = at.width * at.height;
  const alpha = new Uint8Array(n);
  let kept = 0;
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3];
    alpha[i] = a;
    if (a >= 200) kept++;
  }
  const coverage = kept / n;
  if (coverage < MASK_MIN_COVERAGE || coverage > MASK_MAX_COVERAGE) return null;
  return alpha;
}

/** Measure a raster, through the cut-out when we have one. */
function measure(raster: Raster, mask: Uint8Array | null): ColorMeasurement {
  if (!mask) {
    return measureDominantColor({
      data: raster.data,
      width: raster.width,
      height: raster.height,
      channels: 3,
    });
  }
  // Our RGB, the engine's alpha.
  const n = raster.width * raster.height;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    rgba[i * 4] = raster.data[i * 3];
    rgba[i * 4 + 1] = raster.data[i * 3 + 1];
    rgba[i * 4 + 2] = raster.data[i * 3 + 2];
    rgba[i * 4 + 3] = mask[i];
  }
  return measureDominantColor({
    data: rgba,
    width: raster.width,
    height: raster.height,
    channels: 4,
    alphaIsMask: true,
  });
}

export async function POST(req: Request) {
  return withBudget(ROUTE_BUDGET_MS, () => handle(req));
}

async function handle(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No photo was uploaded.' }, { status: 400 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const jpeg = await toEngineJpeg(original);

    let mask: Uint8Array | null = null;
    const base = await rasterise(jpeg);
    try {
      const fileId = await uploadImage(jpeg, 'garment.jpg');
      mask = await maskFrom(await youcam.removeBackground(fileId), base);
    } catch (e) {
      // Fall back to estimating the backdrop from the edge of the frame. It is
      // a worse answer, not the absence of one.
      console.error('[api/garment] cut-out unavailable, using the ring estimate', e);
    }

    /**
     * The colour comes from the user's own pixels. Nothing the engine returns
     * is allowed to become the answer — it only told us where to look.
     */
    const raw = measure(base, mask);
    const confidence = assessGarmentConfidence({
      lab: raw.lab,
      clippedShare: raw.clippedShare,
      coverage: raw.coverage,
      exposure: raw.exposure,
      isolated: mask !== null,
    });
    const named = nameColor(raw.hex);

    return NextResponse.json({
      colorHex: raw.hex,
      colorLab: hexToLab(raw.hex),
      colorName: named.name,
      /**
       * A familiar CSS keyword, present only when it is genuinely close. Null
       * means no standard name is near enough to be worth offering — and the
       * measured description above stands on its own.
       */
      closestStandard: named.closestStandard,
      achromatic: named.achromatic,
      confidence,
      /**
       * Share of the garment covered by this one colour, and whether a second
       * colour covers enough of it to matter. A print or a check drives the
       * second one up, which is how we detect a pattern without asking the user
       * to tell us about something they cannot see.
       */
      dominantShare: raw.dominantShare,
      looksPatterned: raw.looksPatterned,
      /** How much of the frame was garment at all. Low means framed too far. */
      coverage: raw.coverage,
      /** Share of the fabric that is blown out or crushed and carries no colour. */
      clippedShare: raw.clippedShare,
      /** L* of the brightest surface in the frame. Low = the photo runs dark. */
      exposure: raw.exposure,
      /** Whether the engine's cut-out was used to isolate the garment. */
      isolated: mask !== null,
    });
  } catch (e) {
    if (e instanceof YouCamError) {
      return NextResponse.json(
        { error: e.userFacing.message, action: e.userFacing.action },
        { status: 422 },
      );
    }
    console.error('[api/garment]', e);
    return NextResponse.json(
      { error: 'Something went wrong while measuring that garment. Please try again.' },
      { status: 500 },
    );
  }
}
