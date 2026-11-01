'use client';
/**
 * Tap a picture, see it properly.
 *
 * ⚠️ THE REASON IS NOT POLISH, IT IS THAT SMALL PICTURES DEFEAT THE FEATURE.
 *    Two comparison panels side by side on a 375 px phone leave about 160 px
 *    each. At that size the thing the panels exist to show — text hidden in a
 *    pattern becoming legible — is invisible in both of them. The comparison
 *    survives only if the pictures can be opened.
 *
 * ⚠️ It renders an <img>, deliberately, so long-press-to-save, pinch-zoom and
 *    the share sheet all keep working. See TransformedImage for the canvas
 *    regression this is part of undoing.
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Lightbox({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Stop the page behind from scrolling under the overlay.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
      >
        <X size={22} aria-hidden />
      </button>

      {/*
        The image itself does not close the overlay — you need to be able to
        press and hold it to save it, and a tap-to-close would fight that.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85dvh] w-auto max-w-full rounded-lg object-contain"
      />

      {caption && (
        <p className="mt-3 max-w-md text-center text-sm text-white/80" translate="no">
          {caption}
        </p>
      )}
      <p className="mt-1 text-xs text-white/50">Press and hold the picture to save it.</p>
    </div>
  );
}
