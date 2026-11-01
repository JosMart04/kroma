/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F2 · COLOUR PORTRAIT — the measurement the whole product hangs on
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  POST a selfie, get back the palette this person wears every day and cannot
 *  see: skin, eyes, brows, lips, hair, phototype and redness.
 *
 *  This runs on the server for one reason: the API key must never reach the
 *  browser.
 *
 *  ── ONE CALL IS ESSENTIAL. THE OTHER FOUR ARE ENRICHMENT ────────────────
 *
 *  ⚠️ THIS USED TO BE ALL-OR-NOTHING, AND THAT IS WHY PHOTOS THAT WORKED IN
 *     PERFECT CORP'S OWN PLAYGROUND FAILED HERE.
 *
 *     The Playground makes ONE call — the equivalent of step 2 below. This
 *     route makes five, across two different images, one of which the lighting
 *     engine has relit. Any one of them throwing killed the whole portrait, so
 *     the app was strictly more fragile than the API it wraps, and the user got
 *     a 422 for a photo the engine had already read perfectly well.
 *
 *     Now only `skin-tone-analysis` on the photo as taken can fail the request.
 *     Everything else degrades: a field we could not measure comes back null
 *     and is reported as unmeasured, which is the same discipline redness has
 *     always had. Losing the phototype should cost the phototype, not the face.
 *
 *   1. Convert to the engine's format — EXIF rotation, flatten onto white,
 *      4:4:4 chroma. Skipping any of the three corrupts the colour.
 *   2. Read the face on the photo AS TAKEN.            ← the only hard step
 *   3. Normalise the lighting, read the same face again.
 *   4. The distance between those two readings is how much the light was
 *      lying. That, not a guess, is the confidence.
 *   5. Phototype and redness prefer the NORMALISED image and fall back to the
 *      original when the relit one is rejected.
 *
 *  ⚠️ Redness is only interpretable together with the phototype. The same raw
 *     score means something different on a phototype II than on a V.
 *
 *  ⚠️ EVERY FAILURE IS LOGGED WITH THE ENGINE'S OWN CODE. A production 422 was
 *     reported reading only "Something went wrong" — the fallback for an
 *     unmapped code — with nothing in the logs either. An error nobody can name
 *     is an error nobody can fix.
 */
import { NextResponse } from 'next/server';
import { uploadImage, toEngineJpeg } from '@/core/youcam/upload';
import { youcam, type SkinToneFull, type StrictnessLevel } from '@/core/youcam/client';
import { YouCamError } from '@/core/youcam/errors';
import { withBudget, ROUTE_BUDGET_MS } from '@/core/youcam/budget';
import { assessConfidence, framingHints, type CaptureQuality } from '@/core/color/confidence';
import type {
  ColorPortrait,
  EyeColorName,
  FitzpatrickType,
  HairColorName,
  MeasurementConfidence,
} from '@/core/contracts/types';

export const runtime = 'nodejs';
/**
 * ⚠️ 60 IS THE CEILING ON VERCEL'S FREE PLAN, not a number we picked. Hobby
 * defaults to 10s and allows up to 60; anything higher is rejected at build.
 */
export const maxDuration = 60;

/** Values the analyser is documented to return. Anything else becomes 'Other'. */
const EYE_NAMES: readonly string[] = ['Amber', 'Brown', 'Green', 'Blue', 'Gray', 'Other'];
const HAIR_NAMES: readonly string[] = ['Auburn', 'Black', 'Blonde', 'Brown', 'Grey/White', 'Red'];

/** Log an engine failure so an unmapped code can never go unnoticed again. */
function note(step: string, e: unknown) {
  if (e instanceof YouCamError) {
    console.error(
      `[api/portrait] ${step} failed · code=${e.code}` +
        `${e.unmapped ? ' (UNMAPPED — add it to core/youcam/errors.ts)' : ''}` +
        `${e.taskId ? ` task=${e.taskId}` : ''}` +
        `${e.detail ? ` · ${e.detail}` : ''}`,
    );
  } else {
    console.error(`[api/portrait] ${step} failed`, e);
  }
}

/**
 * Run something that we would like but can live without.
 *
 * ⚠️ Returns null instead of throwing, on purpose. These are the four calls
 *    that were turning a readable face into a 422.
 */
async function optional<T>(step: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    note(step, e);
    return null;
  }
}

