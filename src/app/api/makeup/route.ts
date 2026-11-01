/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F16 · DID THE CORRECTOR ACTUALLY WORK?
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  F15 computes a colour corrector from the measured face and asks the user to
 *  take it on trust. This closes the loop: apply it, and measure whether the
 *  redness moved. Three things this user cannot do by eye — see their own
 *  redness, judge a corrector colour, tell afterwards whether it helped — all
 *  become measurements.
 *
 *  The render is `makeup-vto` over REST (1 unit): its `concealer` category
 *  accepts an arbitrary hex colour, which is exactly what F15 computes.
 *
 *  ⚠️ ONE TRANSPORT FOR THE WHOLE COMPARISON. The redness before and after is
 *     read with the REST skin analyser, and REST and MCP have returned visibly
 *     different numbers for the same image. Mixing them would make "it got
 *     better" partly a difference between two code paths.
 *
 *  ── TWO MODES, AND ONLY ONE OF THEM ANSWERS THE QUESTION ────────────────
 *
 *  `preview` renders the corrector onto the user's face and measures the
 *  redness of the RENDER. That measures what the engine did, not what a product
 *  will do, and the screen says so above the image.
 *
 *  `measure` reads the redness of a photo and nothing else. It is what the user
 *  runs after physically putting the corrector on, and it is the only half of
 *  this that answers "did it work?" — one upload and one task, so re-checking
 *  is cheap.
 */
import { NextResponse } from 'next/server';
import { uploadImage, toEngineJpeg, tightenFraming, MAKEUP_LONG_EDGE } from '@/core/youcam/upload';
import { youcam } from '@/core/youcam/client';
import { YouCamError } from '@/core/youcam/errors';
import { withBudget, ROUTE_BUDGET_MS } from '@/core/youcam/budget';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * ⚠️ DELIBERATELY LOW, AND VERIFIED BY LOOKING. At intensity 60 the engine
 *    paints visible green streaks across the cheeks and jaw: the `concealer`
 *    channel DEPOSITS the colour rather than neutralising underneath it, which
 *    is not what a colour corrector does in real life. A corrector is applied
 *    thinly and covered, so the digital equivalent has to be a wash. The schema
 *    itself says the shade "should typically match or slightly brighten the
 *    skin tone" — we are using it off-label on purpose, and gently.
 */
const CORRECTOR = { intensity: 25, underEye: 18, coverage: 30 };

/** Hex, and only hex. This value comes from a measurement and goes to an API. */
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Log an engine failure so an unmapped code can never go unnoticed. */
function note(step: string, e: unknown) {
  if (e instanceof YouCamError) {
    console.error(
      `[api/makeup] ${step} failed · code=${e.code}` +
        `${e.unmapped ? ' (UNMAPPED — add it to core/youcam/errors.ts)' : ''}` +
        `${e.taskId ? ` task=${e.taskId}` : ''}` +
        `${e.detail ? ` · ${e.detail}` : ''}`,
    );
  } else {
    console.error(`[api/makeup] ${step} failed`, e);
  }
}

/** Something we would like but can live without. Never kills the request. */
async function optional<T>(step: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    note(step, e);
    return null;
  }
}

/** The redness score, or null when the engine returned no reading. */
async function readRedness(fileId: string): Promise<number | null> {
  const skin = await youcam.skinAnalysis(fileId, ['redness']);
  /**
   * ⚠️ NULL, NEVER 0. The scale is inverted — higher is calmer — so defaulting
   *    a missing reading to zero would report the worst possible skin.
   */
  return skin.redness?.raw_score ?? null;
}

/**
 * Redness, with one retry on a tighter crop.
 *
 * ⚠️ THE SKIN ANALYSER WANTS THE FACE OVER 60% OF THE IMAGE WIDTH, which is
 *    stricter than anything the colour portrait asks for. A selfie that
 *    measured perfectly one screen earlier can be refused here, and to the user
 *    that reads as the app breaking at random on a photo it had just accepted.
 *
 *    So when — and only when — the engine names that reason, we crop in and ask
 *    again. Cropping cannot move a colour, so the retry either produces the
 *    same measurement from a better frame or produces nothing.
 *
 * ⚠️ IF THE RETRY FAILS, THE ORIGINAL ERROR IS WHAT PROPAGATES. The second
 *    attempt was our idea; reporting its complaint would send the user chasing
 *    a problem with a photo they never took.
 */
