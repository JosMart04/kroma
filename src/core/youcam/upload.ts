/**
 * Uploading files to YouCam — TRAP NUMBER ONE.
 * ⛔ OWNER: core. Everyone consumes `uploadImage()`. Nobody reimplements it.
 */
import { YOUCAM_BASE_URL, ENDPOINTS } from './config';

/**
 * ⚠️⚠️ READ THIS BEFORE TOUCHING ANYTHING ⚠️⚠️
 *
 * Calling the File API **DOES NOT UPLOAD THE FILE**. It only returns a
 * pre-signed S3 URL, which is the DESTINATION. The binary must then be PUT to
 * that URL. Skip the PUT and the next task fails with
 * `500 unknown_internal_error` or a bare `404 Not Found`, neither of which says
 * what happened.
 *
 * It is the first hour every team integrating this API loses. This function
 * exists so nobody on the team loses it.
 */
export async function uploadImage(
  buffer: Buffer,
  fileName: string,
  contentType = 'image/jpeg',
  apiKey = process.env.YOUCAM_API_KEY,
): Promise<string> {
  if (!apiKey) throw new Error('YOUCAM_API_KEY is not set');

  // ── Step 1: ask for a destination ─────────────────────────────────────
  const initRes = await fetch(`${YOUCAM_BASE_URL}${ENDPOINTS.file}`, {
    method: 'POST',
    headers: {
      // ⚠️ the space after "Bearer" is mandatory
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ content_type: contentType, file_name: fileName, file_size: buffer.byteLength }],
    }),
  });

  if (!initRes.ok) throw new Error(`File API failed: ${initRes.status} ${await initRes.text()}`);

  const init = await initRes.json();
  const file = init?.data?.files?.[0];
  const fileId: string | undefined = file?.file_id;
  const req = file?.requests?.[0];
  if (!fileId || !req?.url) throw new Error('Unexpected response from the File API');

  // ── Step 2: ACTUALLY UPLOAD ← the step everybody forgets ─────────────
  const putRes = await fetch(req.url, {
    method: req.method ?? 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.byteLength),
      ...(req.headers ?? {}),
    },
    body: new Uint8Array(buffer),
  });

  if (!putRes.ok) {
    throw new Error(
      `The PUT to S3 failed (${putRes.status}). Without this step the task returns ` +
        `unknown_internal_error and you lose an hour looking in the wrong place.`,
    );
  }

  return fileId;
}

/**
 * Prepares an image for the engine.
 *
 * ⚠️ THREE DETAILS THAT BREAK THINGS IF LEFT OUT:
 *
 * 1. `rotate()` with no arguments — applies the EXIF orientation and drops the tag.
 *    ⚠️ WITHOUT IT, EVERY PORTRAIT PHONE PHOTO ARRIVES ROTATED 90°. Phone
 *    cameras rarely rotate the pixels: they store the sensor as-is and note the
 *    orientation in EXIF, and whoever reads the file must apply it. The engine
 *    does not. The symptom is `error_no_face` or `error_pose` on a photo that
 *    looks perfect in your own viewer — which does read EXIF — so you would
 *    look for the fault in the framing rather than the file, spending units on
 *    every attempt.
 *    ⚠️ IT GOES BEFORE `resize`: otherwise the wrong side gets resized.
 *
 * 2. `flatten({background:'#FFFFFF'})` — background removal returns a PNG with
 *    an alpha channel, and the try-on prefers JPG on a neutral background.
 *    Without flattening, alpha rasterises to BLACK and the try-on is a disaster.
 *
 * 3. `chromaSubsampling: '4:4:4'` — the default 4:2:0 averages chroma over
 *    2x2 pixel blocks. In an app whose deliverable IS THE MEASURED COLOUR, that
 *    injects noise into exactly the variable we sell. It costs one flag.
 *
 * 🔒 As a bonus: sharp does NOT copy metadata unless asked (`withMetadata()`),
 *    so the output carries no EXIF. That strips the GPS position from phone
 *    photos, which is exactly what a public deployment must not publish. Do not
 *    add `withMetadata()` without thinking about it.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SIZE SPEC, PER ENDPOINT, FROM THE DOCUMENTATION — read 31 Oct 2026
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Perfect Corp's Playground resizes source images on the caller's behalf and
 *  says so; the docs are explicit that an integration must do it itself.
 *  ("Step 1: Resize your source image.") So it is worth writing down exactly
 *  what the endpoints this app uses accept, rather than carrying one number
 *  nobody can trace:
 *
 *  | endpoint                    | short side | long side                       |
 *  |-----------------------------|------------|---------------------------------|
 *  | Facial Color Tones Analyzer | ≥ 320      | ≤ 4096, downsized above 1080    |
 *  | Fitzpatrick Skin Type       | ≥ 320      | ≤ 4096                          |
 *  | Skin Analysis · SD concerns | ≥ 480      | ≤ 2560 (resized above it)       |
 *  | Skin Analysis · HD concerns | ≥ 1080     | ≤ 2560 (resized above it)       |
 *  | Photo Lighting              | —          | ≤ 4096                          |
 *  | Makeup Virtual Try-On       | face ≥ 100 | < 1920, and height < 1080       |
 *
 *  All of them: under 10 MB. Fitzpatrick takes **jpg only**, which is one more
 *  reason everything leaves here as JPEG.
 *
 *  ⚠️ MAKEUP IS THE ONE ENDPOINT THE DEFAULT WINDOW DOES NOT FIT. A 1200×1600
 *     portrait breaks its height cap, so makeup callers pass
 *     `MAKEUP_LONG_EDGE` and get an image that fits in any orientation.
 *
 *  ⚠️ THE WINDOW BELOW SITS INSIDE ALL OF THEM ON PURPOSE. 520 clears the
 *     strictest floor we can hit (480, SD skincare) with margin; 1600 is far
 *     under every ceiling. The one line we would break is HD skincare's 1080
 *     short side — and we request only SD concerns, so we never meet it.
 *     If anyone ever adds an `hd_` concern, this constant has to move with it.
 *
 *  ⚠️ Sending MORE than 1600 buys nothing: the colour analyser downsizes
 *     anything over 1080 before it looks at it, so the extra pixels are thrown
 *     away after the user has paid for the upload on a phone connection.
 */
