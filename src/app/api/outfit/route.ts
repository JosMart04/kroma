/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F19 · THE OUTFIT ON THE BODY — one render feeding the next
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  `cloth-v4` puts ONE garment on a person. An outfit is several. So the person
 *  photo goes in, comes back wearing the top, and that result goes back in as
 *  the person for the trousers.
 *
 *  ⚠️ EVERYTHING THE TRY-ON ROUTE SAYS ABOUT RENDERS APPLIES HERE TWICE OVER.
 *     What comes back is generated, not measured: the engine decided how the
 *     fabric falls, and by the second pass it is redrawing its own output. No
 *     verdict may be computed from these pixels. The verdicts beside the
 *     picture come from the colours measured at ingestion, and the screen has
 *     to say where the image came from.
 *
 *  ⚠️ TWO PIECES, NOT MORE, AND THE CEILING IS THE REASON. Vercel's free plan
 *     caps a request at 60s; a `cloth-v4` render is ~25s and each pass needs an
 *     upload first. Three passes do not fit, and a timeout after spending two
 *     units is the worst outcome available. Two is what fits honestly, and two
 *     is the core of an outfit anyway.
 *
 *  ⚠️ EACH PASS SPENDS A UNIT. The caller is told before it starts, because a
 *     surprise on someone else's account is not ours to spend.
 */
import { NextResponse } from 'next/server';
import { uploadImage, toEngineJpeg } from '@/core/youcam/upload';
import { youcam } from '@/core/youcam/client';
import { downloadResult } from '@/core/youcam/poll';
import { YouCamError } from '@/core/youcam/errors';
import { withBudget, ROUTE_BUDGET_MS } from '@/core/youcam/budget';
import {
  toEngineCategory,
  piecesForOutfitRender,
  type EngineGarmentCategory,
} from '@/core/youcam/tryOnCategory';
import { callTool, McpUnavailable, TOOLS } from '@/core/mcp/client';
import type { GarmentCategory } from '@/core/contracts/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface Pass {
  category: GarmentCategory;
  engineCategory: EngineGarmentCategory;
  transport: 'mcp' | 'rest';
  ms: number;
  fellBackBecause?: string;
}

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

/** One garment onto one body, over MCP with REST underneath. */
async function renderOne(
  srcFileId: string,
  refFileId: string,
  engineCategory: EngineGarmentCategory,
): Promise<{ image: Buffer; transport: 'mcp' | 'rest'; fellBackBecause?: string }> {
  try {
    const raw = await callTool({
      server: TOOLS.clothTryOn.server,
      tool: TOOLS.clothTryOn.tool,
      args: {
        request: {
          src_file_id: srcFileId,
          ref_file_id: refFileId,
          garment_category: engineCategory,
          // Same as REST: never dress a second person who happens to be in frame.
          filter_multi_person: 'normal',
        },
      },
    });
    const url = resultUrl(raw);
    if (!url) throw new McpUnavailable('fashion', 'the tool answered without a result URL');
    return { image: await downloadResult(url), transport: 'mcp' };
  } catch (e) {
    if (!(e instanceof McpUnavailable)) throw e;
    const image = await youcam.clothTryOn({ srcFileId, refFileId, garmentCategory: engineCategory });
    return { image, transport: 'rest', fellBackBecause: e.message };
  }
}

export async function POST(req: Request) {
  return withBudget(ROUTE_BUDGET_MS, () => handle(req));
}

async function handle(req: Request) {
  const passes: Pass[] = [];
  try {
    const form = await req.formData();
    const person = form.get('person');
    if (!(person instanceof File)) {
      return NextResponse.json({ error: 'I need a photo of you to dress.' }, { status: 400 });
    }

    const garments = form.getAll('garment').filter((g): g is File => g instanceof File);
    const categories = form.getAll('category').map((c) => String(c) as GarmentCategory);

    if (garments.length === 0 || garments.length !== categories.length) {
      return NextResponse.json(
        { error: 'Each garment needs its category, and I received a different number of each.' },
        { status: 400 },
      );
    }

    /**
     * ⚠️ REFUSE BEFORE SPENDING, NOT AFTER. Anything the engine cannot render
     *    is dropped here, while it is still free — a belt sent as `auto` would
     *    burn a unit to return a person wearing a belt-shaped nothing.
     *
     * The filtering AND the layering order come from one shared function, so
     * the screen cannot promise a different set of pieces from the one that
     * actually goes on the body. It already did once.
     */
    const renderable = piecesForOutfitRender(
      garments.map((file, i) => ({ file, category: categories[i] })),
    ).map((x) => ({
      ...x,
      // Narrowed by the filter inside `piecesForOutfitRender`.
      engine: toEngineCategory(x.category) as EngineGarmentCategory,
    }));

    if (renderable.length === 0) {
      return NextResponse.json(
        {
          error: 'None of these pieces can be rendered on a body.',
          action:
            'They stay in your wardrobe and in every verdict — there is just no picture of them being worn.',
        },
        { status: 422 },
      );
    }

    // The person is uploaded once; from the second pass on, the source is the
    // previous render, so it has to be uploaded again as the new body.
    let bodyJpeg = await toEngineJpeg(Buffer.from(await person.arrayBuffer()));
    let bodyFileId = await uploadImage(bodyJpeg, 'person.jpg');

    for (const piece of renderable) {
      const t0 = Date.now();
      const garmentJpeg = await toEngineJpeg(Buffer.from(await piece.file.arrayBuffer()));
      const refFileId = await uploadImage(garmentJpeg, 'garment.jpg');

      const out = await renderOne(bodyFileId, refFileId, piece.engine);

      // The output of this pass is the body of the next one.
      bodyJpeg = await toEngineJpeg(out.image);
      if (piece !== renderable[renderable.length - 1]) {
        bodyFileId = await uploadImage(bodyJpeg, 'person.jpg');
      }

      passes.push({
        category: piece.category,
        engineCategory: piece.engine,
        transport: out.transport,
        ms: Date.now() - t0,
        fellBackBecause: out.fellBackBecause,
      });
    }

    return new NextResponse(new Uint8Array(bodyJpeg), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
        // The trace travels with the picture: how many passes, and down which
        // road each one went. A fallback nobody can see is a claim nobody can
        // check.
        'X-Kroma-Passes': encodeURIComponent(JSON.stringify(passes)),
      },
    });
  } catch (e) {
    if (e instanceof YouCamError) {
      return NextResponse.json(
        { error: e.userFacing.message, action: e.userFacing.action, passes },
        { status: 422 },
      );
    }
    console.error('[api/outfit]', e);
    return NextResponse.json(
      {
        error: 'The outfit render did not come back.',
        // Passes already paid for are worth naming: it is the difference
        // between "nothing happened" and "the first piece worked".
        action:
          passes.length > 0
            ? `The first ${passes.length === 1 ? 'piece' : `${passes.length} pieces`} rendered before it failed.`
            : undefined,
        passes,
      },
      { status: 500 },
    );
  }
}
