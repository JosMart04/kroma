/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F17 · A REAL MCP CLIENT, ACROSS ALL THREE YOUCAM SERVERS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ── WHY THIS IS THE ARCHITECTURAL ARGUMENT OF THE PROJECT ───────────────
 *
 *  A project that only does try-on talks to one server. A project that only
 *  analyses skin talks to another. This product uses all three FOR PRODUCT
 *  REASONS rather than for display:
 *
 *    · `beauty`   measures the face — the colour the user cannot see.
 *                 Exercised in `/api/mcp`.
 *    · `creators` normalises the light, because without it a measured colour
 *                 lies about itself. Exercised in `/api/mcp`.
 *    · `fashion`  renders the garment onto their body. Exercised in
 *                 `/api/tryon` — the real one, not a demonstration.
 *
 *  ⚠️ THEY ARE NOT ALL IN ONE REQUEST, AND THE COPY MUST NOT SAY THEY ARE.
 *     For two days this header claimed a pipeline that "crosses all three",
 *     while the only route calling tools called two, both on `beauty`. In a
 *     product whose whole argument is that the user cannot check us, that was
 *     the one kind of mistake we cannot make. A try-on is two more uploads and
 *     a ~25s render; bolting it onto the measurement run would blow Vercel's
 *     60s ceiling. So the servers are spread across the journeys that genuinely
 *     need them, and every screen reports which ones it actually reached.
 *
 *  ── WHAT THIS IS NOT ────────────────────────────────────────────────────
 *
 *  ⚠️ MCP DOES NOT REPLACE REST FOR ANYTHING THAT FEEDS A VERDICT, and that is
 *     a measured decision rather than caution. The same image, the same
 *     `file_id`, measured both ways:
 *
 *         skin   #b48d72 → #b79075   ΔE 1.0   below perception, irrelevant
 *         iris   #582109 → #6e310d   ΔE 6.4   plainly visible
 *
 *     We do not know the cause — possibly a different default
 *     `face_angle_strictness_level`, possibly engine non-determinism. What
 *     matters is that a user whose request happened to take one internal route
 *     would be told a different eye colour than one who took the other, and
 *     THEY COULD NOT DETECT THE INCONSISTENCY. So one path owns the
 *     measurements, and it is REST.
 *
 *  ⚠️ NO LANGUAGE MODEL DECIDES ANYTHING HERE. The plan below is a fixed
 *     sequence, because the sequence is known: you cannot render a garment onto
 *     a face you have not measured. An LLM choosing the order would add a
 *     failure mode and no capability. See `docs/04-LLM-POLICY.md`.
 *
 *  ⚠️ SERVER-ONLY. It carries the API key. Importing it from a client component
 *     would ship the key to the browser — `scripts/check-boundaries.mjs` will
 *     not catch that for you.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { IS_MOCK } from '@/core/youcam/config';

export const MCP_SERVERS = {
  beauty: 'https://mcp-api-01.makeupar.com/mcp/beauty',
  fashion: 'https://mcp-api-01.makeupar.com/mcp/fashion',
  creators: 'https://mcp-api-01.makeupar.com/mcp/creators',
} as const;

export type McpServer = keyof typeof MCP_SERVERS;

/** Verified against the live servers' `tools/list` on 31 Oct 2026: 50 · 19 · 37 tools. */
export const TOOL_COUNTS: Record<McpServer, number> = {
  beauty: 50,
  fashion: 19,
  creators: 37,
};

/**
 * Compare tool names the way a human reads them, ignoring case and separators.
 *
 * ⚠️ THE DOCS AND THE SERVERS SPELL THE SAME TOOLS DIFFERENTLY. The live
 *    servers answer `AI-Clothes-Virtual-Try-On`; the documentation lists
 *    `AI_Clothes_Virtual_Try_On`; one tool is `AI-Skin-simulation` with a
 *    lowercase word. A name that matches only one spelling breaks the day the
 *    other one ships.
 */
export function sameToolName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '');
  return norm(a) === norm(b);
}

/** Tool names per server, kept for the life of a warm function instance. */
const toolNameCache = new Map<McpServer, { names: string[]; at: number }>();
const TOOL_NAME_TTL_MS = 10 * 60_000;

/**
 * The exact name a server uses for a tool we know by another spelling, or null.
 * One `tools/list` per server per warm instance; free, it is protocol metadata.
 */
async function resolveToolName(
  client: Client,
  server: McpServer,
  wanted: string,
): Promise<string | null> {
  let cached = toolNameCache.get(server);
  if (!cached || Date.now() - cached.at > TOOL_NAME_TTL_MS) {
    const listed = await withTimeout(client.listTools(), CALL_TIMEOUT_MS, `${server}/tools/list`);
    cached = { names: (listed.tools ?? []).map((t) => t.name), at: Date.now() };
    toolNameCache.set(server, cached);
  }
  return cached.names.find((n) => n === wanted) ?? cached.names.find((n) => sameToolName(n, wanted)) ?? null;
}

