import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AnalyzeGarment } from '@/features/shopping/components/AnalyzeGarment';

export const metadata = {
  title: 'Should I buy this? · KROMA',
  description: 'Photograph something in a shop before you decide.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600"
      >
        <ArrowLeft size={16} aria-hidden />
        Back
      </Link>

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Should I buy this?</h1>
      <p className="mt-2 text-slate-700">
        You are holding something in a shop. We tell you what colour it actually is,
        whether you will be able to tell it apart from what you already own, and how it
        sits against your own face.
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Shop lighting is usually terrible for judging colour. If it is too bad to measure
        honestly, we will say so instead of guessing.
      </p>

      <AnalyzeGarment />
    </main>
  );
}
