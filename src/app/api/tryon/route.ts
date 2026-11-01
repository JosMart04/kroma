/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F13 · TRY-ON — the garment rendered onto the user's own photo
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ WHAT COMES BACK IS A RENDERING, NOT A MEASUREMENT, and the difference is
 *     the whole ethic of this product. Every other colour in the app was read
 *     off the user's pixels and can be audited. This image was generated: the
 *     engine decided how the fabric falls and how the light hits it. It is
 *     useful — it answers "what does this look like on a body" — but no verdict
 *     may be computed from its pixels, and the screen has to say where it came
 *     from. The verdict shown alongside is computed from the garment colour we
 *     MEASURED earlier, not from this picture.
 *
 *  ⚠️ TWO UPLOADS, AND THE ORDER OF THE IDS MATTERS. `src_file_id` is the
 *     person and `ref_file_id` is the garment. Swapping them does not error —
 *     it returns a plausible, wrong image, which is the worst failure mode
 *     available.
 *
 *  ⚠️ THE RESULT URL LIVES TWO HOURS. `clothTryOn` already downloads the binary
 *     before returning, so nothing here stores a link. Do not "optimise" that
 *     by passing the URL to the browser.
 *
 *  ⚠️ TWO ENGINES BEHIND ONE ROUTE (F13 + F14). Clothes go to `cloth-v4`. A
 *     scarf or a hat goes to `/task/scarf` or `/task/hat`, which `cloth-v4`
 *     cannot render at all and which additionally demand `gender` — a field
 *     absent from every generic example in the documentation. The mapping from
 *     our wardrobe's vocabulary to the engine's lives once, in
 *     `core/youcam/tryOnCategory.ts`, including that the outerwear value is
 *     spelled `outer` and that `outerwear` is a 400.
 */
import { NextResponse } from 'next/server';
import { uploadImage, toEngineJpeg } from '@/core/youcam/upload';
import { youcam } from '@/core/youcam/client';
import { downloadResult } from '@/core/youcam/poll';
import { YouCamError } from '@/core/youcam/errors';
import { toEngineCategory, toAccessoryKind, type EngineGarmentCategory } from '@/core/youcam/tryOnCategory';
import { callTool, McpUnavailable, TOOLS } from '@/core/mcp/client';
import type { GarmentCategory } from '@/core/contracts/types';

export const runtime = 'nodejs';
/**
 * ⚠️ 60 IS THE CEILING ON VERCEL'S FREE PLAN. The try-on is the slowest call in
 * the product — two uploads and a render — so this one genuinely needs it.
 */
export const maxDuration = 60;

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

/**
 * 🔑 THE `fashion` SERVER, EXERCISED WHERE THE PRODUCT ACTUALLY USES IT.
 *
 * Until now `TOOLS.clothTryOn` was declared in the MCP client and called from
 * nowhere, while the screen at `/mcp` told visitors the pipeline "crosses all
 * three servers". It crossed one. This is where that becomes true — not in a
 * demo route, but on the path a real garment takes onto a real body.
 *
 * ⚠️ AND IT IS SAFE HERE FOR A REASON THAT DOES NOT GENERALISE. The measured
 *    disagreement between transports (iris ΔE 6.4) is why REST owns everything
 *    feeding a verdict. Nothing here feeds a verdict: this route returns a
 *    RENDER, and the header above already says no verdict may be computed from
 *    its pixels. The verdict beside the picture comes from the colour we
 *    measured at ingestion. So the transport cannot contaminate anything.
 *
 * Returns the image plus which road it came down, so the caller can say so.
 */
