'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  A TRANSFORMED PHOTO THAT IS STILL A PHOTO
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THIS EXISTS BECAUSE A `<canvas>` IS NOT AN IMAGE, AND A USER FOUND OUT.
 *
 *  Adding assisted contrast meant painting through a canvas, and I left the
 *  canvas on screen. It looks identical and it is not:
 *
 *    · LONG-PRESS TO SAVE DOES NOTHING. A phone offers "save image" for an
 *      <img> and nothing at all for a canvas. Every picture in the app quietly
 *      stopped being downloadable.
 *    · No native pinch-zoom, no "open in new tab", no share sheet.
 *    · Screen readers get a canvas, which is a rectangle of nothing.
 *
 *  So the canvas moves off screen and becomes a worker: it does the transform,
 *  hands back a blob, and what the user sees is an ordinary <img> again. Every
 *  gesture a photograph is supposed to support comes back for free.
 *
 *  ⚠️ RENDER SIZE IS A DISPLAY DECISION, NOT A QUALITY ONE. 1200 px on the long
 *     edge covers a full-width phone panel at 3× pixel density (375 × 3 = 1125)
 *     with room to spare. Going higher costs real time — the filter is a
 *     per-pixel matrix pair on the main thread, so 1600 px is nearly double the
 *     work of 1200 for pixels no screen here will show.
 */
import { useEffect, useRef, useState } from 'react';

/** How far a photo is downscaled before the per-pixel work happens. */
export const RENDER_EDGE = 1200;

/**
 * Runs `transform` over an image and returns an object URL for the result.
 * Null while it works, or if the image cannot be read.
 */
export function useTransformedImage(
  src: string,
  transform: ((data: ImageData) => ImageData) | null,
  deps: unknown[],
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!transform) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, RENDER_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.putImageData(transform(ctx.getImageData(0, 0, canvas.width, canvas.height)), 0, 0);
      canvas.toBlob(
        (blob) => {
          if (cancelled || !blob) return;
          // Revoke the one we are replacing, or every re-render leaks a photo.
          if (previous.current) URL.revokeObjectURL(previous.current);
          previous.current = URL.createObjectURL(blob);
          setUrl(previous.current);
        },
        // PNG: lossless. A second JPEG pass over an already-compressed photo
        // would add artefacts to the one variable this product sells.
        'image/png',
      );
    };
    img.onerror = () => !cancelled && setUrl(null);
    img.src = src;
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Free the last URL when the component goes away.
  useEffect(
    () => () => {
      if (previous.current) URL.revokeObjectURL(previous.current);
    },
    [],
  );

  return url;
}
