import { TryOnScreen } from '@/features/tryon/components/TryOnScreen';

export const metadata = {
  title: 'See it on you · KROMA',
  description: 'The garment rendered onto your own photo, with the verdict that matters.',
};

/**
 * ⚠️ The garment lives in IndexedDB, which is client-only, so this shell can
 *    only pass the id down. Nothing about the wardrobe is readable on the
 *    server — see `scripts/check-boundaries.mjs`.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="text-3xl font-bold text-slate-900">See it on you</h1>
      <p className="mt-2 text-slate-700">
        Whether it works is a measurement. Whether it fits is a picture. This screen
        gives you both, and says which is which.
      </p>
      <TryOnScreen id={id} />
    </main>
  );
}
