'use client';
/**
 * The photograph of one garment, wherever a garment is named.
 *
 * ⚠️ IT EXISTS BECAUSE THE DATA WAS NOT WHERE THE UI NEEDED IT. Photographs
 *    live in IndexedDB keyed by garment id, and two screens listed garments
 *    without ever asking for them — the colour groups and "should I buy this?"
 *    both had the `Garment` records and no images. Fetching blobs inline in
 *    each of those components would have meant two copies of the same
 *    load-and-revoke dance.
 *
 * ⚠️ IT ALWAYS RENDERS SOMETHING. No photo stored, a blob that fails to decode,
 *    the fetch still in flight — each of those falls back to a solid square of
 *    the garment's MEASURED colour, which is not a placeholder: it is the
 *    number this whole product is built on, and it identifies the item.
 *
 * The filter, the expand-on-tap and the "altered on purpose" caption all come
 * from `AssistedImage`; this only answers "which picture".
 */
import { useEffect, useState } from 'react';
import { Shirt } from 'lucide-react';
import { getImage } from '@/core/db';
import type { CVDProfile, Garment } from '@/core/contracts/types';
import { AssistedImage } from './AssistedImage';

const SIZES = {
  /** Inline beside a name, or several in a row inside a collapsed group. */
  sm: 'h-10 w-10',
  /** A list row you are meant to recognise the garment from. */
  md: 'h-14 w-14',
} as const;

interface Props {
  garment: Garment;
  profile: CVDProfile | null;
  size?: keyof typeof SIZES;
  /**
   * Tap-to-enlarge. On by default — but it MUST be turned off when this sits
   * inside something else that is already clickable.
   *
   * ⚠️ IT IS NOT ONLY THAT HTML FORBIDS A BUTTON INSIDE A BUTTON, though it
   *    does, and React reports it as a hydration error. It is that a tap would
   *    have two possible meanings on the same pixels — "enlarge this" and
   *    "choose this" — and the person deciding cannot see which one they hit.
   *    Inside a picker the thumbnail is a label, not a control.
   */
  expandable?: boolean;
}

export function GarmentThumb({ garment, profile, size = 'md', expandable = true }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const box = `${SIZES[size]} shrink-0 rounded-lg border border-slate-300 object-cover`;

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    getImage(garment.id)
      .then((blob) => {
        if (!alive || !blob) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      // Object URLs live until revoked, and these lists re-render often.
      if (created) URL.revokeObjectURL(created);
    };
  }, [garment.id]);

  if (!url) {
    return (
      <span
        className={`${box} flex items-center justify-center`}
        style={{ backgroundColor: garment.colorHex }}
        // The colour IS the identifying information, so it is not decorative.
        role="img"
        aria-label={`${garment.colorName} ${garment.category}, no photo stored`}
      >
        <Shirt size={16} className="text-white/70" aria-hidden />
      </span>
    );
  }

  return (
    <AssistedImage
      src={url}
      alt={`${garment.colorName} ${garment.category}`}
      profile={profile}
      className={box}
      expandable={expandable}
    />
  );
}
