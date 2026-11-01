'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  CAMERA INPUT — the front door to every measurement in the app
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Used by the colour portrait (F2), garment intake (F6), the shopping
 *  analyser (F12) and the try-on (F13). Built once, on purpose: it is the
 *  single point where a photo enters the product, so it is the single place to
 *  get the hard parts right — and the single place where getting them wrong
 *  takes the whole product down, which is what happened.
 *
 *  ── THREE THINGS TESTERS BROKE, ALL OF THEM HERE ───────────────────────
 *
 *  1. NO WAY TO USE A PHOTO YOU ALREADY HAVE. `capture` does not "prefer" the
 *     camera on a phone, it REPLACES the picker with it. Anyone holding a
 *     photo of the garment taken five minutes ago had no route into the app.
 *     Now the camera and the gallery are two separate buttons, offered only
 *     where they differ — on a desktop both open the same picker, so it shows
 *     one.
 *
 *  2. A FULL-RESOLUTION PHONE PHOTO NEVER ARRIVED. Vercel rejects a request
 *     body over ~4.5 MB with a plain-text 413, and a 12 MP photo is 8.6 MB.
 *     The upload died before our code ran, and `res.json()` on the plain-text
 *     body threw a parse error — which is why the report was "you take the
 *     photo and nothing happens". Large photos are now shrunk here first.
 *
 *  3. iPhone HEIC. Drawing through a canvas re-encodes it as JPEG on the way
 *     out, which removes a format the server has no business guessing at.
 *
 *  ── WHY RE-ENCODING IS NOW ALLOWED, WITH A MEASUREMENT ─────────────────
 *
 *  This file used to upload the untouched original, deliberately: a Canvas JPEG
 *  export uses 4:2:0 chroma subsampling, averaging colour over 2×2 blocks —
 *  noise injected into the one variable this product sells. That reasoning was
 *  right and it does not survive contact with the numbers. The same synthetic
 *  garment, measured end to end:
 *
 *      uploaded untouched (8.6 MB)            #ad2b35
 *      canvas → 2048 px, JPEG 4:2:0           #ad2b35
 *      canvas → 1600 px, JPEG 4:2:0           #ad2b35
 *      canvas → 1280 px, JPEG 4:2:0           #ad2b35
 *
 *  Identical, to the byte. The server downsamples to 256 px before measuring
 *  anything, so it is already averaging 8×8 neighbourhoods — a 2×2 chroma
 *  average underneath that changes nothing. The cost is zero and the benefit is
 *  that the photo arrives at all.
 *
 *  ⚠️ SMALL FILES ARE STILL PASSED THROUGH UNTOUCHED. There is no reason to
 *     re-encode something that already fits, and every re-encode is a chance to
 *     be wrong.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Images } from 'lucide-react';
import { FramingGuide, type GuideKind } from './FramingGuide';

interface Props {
  /** Called with the picked file. The parent owns what happens next. */
  onSelect: (file: File) => void;
  /** Button text before a photo is taken. */
  label: string;
  /** One line telling the user how to frame the shot. Framing is everything. */
  hint?: string;
  /** `user` for selfies, `environment` for garments. */
  facing?: 'user' | 'environment';
  /** Which framing diagram to show. Omit for none. */
  guide?: GuideKind;
  disabled?: boolean;
}

/**
 * Comfortably under Vercel's ~4.5 MB request limit, with room for the
 * multipart envelope and for JPEG being unpredictable on detailed photos.
 */
const MAX_UPLOAD_BYTES = 3_000_000;
/** Far more resolution than the engine's 520 px floor or our 256 px measure. */
const MAX_EDGE = 2048;

/**
 * The fallback decoder, for browsers whose `createImageBitmap` refuses the
 * orientation option. An `<img>` applies the EXIF rotation while rendering, so
 * drawing it produces upright pixels without us parsing any metadata.
 */
