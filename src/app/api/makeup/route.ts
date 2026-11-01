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
 *  ⚠️ THIS FEATURE WAS DECLARED IMPOSSIBLE AND CUT. `/task/makeup` returns 404
 *     over REST and "makeup" is in none of the 20 SKUs of
 *     `/credit/feature-cost`, so the README and the limitations both said the
 *     API could not do it. That was wrong. The tool is on the MCP `beauty`
 *     server, it takes a `src_file_id` from the same File API, and its
 *     `concealer` category accepts an arbitrary hex colour.
 *
 *  ⚠️ MCP-ONLY, SO THERE IS NO FALLBACK TO WRITE. Everywhere else in this app a
 *     failed MCP call drops to REST; here REST has nothing to drop to. When it
 *     fails the route says so rather than pretending.
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
import { uploadImage, toEngineJpeg, tightenFraming } from '@/core/youcam/upload';
import { youcam } from '@/core/youcam/client';
import { downloadResult } from '@/core/youcam/poll';
import { YouCamError } from '@/core/youcam/errors';
import { callTool, TOOLS } from '@/core/mcp/client';

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

/** Log an engine failure so an unmapped code can never go unnoticed again. */
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
   *    a missing reading to zero would report the worst possible skin. That
   *    exact bug shipped once already.
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

/** Pull the result URL out of an MCP tool payload, defensively. */
function resultUrl(raw: unknown): string | null {
  const content = (raw as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  if (!text) return null;
  try {
    const payload = JSON.parse(text) as { data?: { results?: { url?: string } } };
    return payload?.data?.results?.url ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  // Hoisted so the failure log can say which half of the feature broke.
  let mode = 'preview';
  try {
    /**
     * ⚠️ PARSED SEPARATELY, BECAUSE A MALFORMED REQUEST IS NOT THE ENGINE'S
     *    FAULT. Anything thrown below lands in a catch that explains this
     *    feature runs only over MCP — true, and completely irrelevant to a body
     *    that never contained a form. Probing the route with an empty POST
     *    produced exactly that message, which would have sent the next person
     *    debugging an MCP transport that was working perfectly.
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

    const jpeg = await toEngineJpeg(Buffer.from(await photo.arrayBuffer()));
    const srcFileId = await uploadImage(jpeg, 'face.jpg');

    /**
     * ── The real check: just read the redness of this face ────────────────
     *
     * This one CANNOT degrade — the number is the entire answer, so a failure
     * has to reach the user. What it can do is arrive with the engine's actual
     * reason attached instead of a shrug.
     */
    if (mode === 'measure') {
      return NextResponse.json({ mode, redness: await measureRedness(jpeg, srcFileId) });
    }

    const corrector = String(form.get('corrector') ?? '');
    if (!HEX.test(corrector)) {
      return NextResponse.json(
        { error: 'That corrector colour is not a valid hex code.' },
        { status: 400 },
      );
    }

    /**
     * The baseline and the render both need only the upload, so they go
     * together — one serial leg saved out of a budget of 60 seconds.
     *
     * ⚠️ THE BASELINE IS OPTIONAL AND THE RENDER IS NOT, and getting that
     *    backwards is what broke this screen. A user pressed "Put the corrector
     *    on and measure", the skin analyser refused the framing of a selfie the
     *    colour portrait had just accepted, and the whole feature returned 422 —
     *    including the picture, which had rendered fine and needed no face
     *    measurement at all. A missing baseline costs the before/after
     *    comparison. It should never cost the image.
     */
    const [before, rendered] = await Promise.all([
      optional('redness (before)', () => measureRedness(jpeg, srcFileId)),
      callTool({
        server: TOOLS.makeup.server,
        tool: TOOLS.makeup.tool,
        args: {
          request: {
            src_file_id: srcFileId,
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
          },
        },
      }),
    ]);

    const url = resultUrl(rendered);
    if (!url) {
      return NextResponse.json(
        { error: 'The makeup engine answered, but not with an image we could read.' },
        { status: 502 },
      );
    }

    // ⚠️ Downloaded immediately: the result URL carries X-Amz-Expires=7200 and
    //    is dead in two hours. Never store the link.
    const image = await downloadResult(url);
    // Converted once and reused: the second reading and the picture the user
    // sees are then provably the same pixels, and it saves an encode.
    const renderedJpeg = await toEngineJpeg(image);
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
          // For whoever debugs this, never rendered. Its absence is what made
          // the reported 422 unexplainable from the outside.
          detail: `${e.code}${e.detail ? `: ${e.detail}` : ''}`,
        },
        { status: 422 },
      );
    }
    console.error('[api/makeup]', e);
    return NextResponse.json(
      {
        error: 'The makeup preview did not come back.',
        action:
          'This part of the app runs only over the Model Context Protocol, which has no REST equivalent to fall back to.',
      },
      { status: 500 },
    );
  }
}
