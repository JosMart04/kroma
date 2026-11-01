import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { OutfitBuilder } from '@/features/wardrobe/components/OutfitBuilder';

export const metadata = {
  title: 'Outfits you can wear · KROMA',
  description:
    'Complete outfits from your own wardrobe, every pair already checked for how you see colour.',
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

      <h1 className="mt-2 text-3xl font-bold text-slate-900">Get dressed</h1>
      <p className="mt-2 text-slate-700">
        Knowing that two things clash still leaves you doing the work every morning, piece
        by piece. These are whole outfits from your own wardrobe, already checked.
      </p>

      <div className="mt-6">
        <OutfitBuilder />
      </div>
    </main>
  );
}
