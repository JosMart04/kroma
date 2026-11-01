import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { WardrobeScreen } from '@/features/wardrobe/components/WardrobeScreen';

export const metadata = {
  title: 'Your wardrobe · KROMA',
  description: 'Photograph a garment and we measure its real colour.',
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

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Your wardrobe</h1>
      <p className="mt-2 text-slate-700">
        Photograph what you own. We measure the real colour of each piece and tell you
        which ones you will not be able to tell apart from each other.
      </p>

      <div className="mt-6">
        <WardrobeScreen />
      </div>
    </main>
  );
}
