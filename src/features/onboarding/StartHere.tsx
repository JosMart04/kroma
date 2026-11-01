'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIRST SCREEN — three guided steps
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  KROMA starts EMPTY on purpose. Nothing is pre-loaded and nothing is
 *  simulated: every colour a person sees here was measured from their own
 *  photo, on their own device.
 *
 *  That honesty has a cost, and this screen is the payment. Someone who opens
 *  the app and does not know what to do leaves without seeing anything — and
 *  never reaches "this clashes with 4 things you own", which is the feature the
 *  whole product exists for.
 *
 *  So this is not a menu. It is a path: three steps, always visible progress,
 *  and each one says what you GAIN by finishing it. Steps stay reachable in any
 *  order — nothing is locked, because a locked door on the first screen is how
 *  you lose someone who was only ever going to spend two minutes.
 *
 *  🔤 State travels in ICON + TEXT, never colour alone. Our user would not
 *     receive a green/grey distinction.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, ArrowRight, Eye, ScanFace, Shirt, ShoppingBag } from 'lucide-react';
import { getProfile, getPortrait, listGarments } from '@/core/db';

interface Progress {
  calibrated: boolean;
  portrait: boolean;
  garments: number;
}

const STEPS = [
  {
    href: '/calibrate',
    icon: Eye,
    title: 'Measure how you see colour',
    gain: 'Takes two minutes. Everything after this is computed for your eyes, not for average ones.',
    done: (p: Progress) => p.calibrated,
  },
  {
    href: '/portrait',
    icon: ScanFace,
    title: 'Measure your face',
    gain: 'Skin, eyes, brows, lips and hair. This is the palette you wear every day and cannot see.',
    done: (p: Progress) => p.portrait,
  },
  {
    href: '/wardrobe',
    icon: Shirt,
    title: 'Add a garment',
    gain: 'One photo is enough to start. The more you add, the more we can tell you about what clashes.',
    done: (p: Progress) => p.garments > 0,
  },
] as const;

export function StartHere() {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getProfile(), getPortrait(), listGarments()])
      .then(([profile, portrait, garments]) => {
        if (alive) {
          setProgress({
            calibrated: profile !== null,
            portrait: portrait !== null,
            garments: garments.length,
          });
        }
      })
      .catch(() => alive && setProgress({ calibrated: false, portrait: false, garments: 0 }));
    return () => {
      alive = false;
    };
  }, []);

  const done = progress ? STEPS.filter((s) => s.done(progress)).length : 0;
  // The first unfinished step is the one we point at.
  const nextIndex = progress ? STEPS.findIndex((s) => !s.done(progress)) : 0;

  return (
    <>
      <ol className="mt-8 space-y-3">
        {STEPS.map((step, i) => {
          const isDone = progress ? step.done(progress) : false;
          const isNext = i === nextIndex;
          const Icon = step.icon;
          return (
            <li key={step.href}>
              <Link
                href={step.href}
                className={`flex gap-4 rounded-xl border-2 p-4 transition-colors ${
                  isNext ? 'border-slate-900 bg-slate-50' : 'border-slate-300'
                } hover:border-slate-900`}
              >
                <div className="shrink-0 pt-0.5">
                  {isDone ? (
                    <Check size={22} className="text-slate-900" aria-hidden />
                  ) : (
                    <Circle size={22} className="text-slate-400" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="shrink-0 text-slate-700" aria-hidden />
                    <h2 className="font-semibold text-slate-900">
                      {i + 1}. {step.title}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{step.gain}</p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                    {isDone ? 'Done' : isNext ? 'Start here' : 'Not yet'}
                  </p>
                </div>
                <ArrowRight size={18} className="mt-1 shrink-0 text-slate-400" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-sm text-slate-600" aria-live="polite">
        {progress ? `${done} of ${STEPS.length} steps done.` : 'Checking what you have…'}
      </p>

      {/*
        🔑 THE EVERYDAY PAYOFF, AND THE REASON THE PATH ABOVE IS WORTH WALKING.
        Knowing that two things clash still leaves the user doing the work every
        morning, piece by piece — which is the task their vision makes fragile
        and the reason they end up asking someone. This is where that stops.

        It sits beside "should I buy this?" rather than becoming a fourth step:
        the path is three steps on purpose, and these two are what the path is
        FOR. Like the other one, it is reachable early and says plainly when it
        has nothing useful to add yet.
      */}
      <Link
        href="/outfits"
        className="mt-6 flex items-center gap-3 rounded-xl border-2 border-slate-300 p-4 hover:border-slate-900"
      >
        <Shirt size={20} className="shrink-0 text-slate-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">What can I wear today?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Complete outfits from your own wardrobe, with every pair already checked for
            how you see colour — so the decision is yours to make.
          </p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-slate-400" aria-hidden />
      </Link>

      <Link
        href="/analyze"
        className="mt-6 flex items-center gap-3 rounded-xl border-2 border-slate-300 p-4 hover:border-slate-900"
      >
        <ShoppingBag size={20} className="shrink-0 text-slate-700" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">Should I buy this?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Photograph something in a shop and find out whether you can tell it apart from
            what you already own.
          </p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-slate-400" aria-hidden />
      </Link>
    </>
  );
}