const MIN_SHORT_EDGE = 520;
/** Upper bound so uploads stay quick on a phone connection. */
const MAX_LONG_EDGE = 1600;
/**
 * Long edge for `makeup-vto`: under its 1080 px height cap with margin, so a
 * portrait and a landscape photo both fit. The short side (~800 px on a 3:4
 * photo) still clears every floor, including skin analysis's 480.
 */
export const MAKEUP_LONG_EDGE = 1072;
/** Hard ceiling shared by every endpoint. Beyond it the task is rejected. */
const ENGINE_MAX_LONG_EDGE = 4096;
/** Documented limit for every endpoint. We land two orders of magnitude below it. */
const MAX_BYTES = 10 * 1024 * 1024;

export async function toEngineJpeg(input: Buffer, longEdge = MAX_LONG_EDGE): Promise<Buffer> {
  const sharp = (await import('sharp')).default;

  /**
   * Apply EXIF orientation FIRST and materialise it, so the dimensions we then
   * reason about are the ones the engine will actually see. A portrait phone
   * photo reports landscape dimensions until this happens.
   *
   * ⚠️ THIS CAN NO LONGER BE THE ONLY PLACE ORIENTATION IS HANDLED, and the
   *    reason is worth knowing before touching either end. The browser now
   *    shrinks large photos before uploading, and drawing through a canvas
   *    STRIPS EXIF — so by the time a shrunk photo arrives here, `rotate()` has
   *    no tag left to act on. The client therefore decodes with
   *    `imageOrientation: 'from-image'` and hands us pixels that are already
   *    upright. Leaving that out shipped sideways selfies and `error_no_face`
   *    on photos that looked perfect in the phone's own gallery.
   *
   *    This call still matters: small photos are passed through untouched and
   *    arrive with their EXIF intact.
   */
  const upright = await sharp(input).rotate().toBuffer();
  const meta = await sharp(upright).metadata();

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  let pipeline = sharp(upright).flatten({ background: '#FFFFFF' });

  if (w && h) {
    const shortEdge = Math.min(w, h);
    const long = Math.max(w, h);

    /**
     * ⚠️ SMALL IMAGES ARE UPSCALED, NOT REJECTED — and this was a real failure.
     *
     * `withoutEnlargement: true` used to leave a small photo small, the engine
     * answered `error_below_min_image_size`, and the user got told their image
     * was too small. That is a terrible thing to say to someone evaluating the
     * app: they picked a perfectly ordinary photo and the product blamed them.
     *
     * Upscaling adds no detail, and it does not need to — the engine needs
     * enough pixels to run, and colour is carried by the values, not by the
     * resolution. Better a slightly soft image that measures than a crisp one
     * that refuses.
     */
    const minScale = MIN_SHORT_EDGE / shortEdge; // above 1 = must grow
    const maxScale = longEdge / long; // below 1 = should shrink

    let scale = 1;
    if (maxScale < 1) scale = maxScale;
    /**
     * The minimum is a hard floor and always wins. Without this, a wide crop
     * (say 3000x600) got shrunk to fit the long edge and landed at 320 on the
     * short side — under the limit, rejected by the engine, and the user blamed
     * for a photo that was perfectly usable. Exceeding the long-edge cap only
     * costs upload time; falling under the minimum costs the whole measurement.
     */
    if (minScale > scale) scale = minScale;
    /**
     * ⚠️ …BUT NOT PAST 4096, WHICH IS THE ONE LIMIT THAT IS NOT OURS.
     *
     * The rule above is "grow until the short side is legal", and on a very
     * wide image it grows the long side too. A 8000×400 panorama needed ×1.3
     * to reach the floor and came out 10400 px wide — past the documented
     * ceiling on every endpoint, so the task was rejected at the far end where
     * the reason is a bare code. Our own soft cap yields here; the engine's
     * does not.
     */
    if (long * scale > ENGINE_MAX_LONG_EDGE) scale = ENGINE_MAX_LONG_EDGE / long;

    if (scale !== 1) {
      pipeline = pipeline.resize({
        width: Math.round(w * scale),
        height: Math.round(h * scale),
        kernel: 'lanczos3',
      });
    }

    /**
     * Past a 7.9:1 ratio the two limits cannot both be met by scaling, so the
     * short side is PADDED WITH WHITE rather than left illegal.
     *
     * ⚠️ Padding, never cropping. A crop is the one operation that can remove
     *    the face — or half a garment — from the photograph the user chose, and
     *    it would do it silently. White is also what the flatten above already
     *    puts behind transparency, so it introduces no colour that is not
     *    already in the frame.
     */
    if (Math.round(shortEdge * scale) < MIN_SHORT_EDGE) {
      const outW = Math.round(w * scale);
      const outH = Math.round(h * scale);
      const padX = Math.max(0, MIN_SHORT_EDGE - outW);
      const padY = Math.max(0, MIN_SHORT_EDGE - outH);
      pipeline = pipeline.extend({
        left: Math.floor(padX / 2),
        right: Math.ceil(padX / 2),
        top: Math.floor(padY / 2),
        bottom: Math.ceil(padY / 2),
        background: '#FFFFFF',
      });
    }
  }

  const out = await pipeline.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  if (out.byteLength <= MAX_BYTES) return out;

  /**
   * ⚠️ THE 10 MB LIMIT IS CHECKED, NOT ASSUMED. At 1600 px a photo encodes to
   *    well under a megabyte, so this should never fire — but `longEdge` is a
   *    parameter, and the day someone raises it for a garment shot, a silent
   *    `exceed_max_filesize` from the engine is a far worse way to find out.
   *
   *    Quality drops before resolution does: chroma is what we measure, and
   *    fewer pixels of it costs more than slightly coarser blocks of it. 4:4:4
   *    stays regardless — averaging chroma is the one thing we never allow.
   */
  let last = out;
  for (const quality of [82, 72, 62]) {
    last = await pipeline.jpeg({ quality, chromaSubsampling: '4:4:4' }).toBuffer();
    if (last.byteLength <= MAX_BYTES) return last;
  }
  /**
   * Halving the long edge is the last resort, and it stops at twice the short
   * floor. Below that the floor takes over and the image would stop shrinking,
   * so recursing further would spin forever rather than fail.
   */
  if (longEdge > MIN_SHORT_EDGE * 2) return toEngineJpeg(input, Math.round(longEdge / 2));
  return last;
}

