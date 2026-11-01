import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PortraitCapture } from '@/features/face/components/PortraitCapture';

export const metadata = {
  title: 'Colour portrait · KROMA',
  description: 'Skin, eyes, brows, lips and hair — measured from one selfie.',
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

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Your colour portrait</h1>
      <p className="mt-2 text-slate-700">
        Skin, eyes, brows, lips and hair. This is the palette you are wearing in every
        photograph and every meeting — and the one palette you cannot check.
      </p>
      <p className="mt-3 text-sm text-slate-600">
        The photo is sent once, measured, and never stored on a server. The result lives
        in this browser.
      </p>

      <PortraitCapture />
    </main>
  );
}