async function drawViaImgElement(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img) return null;

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink a photo until it will actually arrive. Untouched if it already fits. */
async function prepareForUpload(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES && !/hei[cf]/i.test(file.type)) return file;

  /**
   * ⚠️⚠️ `imageOrientation: 'from-image'` IS NOT OPTIONAL, AND LEAVING IT OUT
   *      BROKE THE SELFIE ON A REAL PHONE.
   *
   *  Phone cameras rarely rotate pixels: they store the sensor readout as-is
   *  and note the rotation in an EXIF tag, leaving whoever opens the file to
   *  apply it. The server does exactly that, with `sharp().rotate()`.
   *
   *  But drawing through a canvas STRIPS EXIF. So a portrait photo decoded
   *  without honouring the tag comes out sideways AND arrives with the tag that
   *  would have fixed it deleted — `rotate()` then has nothing to act on. The
   *  server's careful handling was being defeated one step upstream.
   *
   *  It showed up as "the gallery does not work on the selfie", and the shape
   *  of that report is the tell: a face turned 90° fails detection outright,
   *  while a garment's COLOUR does not care which way up it is. Same bug, only
   *  visible on one screen.
   *
   *  Chrome defaulted this to 'none' for years, so it is passed explicitly
   *  rather than trusted.
   */
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Either the browser cannot decode this format, or it is old enough to
    // reject the option. An <img> element applies EXIF orientation when it
    // renders, so it is both the fallback and the check.
    const viaImg = await drawViaImgElement(file);
    if (viaImg) return viaImg;
    // Nothing worked. Send the original and let the server produce a real
    // error rather than failing silently here.
    return file;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    // Step the quality down only if the first attempt is still too heavy — a
    // detailed photo compresses far worse than a flat one.
    for (const quality of [0.92, 0.8, 0.65]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
      );
      if (!blob) break;
      if (blob.size <= MAX_UPLOAD_BYTES || quality === 0.65) {
        return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      }
    }
    return file;
  } finally {
    // Frees the decoded bitmap even when the canvas work threw, which on a
    // phone already short of memory is exactly when it matters.
    bitmap.close();
  }
}

export function CameraInput({
  onSelect,
  label,
  hint,
  facing = 'environment',
  guide,
  disabled,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Only a touch device distinguishes "camera" from "gallery". */
  const [handheld, setHandheld] = useState(false);

  useEffect(() => {
    setHandheld(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Object URLs leak until revoked, and this component can be used repeatedly.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    // Reset immediately so picking the SAME file again still fires a change.
    e.target.value = '';
    if (!picked) return;

    setBusy(true);
    try {
      /**
       * ⚠️ THE SHRINK MUST NEVER SWALLOW THE PHOTO. Only `createImageBitmap`
       *    was guarded here, and everything after it — `getContext`,
       *    `drawImage`, `toBlob` — can throw on a phone that runs out of memory
       *    decoding a 108 MP image, or refuses a canvas that size. When it did,
       *    the rejection escaped `handleChange` entirely: the spinner stopped,
       *    no error appeared, and the photo simply never went anywhere.
       *
       *    "Nothing happens" is the worst outcome this component can produce,
       *    because it leaves the person with no idea whether to wait, retry, or
       *    give up. Any failure to shrink now sends the ORIGINAL instead — the
       *    server may well cope, and if it does not it answers with something
       *    the screen can say out loud.
       */
      let file = picked;
      try {
        file = await prepareForUpload(picked);
      } catch (e) {
        console.error('[capture] could not shrink the photo, sending it as taken', e);
      }
      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(file));
      onSelect(file);
    } finally {
      setBusy(false);
    }
  }

  const buttonClass =
    'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold disabled:opacity-50';

  return (
    <div className="w-full">
      {guide && !preview && <FramingGuide kind={guide} />}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture={facing}
        onChange={handleChange}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />
      {/*
        ⚠️ The SAME input without `capture` is what offers the gallery. It is not
        a duplicate: with the attribute a phone opens the camera and nothing
        else, without it the OS shows its picker — camera, gallery, files.
      */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
      />

      {preview && (
        // next/image cannot optimise a blob: URL — this is a local preview of a
        // photo taken one second ago that never leaves the device.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="The photo you just chose"
          className="mb-3 w-full rounded-xl border-2 border-slate-300 object-cover"
        />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || busy}
          className={`${buttonClass} bg-slate-900 text-white`}
        >
          {preview ? <RefreshCw size={18} aria-hidden /> : <Camera size={18} aria-hidden />}
          {busy ? 'Preparing…' : preview ? 'Retake' : handheld ? 'Take a photo' : label}
        </button>

        {handheld && (
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={disabled || busy}
            className={`${buttonClass} border-2 border-slate-300 text-slate-800`}
          >
            <Images size={18} aria-hidden />
            Gallery
          </button>
        )}
      </div>

      {hint && <p className="mt-2 text-sm text-slate-600">{hint}</p>}
    </div>
  );
}