/**
 * Crop in on the middle of a photo, for ONE purpose: retrying a measurement the
 * engine refused because the face was too small in the frame.
 *
 * ⚠️ THIS IS A RETRY, NEVER A DEFAULT. Cropping is the operation that can
 *    silently remove the subject, so it only ever runs after the engine has
 *    explicitly said `error_src_face_too_small`, and if the cropped attempt
 *    fails too, the caller reports the ORIGINAL error — the accurate one —
 *    rather than whatever the crop provoked.
 *
 * ⚠️ IT CANNOT CHANGE A COLOUR. Cropping selects pixels; it does not alter
 *    them, and every score here is computed on the detected face region either
 *    way. That is the property that makes this safe to do behind the user's
 *    back, and it is why the same trick would NOT be acceptable for anything
 *    that averages over the frame.
 *
 * Keeping the central 70% raises the face-to-width ratio by about 1.4×, which
 * carries a face that filled 45% of the width over the 60% the skin analyser
 * requires. It is a heuristic about where people put their own face in a
 * selfie, not a measurement, and it is allowed to fail.
 */
export async function tightenFraming(input: Buffer, keep = 0.7): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return input;

  const cropW = Math.max(1, Math.round(w * keep));
  const cropH = Math.max(1, Math.round(h * keep));
  const cropped = await sharp(input)
    .extract({
      left: Math.round((w - cropW) / 2),
      /**
       * Biased upward, because a selfie is framed with headroom and none under
       * the chin: a centred crop takes the chin before it takes the hair.
       */
      top: Math.round((h - cropH) * 0.35),
      width: cropW,
      height: cropH,
    })
    .toBuffer();

  return toEngineJpeg(cropped);
}
