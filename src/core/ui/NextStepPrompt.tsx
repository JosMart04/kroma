'use client';
/**
 * "You need to do X first" — with a way to actually go and do X.
 *
 * ⚠️ THIS EXISTS BECAUSE OF A REAL DEAD END A USER HIT. The wardrobe told them
 *    "these colours are measured, but there are no verdicts yet — do step 1
 *    first", and offered no way to reach step 1. Three screens did the same
 *    thing: they named the missing step and left the person to find it.
 *
 *    A prompt that states a prerequisite without linking to it is not guidance,
 *    it is a locked door with a sign on it. Every one of these now carries the
 *    door handle.
 *
 * 🔤 Meaning travels in icon + text + border, never colour. Our user would not
 *    receive a colour-coded "warning" state at all.
 */
import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';

export function NextStepPrompt({
  children,
  href,
  cta,
}: {
  children: React.ReactNode;
  href: string;
  cta: string;
}) {
  return (
    <div className="mt-5 rounded-xl border-2 border-slate-800 p-4">
      <div className="flex items-start gap-2">
        <Info size={18} className="mt-0.5 shrink-0 text-slate-800" aria-hidden />
        <p className="text-sm text-slate-800">{children}</p>
      </div>
      <Link
        href={href}
        className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
      >
        {cta}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}
