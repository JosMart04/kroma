/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F17 · THE SAME MEASUREMENT, RUN OVER MCP, WITH REST UNDERNEATH
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  One upload, then the face is measured through the Model Context Protocol
 *  against YouCam's `beauty` server, and every step that fails falls back to the
 *  REST call that already powers the product. The response carries a TRACE: for
 *  each step, which server answered, which tool, over which transport, and how
 *  long it took.
 *
 *  ── WHY A TRACE AND NOT JUST AN ANSWER ──────────────────────────────────
 *
 *  A fallback that is invisible is a lie waiting to happen. If MCP quietly
 *  degrades to REST, the demo claims an integration it is not exercising, and
 *  nobody — least of all our user — can tell. So the transport is part of the
 *  output, and the screen shows it.
 *
 *  ── WHY THIS DOES NOT OVERWRITE THE SAVED PORTRAIT ──────────────────────
 *
 *  ⚠️ MEASURED, THE TWO PATHS DISAGREE. The same image and the same `file_id`
 *     gave skin within ΔE 1.0 — irrelevant — but an iris ΔE 6.4 apart, which is
 *     plainly visible. Whatever the cause, a user routed one way would be told a
 *     different eye colour than a user routed the other, and THEY COULD NOT
 *     DETECT THE INCONSISTENCY. So REST owns everything that feeds a verdict,
 *     and this route reports rather than persists.
 *
 *     A plausible cause surfaced while writing this: the MCP schema exposes
 *     `face_angle_strictness_level`, absent from the REST examples, and its
 *     schema default (`null`) contradicts its own description ("Default is
 *     'high'"). Pinning it might reconcile the two. UNTESTED — recorded as a
 *     hypothesis, not a finding, and it changes nothing until someone measures
 *     it.
 *
 *  ⚠️ NO LANGUAGE MODEL PLANS THIS. The order is fixed because it is known: you
 *     cannot analyse a face you have not uploaded. A model choosing the sequence
 *     would add a failure mode and no capability. See `docs/04-LLM-POLICY.md`.
 */
import { NextResponse } from 'next/server';
import { uploadImage, toEngineJpeg } from '@/core/youcam/upload';
import { youcam, DEFAULT_STRICTNESS } from '@/core/youcam/client';
import { YouCamError } from '@/core/youcam/errors';
import { withBudget, ROUTE_BUDGET_MS } from '@/core/youcam/budget';
import {
  callDiscoveredTool,
  callTool,
  McpUnavailable,
  MCP_SERVERS,
  ToolNotOffered,
  TOOLS,
  type McpServer,
} from '@/core/mcp/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Transport = 'mcp' | 'rest';

interface Step {
  label: string;
  server: McpServer | 'file-api';
  tool: string;
  transport: Transport;
  ms: number;
  ok: boolean;
  /** Present only when MCP failed and REST answered instead. */
  fellBackBecause?: string;
  /** Present when the tool name was discovered rather than hardcoded. */
  discovered?: boolean;
}

/** Pull the JSON payload out of an MCP tool result's content blocks. */
function parseToolResult(result: unknown): unknown {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A tool that answers in prose rather than JSON is not an error, but it is
    // not something we can read either. Say so instead of guessing.
    return { unparsed: text.slice(0, 400) };
  }
}

/**
 * Run one step over MCP, and fall back to REST when it does not answer.
 *
 * ⚠️ ONLY `McpUnavailable` TRIGGERS THE FALLBACK. A transport that is down is a
 *    reason to take the other road; a tool that genuinely rejected our input
 *    would reject it over REST too, and retrying would just spend another unit
 *    to receive the same refusal.
 */
async function withFallback<T>(
  label: string,
  spec: { server: McpServer; tool: string },
  args: Record<string, unknown>,
  restCall: () => Promise<T>,
  steps: Step[],
): Promise<{ value: T | unknown; transport: Transport }> {
  const t0 = Date.now();
  try {
    const raw = await callTool({ server: spec.server, tool: spec.tool, args });
    steps.push({
      label,
      server: spec.server,
      tool: spec.tool,
      transport: 'mcp',
      ms: Date.now() - t0,
      ok: true,
    });
    return { value: parseToolResult(raw), transport: 'mcp' };
  } catch (e) {
    if (!(e instanceof McpUnavailable)) throw e;
    const t1 = Date.now();
    const value = await restCall();
    steps.push({
      label,
      server: spec.server,
      tool: spec.tool,
      transport: 'rest',
      ms: Date.now() - t1,
      ok: true,
      fellBackBecause: e.message,
    });
    return { value, transport: 'rest' };
  }
}

/**
 * Same as `withFallback`, but the tool name is asked for rather than assumed.
 *
 * ⚠️ `ToolNotOffered` DOES NOT FALL BACK, and that asymmetry is the point. A
 *    server that is down is a reason to take the other road. A server that is up
 *    and simply does not have the tool we imagined is a claim of ours that was
 *    wrong — and silently answering it over REST would hide exactly that.
 */