async function renderCloth(
  srcFileId: string,
  refFileId: string,
  garmentCategory: EngineGarmentCategory,
): Promise<{ image: Buffer; transport: 'mcp' | 'rest'; fellBackBecause?: string }> {
  try {
    const raw = await callTool({
      server: TOOLS.clothTryOn.server,
      tool: TOOLS.clothTryOn.tool,
      args: {
        request: {
          src_file_id: srcFileId,
          ref_file_id: refFileId,
          garment_category: garmentCategory,
        },
      },
    });
    const url = resultUrl(raw);
    // A success with no image is not a success. Falling back beats returning
    // nothing, and the caller is told which happened.
    if (!url) throw new McpUnavailable('fashion', 'the tool answered without a result URL');
    return { image: await downloadResult(url), transport: 'mcp' };
  } catch (e) {
    if (!(e instanceof McpUnavailable)) throw e;
    const image = await youcam.clothTryOn({ srcFileId, refFileId, garmentCategory });
    return { image, transport: 'rest', fellBackBecause: e.message };
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const person = form.get('person');
    const garment = form.get('garment');
    const category = String(form.get('category') ?? 'top') as GarmentCategory;

    if (!(person instanceof File) || !(garment instanceof File)) {
      return NextResponse.json(
        { error: 'I need both a photo of you and the photo of the garment.' },
        { status: 400 },
      );
    }

    const engineCategory = toEngineCategory(category);
    const accessory = toAccessoryKind(category);
    if (!engineCategory && !accessory) {
      return NextResponse.json(
        {
          error: 'This kind of item cannot be rendered on a body.',
          action:
            'It stays in your wardrobe and in every verdict — there is just no picture of it being worn.',
        },
        { status: 422 },
      );
    }

    /**
     * ⚠️ F14 · `gender` IS REQUIRED BY /task/scarf AND /task/hat, and it appears
     *    in none of the generic examples. We refuse rather than guess: inferring
     *    it from the person's photograph to satisfy an API field is not a
     *    shortcut this product takes, and a wrong guess is one more thing our
     *    user could not catch.
     */
    const gender = form.get('gender');
    if (accessory && gender !== 'male' && gender !== 'female') {
      return NextResponse.json(
        {
          error: 'The scarf and hat engines need to be told which fit to render.',
          action: 'Pick one on the previous screen — we do not guess it and we do not keep it.',
        },
        { status: 400 },
      );
    }

    const [personJpeg, garmentJpeg] = await Promise.all([
      toEngineJpeg(Buffer.from(await person.arrayBuffer())),
      toEngineJpeg(Buffer.from(await garment.arrayBuffer())),
    ]);

    // Independent uploads, so they go together. Each is a round trip plus a PUT
    // to S3, and doing them in sequence doubles the slowest part of the wait.
    const [srcFileId, refFileId] = await Promise.all([
      uploadImage(personJpeg, 'person.jpg'),
      uploadImage(garmentJpeg, 'garment.jpg'),
    ]);

    const run =
      accessory && (gender === 'male' || gender === 'female')
        ? {
            // The scarf and hat engines have no MCP equivalent we have verified,
            // so this road stays REST and says so rather than implying otherwise.
            image: await youcam.accessoryTryOn({ kind: accessory, srcFileId, refFileId, gender }),
            transport: 'rest' as const,
            fellBackBecause: undefined,
          }
        : // Narrowed by the guard above: with no accessory there is a category,
          // or we returned 422 before uploading anything.
          await renderCloth(srcFileId, refFileId, engineCategory ?? 'auto');

    return new NextResponse(new Uint8Array(run.image), {
      headers: {
        'Content-Type': 'image/jpeg',
        // The render is deterministic for these inputs but the inputs are a
        // one-off upload, so there is nothing to cache and something to leak.
        'Cache-Control': 'no-store',
        // The transport travels with the picture so the screen can report it.
        // A fallback nobody can see is a claim nobody can check.
        'X-Kroma-Transport': run.transport,
        ...(run.fellBackBecause ? { 'X-Kroma-Fell-Back': encodeURIComponent(run.fellBackBecause) } : {}),
      },
    });
  } catch (e) {
    if (e instanceof YouCamError) {
      return NextResponse.json(
        { error: e.userFacing.message, action: e.userFacing.action },
        { status: 422 },
      );
    }
    console.error('[api/tryon]', e);
    return NextResponse.json(
      { error: 'The try-on did not come back. Please try again.' },
      { status: 500 },
    );
  }
}
