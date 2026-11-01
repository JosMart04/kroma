import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MakeupStudio } from '@/features/makeup/components/MakeupStudio';

export const metadata = {
  title: 'Did it work? · KROMA',
  description: 'Apply the corrector we worked out, then measure whether your redness moved.',
};

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link
        href="/portrait"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600"
      >
        <ArrowLeft size={16} aria-hidden />
        Back
      </Link>

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Did it work?</h1>
      <p className="mt-2 text-slate-700">
        We worked out which colour cancels the redness we measured on your face. Here you
        can see it applied, and — once you have put it on for real — find out whether it
        actually changed anything.
      </p>

      <MakeupStudio />
    </main>
  );
}
