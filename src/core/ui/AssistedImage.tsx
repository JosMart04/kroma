'use client';
/**
 * A photograph shown through the assisted-contrast filter when the user has it
 * on, and untouched when they do not — and tappable either way.
 *
 * ⚠️ This is where daltonisation stops being a demonstration and becomes
 *    useful: a wardrobe list is exactly the situation the feature exists for —
 *    several garments together, and the question is which of them this person
 *    can actually tell apart.
 *
 * ⚠️ ALWAYS AN `<img>`, NEVER A BARE `<canvas>`. The first version painted the
 *    canvas straight onto the page, which silently removed long-press-to-save,
 *    pinch-zoom and any meaning for a screen reader. See TransformedImage.
 *
 * ⚠️ FALLS BACK TO THE REAL PHOTO, ALWAYS. No profile, filter off, transform
 *    still running, image failed to decode — every one of those shows the
 *    untouched picture rather than nothing. The filter is an assist; it is
 *    never a dependency.
 */
import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { CVDProfile } from '@/core/contracts/types';
import { daltonizeImageData } from '@/core/color';
import { useViewPreferences } from './ViewPreferences';
import { useTransformedImage } from './TransformedImage';
import { Lightbox } from './Lightbox';

interface Props {
  src: string;
  alt: string;
  className?: string;
  profile: CVDProfile | null;
  /** Tap to see it full size. On by default; a 64 px thumbnail needs it most. */
  expandable?: boolean;
}

export function AssistedImage({ src, alt, className, profile, expandable = true }: Props) {
  const { assistedContrast, strength } = useViewPreferences();
  const [expanded, setExpanded] = useState(false);

  const active =
    assistedContrast && profile !== null && profile.type !== 'normal' && profile.severity > 0;

  const filtered = useTransformedImage(
    src,
    active && profile ? (d) => daltonizeImageData(d, profile, { strength }) : null,
    [src, profile, strength, active],
  );

  // Until the transform finishes — and whenever it is off — the real photo.
  const shown = filtered ?? src;

  if (!expandable) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={shown} alt={alt} className={className} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="relative shrink-0"
        aria-label={`${alt}. Open larger`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shown} alt={alt} className={className} />
        <span className="absolute bottom-0.5 right-0.5 rounded bg-slate-900/70 p-0.5 text-white">
          <Maximize2 size={11} aria-hidden />
        </span>
      </button>

      {expanded && (
        <Lightbox
          src={shown}
          alt={alt}
          caption={active ? 'Assisted contrast — these colours are altered on purpose' : undefined}
          onClose={() => setExpanded(false)}
        />
      )}
    </>
  );
}