async function withDiscoveredFallback<T>(
  label: string,
  server: McpServer,
  pattern: RegExp,
  args: Record<string, unknown>,
  restCall: () => Promise<T>,
  steps: Step[],
): Promise<{ value: T | unknown; transport: Transport }> {
  const t0 = Date.now();
  try {
    const { tool, result } = await callDiscoveredTool(server, pattern, args);
    steps.push({
      label,
      server,
      tool,
      transport: 'mcp',
      ms: Date.now() - t0,
      ok: true,
      discovered: true,
    });
    return { value: parseToolResult(result), transport: 'mcp' };
  } catch (e) {
    if (!(e instanceof McpUnavailable) && !(e instanceof ToolNotOffered)) throw e;
    const t1 = Date.now();
    const value = await restCall();
    steps.push({
      label,
      server,
      tool: e instanceof ToolNotOffered ? '(no matching tool)' : `(discovery on ${server})`,
      transport: 'rest',
      ms: Date.now() - t1,
      ok: true,
      fellBackBecause: e.message,
    });
    return { value, transport: 'rest' };
  }
}

export async function POST(req: Request) {
  return withBudget(ROUTE_BUDGET_MS, () => handle(req));
}

async function handle(req: Request) {
  const steps: Step[] = [];
  try {
    const form = await req.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No photo was uploaded.' }, { status: 400 });
    }

    // The upload is shared. MCP accepts a `src_file_id` from the REST File API,
    // so there is exactly one image pipeline rather than two that could drift.
    const t0 = Date.now();
    const jpeg = await toEngineJpeg(Buffer.from(await file.arrayBuffer()));
    const fileId = await uploadImage(jpeg, 'selfie.jpg');
    steps.push({
      label: 'Upload the photo',
      server: 'file-api',
      tool: 'POST /s2s/v2.0/file + PUT',
      transport: 'rest',
      ms: Date.now() - t0,
      ok: true,
    });

    /**
     * ⚠️ THE LIGHT COMES FIRST BECAUSE THE MEASUREMENT DEPENDS ON IT. This is
     *    the same normalisation the confidence layer runs in F4: without it a
     *    measured colour lies about itself, and our user cannot tell.
     *
     *    The tool name is DISCOVERED, not hardcoded. `docs/submission/mcp.md`
     *    verified names on `beauty` and `fashion` against a live `tools/list`
     *    and verified none on `creators` — so asking is the only honest way to
     *    reach this server.
     */
    const light = await withDiscoveredFallback(
      'Normalise the light',
      'creators',
      /light/i,
      { request: { src_file_id: fileId } },
      () => youcam.normalizeLighting(fileId).then((b) => ({ normalisedBytes: b.byteLength })),
      steps,
    );

    const colours = await withFallback(
      'Measure the face',
      TOOLS.facialColour,
      /**
       * ⚠️ THE STRICTNESS IS PINNED ON BOTH TRANSPORTS. The MCP schema declares
       *    its default as `null` while REST documents `high`; sending the same
       *    explicit level removes one possible source of the two transports
       *    disagreeing about the same face.
       */
      { request: { src_file_id: fileId, face_angle_strictness_level: DEFAULT_STRICTNESS } },
      () => youcam.skinTone(fileId),
      steps,
    );

    const phototype = await withFallback(
      'Classify the phototype',
      TOOLS.fitzpatrick,
      { request: { version: '1.0', src_file_id: fileId } },
      () => youcam.fitzpatrick(fileId),
      steps,
    );

    return NextResponse.json({
      servers: MCP_SERVERS,
      steps,
      /** How much of the run genuinely went over MCP. */
      overMcp: steps.filter((s) => s.transport === 'mcp').length,
      /**
       * 🔑 THE SCREEN MUST NOT CLAIM A SERVER THIS LIST DOES NOT CONTAIN.
       *    Derived from what happened, never from what we hoped would happen —
       *    the whole reason this route reports a trace at all.
       */
      serversOverMcp: [
        ...new Set(
          steps.filter((s) => s.transport === 'mcp' && s.server !== 'file-api').map((s) => s.server),
        ),
      ],
      results: { light: light.value, colours: colours.value, phototype: phototype.value },
    });
  } catch (e) {
    console.error('[api/mcp]', e);
    /**
     * ⚠️ THE TRACE COMES BACK EVEN WHEN THE RUN DIES, and the failed steps are
     * in it. A run that collapses on the second call still tells you the first
     * one worked, which is the difference between "MCP is broken" and "the
     * account is out of credits".
     */
    /**
     * ⚠️ THE TALLIES TRAVEL WITH THE FAILURE TOO, and leaving them out was a
     *    quiet lie in the other direction. Measured against the live servers:
     *    a faceless photo reaches `creators` over MCP, gets its light
     *    normalised, and only then dies on the face measurement. Without these
     *    fields the screen fell back to "not reached" for a server that had
     *    just answered in 4.7 seconds. Under-claiming is safer than
     *    over-claiming and still wrong.
     */
    const tallies = {
      overMcp: steps.filter((s) => s.transport === 'mcp').length,
      serversOverMcp: [
        ...new Set(
          steps.filter((s) => s.transport === 'mcp' && s.server !== 'file-api').map((s) => s.server),
        ),
      ],
    };

    if (e instanceof YouCamError) {
      return NextResponse.json(
        { error: e.userFacing.message, action: e.userFacing.action, steps, ...tallies },
        { status: 422 },
      );
    }
    return NextResponse.json(
      {
        error: 'The orchestrated run did not finish.',
        detail: e instanceof Error ? e.message : String(e),
        steps,
        ...tallies,
      },
      { status: 500 },
    );
  }
}