async function measureRedness(jpeg: Buffer, fileId: string): Promise<number | null> {
  try {
    return await readRedness(fileId);
  } catch (e) {
    if (!(e instanceof YouCamError) || e.code !== 'error_src_face_too_small') throw e;
    note('redness · face too small, retrying on a tighter crop', e);
    try {
      const tighter = await uploadImage(await tightenFraming(jpeg), 'face-tight.jpg');
      return await readRedness(tighter);
    } catch (retry) {
      note('redness · tighter crop', retry);
      throw e;
    }
  }
}

export async function POST(req: Request) {
  return withBudget(ROUTE_BUDGET_MS, () => handle(req));
}

async function handle(req: Request) {
  // Hoisted so the failure log can say which half of the feature broke.
  let mode = 'preview';
  try {
    /**
     * ⚠️ PARSED SEPARATELY, BECAUSE A MALFORMED REQUEST IS NOT THE ENGINE'S
     *    FAULT. A body that never contained a form must be told so, not sent
     *    into the catch below, which talks about the engine.
     */
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'That request did not carry a photo in the form we expect.' },
        { status: 400 },
      );
    }
    const photo = form.get('photo');
    mode = String(form.get('mode') ?? 'preview');
    if (!(photo instanceof File)) {
      return NextResponse.json({ error: 'No photo was uploaded.' }, { status: 400 });
    }
    const original = Buffer.from(await photo.arrayBuffer());

    /**
     * ── The real check: just read the redness of this face ────────────────
     *
     * This one CANNOT degrade — the number is the entire answer, so a failure
     * has to reach the user. What it can do is arrive with the engine's actual
     * reason attached instead of a shrug.
     */
    if (mode === 'measure') {
      const jpeg = await toEngineJpeg(original);
      const fileId = await uploadImage(jpeg, 'face.jpg');
      return NextResponse.json({ mode, redness: await measureRedness(jpeg, fileId) });
    }

    const corrector = String(form.get('corrector') ?? '');
    if (!HEX.test(corrector)) {
      return NextResponse.json(
        { error: 'That corrector colour is not a valid hex code.' },
        { status: 400 },
      );
    }

    /**
     * ⚠️ ONE IMAGE, SIZED FOR THE STRICTEST ENDPOINT IN THE COMPARISON.
     *    `makeup-vto` caps the long side under 1920 px and the height under
     *    1080 px. The baseline redness is read from the very same file the
     *    render starts from, so before and after differ by the makeup and by
     *    nothing else — not by resolution.
     */
    const jpeg = await toEngineJpeg(original, MAKEUP_LONG_EDGE);
    const srcFileId = await uploadImage(jpeg, 'face.jpg');

    /**
     * The baseline and the render both need only the upload, so they run
     * together — one serial leg saved out of a budget of 60 seconds.
     *
     * ⚠️ THE BASELINE IS OPTIONAL AND THE RENDER IS NOT. If the skin analyser
     *    refuses the framing, the user still gets the picture, which needs no
     *    face measurement at all. A missing baseline costs the before/after
     *    comparison, never the image.
     */
    const [before, image] = await Promise.all([
      optional('redness (before)', () => measureRedness(jpeg, srcFileId)),
      youcam.makeupVto({
        srcFileId,
        effects: [
          {
            category: 'concealer',
            palettes: [
              {
                color: corrector,
                colorIntensity: CORRECTOR.intensity,
                colorUnderEyeIntensity: CORRECTOR.underEye,
                coverageLevel: CORRECTOR.coverage,
              },
            ],
          },
        ],
      }),
    ]);

    // Converted once and reused: the second reading and the picture the user
    // sees are provably the same pixels, and it saves an encode.
    const renderedJpeg = await toEngineJpeg(image, MAKEUP_LONG_EDGE);
    const after = await optional('redness (after)', async () =>
      measureRedness(renderedJpeg, await uploadImage(renderedJpeg, 'after.jpg')),
    );

    return NextResponse.json({
      mode,
      /** Base64 so the numbers and the picture arrive as one answer. */
      preview: `data:image/jpeg;base64,${renderedJpeg.toString('base64')}`,
      redness: { before, after },
      corrector,
      applied: CORRECTOR,
    });
  } catch (e) {
    note(mode === 'measure' ? 'redness' : 'preview', e);
    if (e instanceof YouCamError) {
      return NextResponse.json(
        {
          error: e.userFacing.message,
          action: e.userFacing.action,
          // For whoever debugs this, never rendered.
          detail: `${e.code}${e.detail ? `: ${e.detail}` : ''}`,
        },
        { status: 422 },
      );
    }
    return NextResponse.json(
      { error: 'The makeup preview did not come back. Please try again.' },
      { status: 500 },
    );
  }
}