/** The confidence to report when the second reading never happened. */
function unverified(quality: CaptureQuality | undefined): MeasurementConfidence {
  /**
   * ⚠️ NOT 'measured', AND `lightingDeltaE` STAYS NULL. Comparing the raw
   *    reading against itself would return ΔE 0 and the perfect-confidence
   *    badge — claiming we verified something we never checked.
   */
  const badLight = Boolean(quality?.lighting && quality.lighting !== 'good');
  return {
    level: 'low_light',
    lightingDeltaE: null,
    reason: badLight
      ? 'The lighting was uneven, and I could not double-check these colours against a light-corrected version of your photo. Treat them as approximate.'
      : 'I measured these colours, but could not double-check them against a light-corrected version of your photo, so treat them as approximate.',
  };
}

/**
 * The colour analyser's refusals that are about HEAD ANGLE and nothing else.
 *
 * ⚠️ ITS DEFAULT TOLERANCE IS 10° ON EVERY AXIS, and that is the single most
 *    common reason a selfie that looks straight-on to the person holding the
 *    phone is refused. The documented parameter accepts 15° (`medium`), so an
 *    angle refusal gets exactly one retry at that level — and the result is
 *    labelled approximate, because the engine itself says a stricter level
 *    gives more accurate attributes.
 */
function isAngleRefusal(code: string): boolean {
  return (
    code.startsWith('error_face_angle_') ||
    code === 'error_large_face_angle' ||
    code === 'error_face_not_forward_facing'
  );
}

/** Read the face at the default tolerance, relaxing it once for an angle refusal. */
async function readFace(
  fileId: string,
): Promise<{ face: SkinToneFull; strictness: StrictnessLevel }> {
  try {
    return { face: await youcam.skinTone(fileId, { strictness: 'high' }), strictness: 'high' };
  } catch (e) {
    if (!(e instanceof YouCamError) || !isAngleRefusal(e.code)) throw e;
    note('skin-tone at 10° tolerance', e);
    return { face: await youcam.skinTone(fileId, { strictness: 'medium' }), strictness: 'medium' };
  }
}

/**
 * Downgrade a confidence when the face was only readable at the relaxed angle.
 * Never upgrades anything, and never touches a refusal.
 */
function withAngleCaveat(c: MeasurementConfidence): MeasurementConfidence {
  if (c.level === 'refuse') return c;
  const caveat =
    'Your head was turned a little more than 10°, so I read your face at a looser angle tolerance (15°). Treat these colours as approximate — a straight-on photo would be more exact.';
  return { ...c, level: 'low_light', reason: c.reason ? `${c.reason} ${caveat}` : caveat };
}

export async function POST(req: Request) {
  return withBudget(ROUTE_BUDGET_MS, () => handle(req));
}

