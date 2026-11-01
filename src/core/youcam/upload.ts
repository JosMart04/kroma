/**
 * Subida de ficheros a YouCam — LA TRAMPA NÚMERO UNO.
 * ⛔ PROPIETARIO: P1. Todos consumen `uploadImage()`. Nadie reimplementa esto.
 */
import { YOUCAM_BASE_URL, ENDPOINTS } from './config';

/**
 * ⚠️⚠️ LEE ESTO ANTES DE TOCAR NADA ⚠️⚠️
 *
 * Llamar a la File API **NO SUBE EL FICHERO**. Solo devuelve una URL
 * pre-firmada de S3 que es el DESTINO. Hay que hacer un PUT a esa URL con el
 * binario. Si te saltas el PUT, la tarea posterior falla con
 * `500 unknown_internal_error` o `404 Not Found`, ninguno de los cuales dice
 * qué ha pasado.
 *
 * Es la primera hora perdida de todo equipo que integra esta API.
 * Por eso existe esta función: para que nadie del equipo la pierda.
 */
export async function uploadImage(
  buffer: Buffer,
  fileName: string,
  contentType = 'image/jpeg',
  apiKey = process.env.YOUCAM_API_KEY,
): Promise<string> {
  if (!apiKey) throw new Error('Falta YOUCAM_API_KEY');

  // ── Paso 1: pedir destino ────────────────────────────────────────────
  const initRes = await fetch(`${YOUCAM_BASE_URL}${ENDPOINTS.file}`, {
    method: 'POST',
    headers: {
      // ⚠️ el espacio tras "Bearer" es obligatorio
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ content_type: contentType, file_name: fileName, file_size: buffer.byteLength }],
    }),
  });

  if (!initRes.ok) throw new Error(`File API falló: ${initRes.status} ${await initRes.text()}`);

  const init = await initRes.json();
  const file = init?.data?.files?.[0];
  const fileId: string | undefined = file?.file_id;
  const req = file?.requests?.[0];
  if (!fileId || !req?.url) throw new Error('Respuesta inesperada de la File API');

  // ── Paso 2: SUBIR DE VERDAD ← el paso que todo el mundo olvida ───────
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
      `El PUT a S3 falló (${putRes.status}). Sin este paso la tarea dará ` +
        `unknown_internal_error y perderás una hora buscando en el sitio equivocado.`,
    );
  }

  return fileId;
}

/**
 * Prepara una imagen para el motor.
 *
 * ⚠️ TRES DETALLES QUE ROMPEN SI SE OMITEN:
 *
 * 1. `rotate()` sin argumentos — aplica la orientación EXIF y borra la etiqueta.
 *    ⚠️ SIN ESTO, TODA FOTO VERTICAL DE MÓVIL LLEGA GIRADA 90°. Las cámaras de
 *    teléfono casi nunca rotan los píxeles: guardan el sensor tal cual y anotan
 *    la orientación en EXIF, y quien lee el fichero es el que debe aplicarla.
 *    El motor no la aplica. El síntoma es `error_no_face` o `error_pose` sobre
 *    una foto que a ti se te ve perfecta en el visor de tu sistema —que sí lee
 *    el EXIF—, así que buscarías el fallo en el encuadre y no en el fichero,
 *    gastando unidades en cada intento.
 *    ⚠️ VA ANTES DE `resize`: si no, se redimensiona sobre el lado equivocado.
 *
 * 2. `flatten({background:'#FFFFFF'})` — AI_Photo_Background_Removal devuelve
 *    PNG con canal alfa, y cloth-v4 prefiere JPG con fondo neutro. Sin aplanar,
 *    el alfa se rasteriza a NEGRO y el try-on sale desastroso.
 *
 * 3. `chromaSubsampling: '4:4:4'` — el 4:2:0 por defecto promedia la
 *    crominancia en bloques de 2x2 píxeles. En una aplicación cuyo entregable
 *    ES EL COLOR MEDIDO, eso es meter ruido justo en la variable que vendemos.
 *    Cuesta un flag y es un párrafo del README.
 *
 * 🔒 De propina: sharp NO copia los metadatos salvo que se le pida
 *    (`withMetadata()`), así que la salida va sin EXIF. Eso elimina el GPS de
 *    las fotos de móvil, que es justo lo que no queremos publicar en un
 *    despliegue abierto al jurado. No añadas `withMetadata()` sin pensarlo.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SIZE SPEC, PER ENDPOINT, FROM THE DOCUMENTATION — 16 Aug 2026
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Perfect Corp's Playground resizes source images on the caller's behalf and
 *  says so; the docs are explicit that an integration must do it itself.
 *  ("Step 1: Resize your source image.") So it is worth writing down exactly
 *  what the five endpoints this app uses accept, rather than carrying one
 *  number nobody can trace:
 *
 *  | endpoint                    | short side | long side                    |
 *  |-----------------------------|------------|------------------------------|
 *  | Facial Color Tones Analyzer | ≥ 320      | ≤ 4096, downsized above 1080 |
 *  | Fitzpatrick Skin Type       | ≥ 320      | ≤ 4096                       |
 *  | Skin Analysis · SD concerns | ≥ 480      | resized above 2560           |
 *  | Skin Analysis · HD concerns | ≥ 1080     | resized above 2560           |
 *  | Photo Lighting              | —          | ≤ 4096                       |
 *
 *  All five: under 10 MB. Facial Color Tones and Fitzpatrick take **jpg only**,
 *  which is one more reason everything leaves here as JPEG.
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
/** Hard ceiling shared by every endpoint. Beyond it the task is rejected. */
const ENGINE_MAX_LONG_EDGE = 4096;
/** Documented limit for all five. We land two orders of magnitude below it. */
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