/**
 * ⚠️ A HANDSHAKE PLUS A TOOL CALL IS SLOWER THAN A REST POST, and this ceiling
 *    exists so a slow server degrades into the REST fallback instead of eating
 *    the whole function budget. Vercel's free plan caps a request at 60s.
 */
const CONNECT_TIMEOUT_MS = 12_000;
const CALL_TIMEOUT_MS = 45_000;

export class McpUnavailable extends Error {
  server: McpServer;
  constructor(server: McpServer, cause: unknown) {
    super(`MCP server "${server}" did not answer: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'McpUnavailable';
    this.server = server;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Open a session against one server.
 *
 * ⚠️ NOT CACHED BETWEEN REQUESTS, on purpose. A serverless function may be
 *    frozen and thawed between invocations, and a resurrected MCP session whose
 *    server has since forgotten it fails in a way that looks like a tool error
 *    rather than a dead socket. Reconnecting costs one handshake and removes a
 *    whole class of confusing failure.
 */
export async function connect(server: McpServer, apiKey = process.env.YOUCAM_API_KEY) {
  /**
   * 🔴 MOCK MODE DID NOT REACH THIS FILE, AND IT WAS SPENDING REAL UNITS.
   *
   * `IS_MOCK` lives in `core/youcam/config` and only the REST client ever
   * consulted it. Every MCP call went straight to the live servers regardless —
   * so `/api/mcp` and, worse, F16 (which exists ONLY over MCP and therefore has
   * no REST path to fall back to) billed the account on every run while the
   * README promised "develop this way and spend nothing".
   *
   * Refusing here rather than returning a fixture is deliberate: a fake tool
   * result would be a measurement we invented, which is the one thing this
   * product must never produce. Callers wrapped in `withFallback` take the REST
   * road and their fixtures; callers with no REST equivalent get a clear reason.
   */
  if (IS_MOCK) {
    throw new McpUnavailable(
      server,
      'mock mode is on (YOUCAM_MOCK is not "false"), so no MCP call was made and no units were spent',
    );
  }
  if (!apiKey) throw new McpUnavailable(server, 'YOUCAM_API_KEY is not set');

  const client = new Client(
    { name: 'kroma', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVERS[server]), {
    // The same key as REST. One credential, two transports.
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });

  try {
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `connect to ${server}`);
  } catch (e) {
    throw new McpUnavailable(server, e);
  }
  return client;
}

export interface ToolCall {
  server: McpServer;
  tool: string;
  args: Record<string, unknown>;
}

/**
 * A failure the tool DESCRIBED rather than signalled — or null when the payload
 * looks like real work.
 *
 * Verified shapes from these servers:
 *   {"error_message": "YcoApiException - Start request failed: 400, ...
 *    {\"error_code\":\"CreditInsufficiency\"}", "request_id": "..."}
 *
 * ⚠️ Deliberately conservative. It matches an explicit error field, not any
 *    occurrence of the word "error" in a payload — a skin analysis is entitled
 *    to mention one without the call having failed.
 */
function describedFailure(result: unknown): string | null {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
  if (!text) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;

  const p = payload as Record<string, unknown>;
  const message = p.error_message ?? p.error ?? null;
  if (typeof message === 'string' && message.length > 0) {
    // Surface the engine's own code when it is buried in the message, because
    // that is what the error table maps and what the user gets told.
    const code = /"error_code"\s*:\s*"([^"]+)"/.exec(message)?.[1];
    return code ? `${code}: ${message}` : message;
  }
  return null;
}

/**
 * Everything a server says it can do.
 *
 * 🔑 THIS IS THE HALF OF THE PROTOCOL WE WERE NOT USING. `tools/list` is how a
 *    server describes itself, and until now every tool name in this file was a
 *    constant transcribed by hand from one exploratory session. That is fine
 *    for the names we verified — and a guess for the ones we did not.
 */
export async function listTools(server: McpServer): Promise<string[]> {
  const client = await connect(server);
  try {
    const res = await withTimeout(client.listTools(), CALL_TIMEOUT_MS, `${server}/tools/list`);
    return (res.tools ?? []).map((t) => t.name);
  } catch (e) {
    throw new McpUnavailable(server, e);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export class ToolNotOffered extends Error {
  server: McpServer;
  constructor(server: McpServer, pattern: RegExp, offered: number) {
    super(
      `No tool on "${server}" matches ${pattern} (${offered} offered). ` +
        `Not calling anything rather than guessing a name.`,
    );
    this.name = 'ToolNotOffered';
    this.server = server;
  }
}

/**
 * Ask the server what it has, pick the tool that matches, call it — one session.
 *
 * ⚠️ WHY DISCOVERY AND NOT A CONSTANT. `docs/submission/mcp.md` verified the tool
 *    names on `beauty` and `fashion` against a live `tools/list`. It verified
 *    NONE on `creators`. The names floating around our own notes for that server
 *    come from planning documents, not from the server.
 *
 *    Hardcoding an unverified name has a specific, nasty failure here: the call
 *    fails, `withFallback` quietly takes the REST road, and the trace shows a
 *    tidy green run — so we would go on claiming a server we never reached,
 *    which is the exact failure this screen exists to prevent. Asking removes
 *    the guess, and `ToolNotOffered` makes a missing tool say so out loud
 *    instead of hiding inside a fallback.
 */
export async function callDiscoveredTool(
  server: McpServer,
  pattern: RegExp,
  args: Record<string, unknown>,
): Promise<{ tool: string; result: unknown }> {
  const client = await connect(server);
  try {
    const listed = await withTimeout(client.listTools(), CALL_TIMEOUT_MS, `${server}/tools/list`);
    const names = (listed.tools ?? []).map((t) => t.name);
    const tool = names.find((n) => pattern.test(n));
    if (!tool) throw new ToolNotOffered(server, pattern, names.length);

    const result = await withTimeout(
      client.callTool({ name: tool, arguments: args }),
      CALL_TIMEOUT_MS,
      `${server}/${tool}`,
    );
    if (result.isError) throw new McpUnavailable(server, JSON.stringify(result.content));
    const failure = describedFailure(result);
    if (failure) throw new McpUnavailable(server, failure);
    return { tool, result };
  } catch (e) {
    // A tool the server does not offer is not a transport problem, and it must
    // not be dressed up as one: REST has no equivalent to fall back to.
    if (e instanceof ToolNotOffered) throw e;
    throw e instanceof McpUnavailable ? e : new McpUnavailable(server, e);
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** Open a session, call one tool, close it. Throws `McpUnavailable` on failure. */
export async function callTool({ server, tool, args }: ToolCall): Promise<unknown> {
  const client = await connect(server);
  try {
    // The server's own spelling of the name, whichever separator it uses today.
    const name = await resolveToolName(client, server, tool);
    if (!name) throw new Error(`"${server}" offers no tool named like ${tool}`);
    const result = await withTimeout(
      client.callTool({ name, arguments: args }),
      CALL_TIMEOUT_MS,
      `${server}/${name}`,
    );
    /**
     * ⚠️ `isError` IS NOT ENOUGH, AND TRUSTING IT SHIPPED A LIE.
     *
     * These servers answer a failed API call with a perfectly successful MCP
     * response whose payload happens to describe the failure. With only the
     * protocol flag checked, a run where BOTH tool calls came back
     * `CreditInsufficiency` was reported to the user as "2 of 3 steps went over
     * MCP" — the exact invisible failure the trace exists to prevent, produced
     * by the trace itself. A user caught it because the timings were too fast
     * to be real work.
     *
     * So the payload is inspected too. A step only counts when the tool
     * actually did something.
     */
    if (result.isError) throw new Error(JSON.stringify(result.content));
    const failure = describedFailure(result);
    if (failure) throw new Error(failure);
    return result;
  } catch (e) {
    throw new McpUnavailable(server, e);
  } finally {
    // Leaving the transport open holds a socket for the life of the function
    // instance, and the next invocation gets a session the server has dropped.
    await client.close().catch(() => undefined);
  }
}

/**
 * The tools this product uses, by server. Names as the live servers spell them
 * (verified against tools/list on 31 Oct 2026); `callTool` also accepts the
 * documentation's underscore spelling.
 */
export const TOOLS = {
  facialColour: { server: 'beauty', tool: 'AI-Facial-Color-Tones-Analyzer' },
  fitzpatrick: { server: 'beauty', tool: 'AI-Fitzpatrick-Skin-Type-Analysis' },
  skinAnalysis: { server: 'beauty', tool: 'AI-Skin-Analysis' },
  clothTryOn: { server: 'fashion', tool: 'AI-Clothes-Virtual-Try-On' },
  /**
   * The same engine as REST `/task/makeup-vto`, with the same `effects`
   * payload. F16 calls it over REST (`youcam.makeupVto`), because the redness
   * it measures before and after must come from one transport; it is listed
   * here so the MCP surface stays documented in one place.
   */
  makeup: { server: 'beauty', tool: 'AI-Makeup-Virtual-Try-On' },
} as const satisfies Record<string, { server: McpServer; tool: string }>;
