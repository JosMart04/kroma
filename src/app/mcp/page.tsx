import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { McpRun } from '@/features/mcp/components/McpRun';

export const metadata = {
  title: 'Over MCP · KROMA',
  description: 'The same measurement, routed through the Model Context Protocol.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600"
      >
        <ArrowLeft size={16} aria-hidden />
        Back
      </Link>

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Over MCP</h1>
      <p className="mt-2 text-slate-700">
        The same face measurement the rest of the app makes, routed through the Model
        Context Protocol against YouCam&rsquo;s servers instead of their REST API — with
        the transport shown for every step, and an automatic fall back to REST when a
        server does not answer.
      </p>

      <McpRun />
    </main>
  );
}
