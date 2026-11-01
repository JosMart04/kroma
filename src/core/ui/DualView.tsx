'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F5 + F18 · THE SAME PHOTO, TWICE — BOTH THROUGH THIS PERSON'S EYES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THE DEFAULT SHOWS BOTH PANELS SIMULATED, AND THAT IS THE WHOLE POINT.
 *
 *  Putting the true photo beside the assisted one demonstrates nothing to
 *  anybody who can already see colour: they could read both panels, so all they
 *  notice is that some colours moved. Simulating both shows the GAIN —
 *
 *      left    the real photo, as they see it        → the text stays hidden
 *      right   the assisted photo, as they see it    → the text becomes legible
 *
 *  — and costs the user nothing, because the left panel is what their eyes were
 *  doing to the original anyway. The button restores the true colours for a
 *  sighted person who needs to check what the thing actually is.
 *
 *  ⚠️ THE CAVEAT, STATED RATHER THAN GLOSSED. Simulating for someone who already
 *     has the deficiency is not perfectly free: their eyes simulate the
 *     simulation. Near-idempotent for a dichromat; for a MILD anomalous
 *     trichromat the left panel is slightly more degraded than reality.
 *
 *  ── TWO LAYOUT DECISIONS THAT ARE ACTUALLY ABOUT THE FEATURE ────────────
 *
 *  ⚠️ STACKED ON A PHONE, SIDE BY SIDE FROM 640 px. Two columns on a 375 px
 *     screen leave ~160 px per panel, and at that size the difference the
 *     panels exist to show is invisible in both of them. A comparison you
 *     cannot see is not a comparison. Full width each, scrolled, beats two
 *     stamps side by side.
 *
 *  ⚠️ THEY ARE `<img>`, NOT `<canvas>`. See TransformedImage: a canvas cannot be
 *     long-pressed to save, pinch-zoomed, or read by a screen reader, and
 *     leaving one on screen silently removed all of that.
 */
import { useState } from 'react';
import { Eye, Maximize2, Sparkles } from 'lucide-react';
import type { CVDProfile } from '@/core/contracts/types';
import { simulateImageData, daltonizeImageData } from '@/core/color';
import { useViewPreferences } from './ViewPreferences';
import { useTransformedImage } from './TransformedImage';
import { Lightbox } from './Lightbox';

export function DualView({
  src,
  profile,
  alt = '',
}: {
  src: string;
  profile: CVDProfile;
  alt?: string;
}) {
  const { strength } = useViewPreferences();
  /** false = both through their eyes (the comparison) · true = the true colours. */
  const [trueColours, setTrueColours] = useState(false);
  const [expanded, setExpanded] = useState<{ src: string; label: string } | null>(null);

  const leftUrl = useTransformedImage(
    src,
    (d) => (trueColours ? d : simulateImageData(d, profile)),
    [src, profile, trueColours],
  );
  const rightUrl = useTransformedImage(
    src,
    (d) => {
      const assisted = daltonizeImageData(d, profile, { strength });
      return trueColours ? assisted : simulateImageData(assisted, profile);
    },
    [src, profile, trueColours, strength],
  );

  const labels = trueColours
    ? { left: 'As it is', right: 'Assisted contrast' }
    : { left: 'As you see it now', right: 'With assisted contrast' };

  const panel = (
    url: string | null,
    label: string,
    Icon: typeof Eye,
    border: string,
    tone: string,
  ) => (
    <figure className={`rounded-xl border-2 ${border} p-2`}>
      <figcaption
        translate="no"
        className={`mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tone}`}
      >
        <Icon size={13} className="shrink-0" aria-hidden />
        <span key={label}>{label}</span>
      </figcaption>
      <button
        type="button"
        onClick={() => url && setExpanded({ src: url, label })}
        className="relative block w-full"
        aria-label={`${alt} — ${label}. Open larger`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${alt} — ${label}`} className="w-full rounded-lg" />
        ) : (
          <span className="block aspect-[3/4] w-full animate-pulse rounded-lg bg-slate-200" />
        )}
        <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/70 p-1.5 text-white">
          <Maximize2 size={14} aria-hidden />
        </span>
      </button>
    </figure>
  );

  return (
    <div className="mt-3">
      {/*
        One column on a phone so each picture gets the full width; two from the
        `sm` breakpoint, where side by side is genuinely readable.
      */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {panel(leftUrl, labels.left, Eye, 'border-dashed border-slate-400', 'text-slate-700')}
        {panel(rightUrl, labels.right, Sparkles, 'border-solid border-slate-900', 'text-slate-900')}
      </div>

      <p translate="no" className="mt-2 text-xs text-slate-600">
        {trueColours ? (
          <span key="true">
            These are the real colours. The right side has been altered on purpose so it can
            be told apart — it is not what the garment actually is.
          </span>
        ) : (
          <span key="seen">
            Both sides are shown the way you see colour, so the difference between them is
            the help itself. Tap either one to see it properly.
          </span>
        )}
      </p>

      <button
        type="button"
        translate="no"
        onClick={() => setTrueColours((v) => !v)}
        className="mt-1 min-h-11 text-xs font-semibold text-slate-700 underline"
      >
        {trueColours ? (
          <span key="back">Back to how I see it</span>
        ) : (
          <span key="real">Show the true colours</span>
        )}
      </button>

      {expanded && (
        <Lightbox
          src={expanded.src}
          alt={`${alt} — ${expanded.label}`}
          caption={expanded.label}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}
