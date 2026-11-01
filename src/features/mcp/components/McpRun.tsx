'use client';
/**
 * F17 · The orchestrated run, with its transport on show.
 *
 * ⚠️ THE POINT OF THIS SCREEN IS THE TRACE, NOT THE COLOURS. A fallback nobody
 *    can see is a claim nobody can check: if MCP quietly degraded to REST, a
 *    demo would still look like a working MCP integration. So each step says
 *    which server answered, over which transport, and how long it took — and
 *    when it fell back, it says why.
 *
 * ⚠️ NOTHING HERE IS SAVED. The measurements that feed verdicts come from the
 *    REST path, because the two paths were measured and they disagree. This
 *    screen reports; the colour portrait persists.
 */
import { useState } from 'react';
import { Loader, TriangleAlert, Network, ArrowRight } from 'lucide-react';
import { CameraInput, readApiError, PoweredByYouCam } from '@/core/ui';

interface Step {
  label: string;
  server: string;
  tool: string;
  transport: 'mcp' | 'rest';
  ms: number;
  ok: boolean;
  fellBackBecause?: string;
  /** The tool name came from the server's own `tools/list`, not from our notes. */
  discovered?: boolean;
}

interface RunResult {
  servers: Record<string, string>;
  steps: Step[];
  overMcp: number;
  /** Which servers this run genuinely reached. Derived from the trace, not hoped for. */
  serversOverMcp?: string[];
  results: unknown;
  error?: string;
  detail?: string;
}

/**
 * ⚠️ THIS LIST USED TO BE A LIE, AND IT WAS THE WORST KIND — the one this very
 *    screen exists to prevent.
 *
 *    It said "this pipeline crosses all three because the product needs all
 *    three", and the route behind it called two tools, both on `beauty`.
 *    `fashion` and `creators` were named here and never contacted. In a product
 *    whose entire argument is "we cannot mislead you because you could not
 *    check", that sentence was findable by opening one file.
 *
 *    So each server now says WHERE it is exercised, and the run reports which
 *    ones it actually reached.
 */
/** Tool counts from the live servers' `tools/list`, verified 31 Oct 2026. */
const SERVERS = [
  {
    name: 'beauty',
    tools: 50,
    why: 'measures the face — the colour the user cannot see',
    where: 'this run',
  },
  {
    name: 'creators',
    tools: 37,
    why: 'normalises the light, without which a measurement lies about itself',
    where: 'this run',
  },
  {
    name: 'fashion',
    tools: 19,
    why: 'renders the garment onto their body',
    where: 'the try-on screen, not here',
  },
];

