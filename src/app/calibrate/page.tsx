/**
 * F1 · Calibration.
 *
 * Deliberately thin Server Component: all the logic lives in
 * `<CalibrationFlow />`, which is a client component. IndexedDB does not exist
 * on the server, and `scripts/check-boundaries.mjs` rejects a `page.tsx`
 * without `'use client'` that imports `@/core/db` — rightly, because that
 * breaks at runtime rather than at compile time.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CalibrationFlow } from '@/features/face/components/CalibrationFlow';

export const metadata = {
  title: 'Calibration · KROMA',
  description:
    'We measure how you see colour. We do not ask you which kind of colour blindness you have.',
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

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Calibration</h1>
      <p className="mt-2 text-slate-700">
        The starting point for everything else. Nothing this app tells you later means
        anything until it knows how <em>you</em> see colour.
      </p>

      <div className="mt-8">
        <CalibrationFlow />
      </div>
    </main>
  );
}
