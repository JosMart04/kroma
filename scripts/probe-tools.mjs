/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ASK THE YOUCAM MCP SERVERS WHAT THEY ACTUALLY OFFER
 * ══════════════════════════════════════════════════════════════════════════
 *
 *      node --env-file=.env.local scripts/probe-tools.mjs
 *      node --env-file=.env.local scripts/probe-tools.mjs --schema AI-Photo-Lighting
 *
 *  ⚠️ THIS SPENDS NO UNITS. `tools/list` is protocol metadata, not a task. That
 *     is the whole point: it is free, and it is better documentation than the
 *     REST reference — enums, tolerances and parameters that the docs describe
 *     only in prose, or not at all.
 *
 *  WHY IT IS IN THE REPOSITORY
 *
 *  `docs/entrega/dossier-perfectcorp.md` reports findings and tells the reader
 *  how to reproduce them. A report that says "run this script" without shipping
 *  the script is asking to be taken on trust, which is the one thing this
 *  project does not do.
 *
 *  It is also what caught two real defects:
 *
 *   · `AI-Photo-Lighting` lives on `creators`, and our own notes had guessed at
 *     the name from planning documents. Hardcoding a guess fails silently into
 *     a REST fallback and you go on claiming a server you never reached.
 *
 *   · `garment_category` accepts `outer` — a sixth enum value the REST
 *     documentation never names, while the value it DOES name (`outerwear`)
 *     returns 400. We had concluded the engine had no outerwear mode. It does.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SERVERS = {
  beauty: 'https://mcp-api-01.makeupar.com/mcp/beauty',
  fashion: 'https://mcp-api-01.makeupar.com/mcp/fashion',
  creators: 'https://mcp-api-01.makeupar.com/mcp/creators',
};

const key = process.env.YOUCAM_API_KEY;
if (!key) {
  console.error('YOUCAM_API_KEY is not set. Put it in .env.local and pass --env-file.');
  process.exit(1);
}

/** `--schema <ToolName>` prints that tool's full inputSchema instead of the list. */
const schemaFlag = process.argv.indexOf('--schema');
const wantSchema = schemaFlag >= 0 ? process.argv[schemaFlag + 1] : null;

let failures = 0;

for (const [name, url] of Object.entries(SERVERS)) {
  const client = new Client({ name: 'kroma-probe', version: '1.0.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();

    if (wantSchema) {
      const tool = tools.find((t) => t.name === wantSchema);
      if (!tool) continue;
      console.log(`\n═══ ${name} · ${tool.name} ═══`);
      console.log((tool.description ?? '').slice(0, 400));
      console.log('--- inputSchema ---');
      console.log(JSON.stringify(tool.inputSchema, null, 1));
      continue;
    }

    console.log(`\n═══ ${name} · ${tools.length} tools ═══`);
    for (const t of tools) console.log(`  ${t.name}`);
  } catch (e) {
    failures++;
    console.log(`\n═══ ${name} · UNREACHABLE ═══\n  ${e?.message ?? e}`);
  } finally {
    await client.close().catch(() => {});
  }
}

if (!wantSchema) {
  console.log(
    '\nNo units were spent: tools/list is protocol metadata.\n' +
      'For one tool\'s parameters:  --schema AI-Clothes-Virtual-Try-On',
  );
}

process.exit(failures > 0 ? 1 : 0);