export function McpRun() {
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(file: File) {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const body = new FormData();
      body.append('photo', file);
      const res = await fetch('/api/mcp', { method: 'POST', body });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        // The trace still comes back on a handled failure, and it is the point
        // of this screen: it shows which steps ran before the run died.
        setRun(await res.clone().json().catch(() => null));
        return;
      }
      setRun((await res.json()) as RunResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The run did not finish.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <section aria-labelledby="servers">
        <h2 id="servers" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Network size={18} aria-hidden />
          Three servers, one product
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          A project that only does try-on talks to one server. A project that only analyses
          skin talks to another. This product uses all three — but not all three in the same
          request, so each one says where it runs and the trace below says which were
          actually reached.
        </p>
        <ul className="mt-3 space-y-2">
          {SERVERS.map((s) => {
            const reached = run?.serversOverMcp?.includes(s.name);
            return (
              <li
                key={s.name}
                /* Solid border = reached over MCP in this run. Never colour alone:
                   the word next to the name says the same thing. */
                className={
                  reached
                    ? 'rounded-lg border-2 border-solid border-slate-900 p-3'
                    : 'rounded-lg border-2 border-dashed border-slate-300 p-3'
                }
              >
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {s.name}
                  <span className="text-sm font-normal text-slate-600">{s.tools} tools</span>
                  {run && (
                    <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                      {reached ? 'reached over MCP' : `not in this run · ${s.where}`}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-700">{s.why}</p>
                {!run && (
                  <p className="mt-1 text-sm text-slate-500">Runs in: {s.where}.</p>
                )}
              </li>
            );
          })}
        </ul>
          {/*
          🔑 WHY `creators` LIVES HERE AND NOT IN THE PRODUCT, SAID OUT LOUD.

          It is the honest consequence of the rule above, and stating it beats
          three green ticks. The two tools we would want from that server —
          photo lighting and background removal — both sit INSIDE the
          measurement path: the lighting gap IS the confidence score, and the
          cut-out mask decides which pixels get measured. Our own rule says
          REST owns those. So routing them through MCP to claim a third server
          would break the policy the rest of this screen is about.
        */}
        <p className="mt-4 rounded-lg border-2 border-slate-300 p-3 text-sm text-slate-700">
          <strong>All three servers are reached; one does production work.</strong>{' '}
          <code>fashion</code> renders every try-on in the app, MCP first with REST
          underneath. <code>beauty</code> and <code>creators</code> are exercised in this run
          and nowhere else, and that is a consequence of the rule above rather than an
          oversight: the tools we use from them — face colour, phototype, photo lighting,
          background removal, and the makeup render whose redness is measured before and
          after — all feed a measurement, and measurements go over REST. We would rather
          say that plainly than measure one face through two paths that disagree.
        </p>
      </section>

      <div className="mt-6">
        {!busy && (
          <CameraInput
            facing="user"
            label={run ? 'Run it again' : 'Take a selfie and run it'}
            hint="The same measurement the colour portrait makes, routed through MCP instead. Nothing from this run is saved."
            onSelect={go}
          />
        )}

        {busy && (
          <div role="status" className="rounded-xl border-2 border-slate-300 p-5">
            <div className="flex items-center gap-3">
              <Loader size={20} className="animate-spin text-slate-700" aria-hidden />
              <div>
                <p className="font-semibold text-slate-900">Running the pipeline…</p>
                <p className="text-sm text-slate-600">
                  Uploading once, then calling the tools over the Model Context Protocol.
                </p>
              </div>
            </div>
            {/* The API is doing the work right now, so the credit moves. */}
            <PoweredByYouCam />
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border-2 border-slate-800 p-4">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-slate-800" aria-hidden />
          <p className="text-sm text-slate-800">{error}</p>
        </div>
      )}

      {run?.steps && run.steps.length > 0 && (
        <section className="mt-6" aria-labelledby="trace">
          <h2 id="trace" className="text-lg font-bold text-slate-900">
            What actually happened
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {run.overMcp} of {run.steps.length} steps went over MCP.
          </p>

          <ol className="mt-3 space-y-2">
            {run.steps.map((s, i) => (
              <li
                key={`${s.label}-${i}`}
                /*
                  🔤 MCP and REST are told apart by a WORD and a BORDER STYLE,
                  never by colour. The whole product is built for people who do
                  not receive colour-coded state.
                */
                className={
                  s.transport === 'mcp'
                    ? 'rounded-lg border-2 border-solid border-slate-900 p-3'
                    : 'rounded-lg border-2 border-dashed border-slate-400 p-3'
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                    {s.transport}
                  </span>
                  <span className="font-semibold text-slate-900">{s.label}</span>
                  <span className="text-sm text-slate-600">{s.ms} ms</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                  {s.server}
                  <ArrowRight size={12} aria-hidden />
                  <code>{s.tool}</code>
                  {s.discovered && (
                    <span className="rounded border border-slate-400 px-1.5 text-xs font-semibold text-slate-700">
                      name from tools/list
                    </span>
                  )}
                </p>
                {s.fellBackBecause && (
                  <p className="mt-2 rounded bg-slate-100 p-2 text-sm text-slate-700">
                    Fell back to REST: {s.fellBackBecause}
                  </p>
                )}
              </li>
            ))}
          </ol>

          <p className="mt-4 rounded-lg border-2 border-slate-300 p-3 text-sm text-slate-700">
            Nothing from this run was saved. Measured on the same image with the same
            <code className="mx-1">file_id</code>, the two transports agreed on skin within
            ΔE 1.0 and disagreed on the iris by ΔE 6.4 — plainly visible. A user routed one
            way would be told a different eye colour than a user routed the other, and could
            not detect the inconsistency. So REST owns every measurement that feeds a
            verdict, and MCP does the orchestration.
          </p>

        </section>
      )}
    </div>
  );
}