async function handle(req: Request) {
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'That request did not carry a photo in the form we expect.' },
        { status: 400 },
      );
    }
    const file = form.get('photo');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No photo was uploaded.' }, { status: 400 });
    }

    const original = Buffer.from(await file.arrayBuffer());
    const jpeg = await toEngineJpeg(original);
    const rawFileId = await uploadImage(jpeg, 'selfie.jpg');

    // ── Reading 1: the photo as taken. The one step that may fail. ───────
    const { face: raw, strictness } = await readFace(rawFileId);

    // Refuse early if there is no face: everything downstream would be noise,
    // and each further call costs a unit.
    if (raw.faceQuality && raw.faceQuality.has_face === false) {
      return NextResponse.json(
        {
          confidence: assessConfidence(raw.color.skin_color, raw.color.skin_color, raw.faceQuality),
          hints: framingHints(raw.faceQuality),
        },
        { status: 200 },
      );
    }

    // ── Reading 2: same face, lighting normalised. Optional from here. ───
    const normFileId = await optional('lighting', async () =>
      uploadImage(await youcam.normalizeLighting(rawFileId), 'selfie-normalised.jpg'),
    );
    const normalised = normFileId
      ? await optional('skin-tone (normalised)', () => youcam.skinTone(normFileId, { strictness }))
      : null;

    const quality = normalised?.faceQuality ?? raw.faceQuality ?? undefined;
    const measured = normalised
      ? assessConfidence(raw.color.skin_color, normalised.color.skin_color, quality)
      : unverified(quality);
    const confidence = strictness === 'high' ? measured : withAngleCaveat(measured);

    // The light is lying too much to keep spending units on this photo.
    if (confidence.level === 'refuse') {
      return NextResponse.json(
        { confidence, hints: framingHints(quality) },
        { status: 200 },
      );
    }

    /**
     * ── Phototype and redness ─────────────────────────────────────────────
     *
     * ⚠️ THEY PREFER THE CLEAN IMAGE AND FALL BACK TO THE ORIGINAL. The relit
     *    image is a derived artefact — we have measured this engine changing a
     *    garment beyond recognition — and a face it has repainted can be
     *    rejected by an analyser that accepted the photograph the user actually
     *    took. Trying the original second turns that from a lost portrait into
     *    a slightly less clean number.
     */
    const candidates = normFileId ? [normFileId, rawFileId] : [rawFileId];
    const onEither = async <T,>(step: string, run: (id: string) => Promise<T>) => {
      for (const [i, id] of candidates.entries()) {
        const out = await optional(`${step}${i > 0 ? ' (retry on the original)' : ''}`, () =>
          run(id),
        );
        if (out !== null) return out;
      }
      return null;
    };

    const [phototype, skin] = await Promise.all([
      onEither('fitzpatrick', (id) => youcam.fitzpatrick(id)),
      onEither('skin-analysis', (id) => youcam.skinAnalysis(id, ['redness'])),
    ]);

    /**
     * ⚠️ Individual fields can come back missing — `hair_color` did, on a photo
     * where `hair_color_name` was present. So each one falls back to the
     * as-taken reading rather than to a made-up value.
     */
    const c = normalised?.color ?? raw.color;
    const rawC = raw.color;
    const pick = (a: string | undefined, b: string | undefined) => a || b || null;
    /**
     * The same fallback for NAMES as for colours: the light-normalised reading
     * first, the photo as taken second. A name missing from one reading is not
     * a reason to drop it when the other has it.
     */
    const knownName = (allowed: readonly string[], a: string | undefined, b: string | undefined) =>
      [a, b].find((n): n is string => !!n && allowed.includes(n)) ?? null;

    const skinHex = pick(c.skin_color, rawC.skin_color);
    if (!skinHex) {
      return NextResponse.json(
        {
          error:
            'I could not read a skin colour from that photo. Try again with your face closer to the camera and better light.',
        },
        { status: 422 },
      );
    }

    const portrait: ColorPortrait = {
      // ⚠️ null = we could not measure it, and the screen says so. Defaulting
      //    to a phototype would invent the one number redness depends on.
      fitzpatrick: (phototype?.fitzpatrick ?? null) as FitzpatrickType | null,
      skinHex,
      eyeHex: pick(c.eye_color, rawC.eye_color) ?? skinHex,
      eyeName: (knownName(EYE_NAMES, c.eye_color_name, rawC.eye_color_name) ?? 'Other') as EyeColorName,
      eyebrowHex: pick(c.eyebrow_color, rawC.eyebrow_color) ?? skinHex,
      lipHex: pick(c.lip_color, rawC.lip_color) ?? skinHex,
      /**
       * ⚠️ A CATEGORY SWATCH, AND NULL WHEN ABSENT. The engine's schema allows
       *    seven preset hex values for hair, so this is the colour of a hair
       *    category, not a measurement — and inventing black for a missing one
       *    would put a false colour into every hair verdict.
       */
      hairHex: pick(c.hair_color, rawC.hair_color),
      // Null rather than a guessed category when neither reading names one we know.
      hairName: knownName(HAIR_NAMES, c.hair_color_name, rawC.hair_color_name) as HairColorName | null,
      // ⚠️ null when the engine returned no redness entry. NOT 0 — on an
      // inverted scale 0 is the most alarming value there is.
      rednessRaw: skin?.redness?.raw_score ?? null,
      confidence,
      measuredAt: new Date().toISOString(),
    };

    return NextResponse.json({ portrait, hints: framingHints(quality) });
  } catch (e) {
    note('skin-tone (as taken)', e);
    if (e instanceof YouCamError) {
      return NextResponse.json(
        {
          error: e.userFacing.message,
          action: e.userFacing.action,
          // Written for whoever is debugging, never rendered to the user. Its
          // absence is what made a production 422 unexplainable.
          detail: `${e.code}${e.detail ? `: ${e.detail}` : ''}`,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: 'Something went wrong while measuring. Please try again.' },
      { status: 500 },
    );
  }
}

/**
 * ⚠️ THE 405 IN THE BUG REPORT WAS NOT A BUG. Its headers say
 *    `sec-fetch-mode: navigate` and `accept: text/html` — somebody opened this
 *    URL in a browser tab to inspect the failing request. A POST-only route
 *    answering 405 to a GET is correct; it was just mute about it.
 */
export function GET() {
  return NextResponse.json(
    {
      error: 'This endpoint measures a face and only accepts POST.',
      hint: 'Use the app at /portrait — it posts your photo here as multipart form data.',
    },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
