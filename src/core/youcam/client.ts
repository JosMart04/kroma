/**
 * YouCam client — the only door to the API.
 * ⛔ OWNER: core. Everyone consumes `youcam`. Nobody calls fetch() on the API directly.
 *
 * With YOUCAM_MOCK=true it returns fixtures and spends NO units.
 */
import { YOUCAM_BASE_URL, ENDPOINTS, IS_MOCK } from './config';
import { pollTask, downloadResult, retryAfterMs } from './poll';
import { YouCamError } from './errors';
import { remainingBudget, ANSWER_MARGIN_MS } from './budget';
import * as mock from './mock';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How many times a 429 on task creation is retried before giving up. */
const MAX_RATE_LIMIT_RETRIES = 2;

async function startTask(path: string, body: unknown, apiKey?: string): Promise<string> {
  const key = apiKey ?? process.env.YOUCAM_API_KEY;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${YOUCAM_BASE_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    /**
     * ⚠️ A 429 IS RETRIED, BOUNDED BY THE REQUEST'S TIME BUDGET. The limit is per
     *    token, and the token is shared by every visitor, so a burst from other
     *    people can reject a perfectly valid request. Backing off briefly
     *    usually clears it; if it does not, the user is told the service is
     *    busy — not that their photo is wrong.
     */
    if (res.status === 429) {
      const wait = retryAfterMs(res, 1500 * (attempt + 1));
      const fits = remainingBudget() - ANSWER_MARGIN_MS > wait;
      if (attempt < MAX_RATE_LIMIT_RETRIES && fits) {
        await sleep(wait);
        continue;
      }
      throw new YouCamError('RateLimited', path, undefined, `429 after ${attempt + 1} attempt(s)`);
    }

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.data?.task_id) {
      throw new YouCamError(
        json?.error_code ?? (typeof json?.error === 'string' ? json.error : 'unknown_internal_error'),
        path,
        undefined,
        // The readable half of the response — the part that names the bad field.
        typeof json?.error === 'string' ? json.error : JSON.stringify(json)?.slice(0, 300),
      );
    }
    return json.data.task_id as string;
  }
}

/** Phototype I–VI as 1–6, or null when the engine returned something else. */
export interface FitzpatrickResult { fitzpatrick: 1|2|3|4|5|6|null }

export interface SkinToneResult {
  skin_color: string; eye_color: string; eye_color_name: string;
  eyebrow_color: string; lip_color: string;
  /**
   * ⚠️ NOT A MEASUREMENT. The documented schema declares `hair_color` as an
   *    enum of seven preset hex values — it is the swatch of a hair CATEGORY,
   *    unlike skin, eyes, brows and lips, which are free hex values. It can
   *    also be missing while `hair_color_name` is present.
   */
  hair_color?: string;
  hair_color_name: string;
}

/**
 * 🔑 THE ENGINE GRADES ITS OWN INPUT.
 *
 * `skin-tone-analysis` returns this next to the colours. It is exactly what the
 * confidence layer needs — most importantly `lighting` — so capture quality is
 * not inferred from the pixels by guesswork. Documented as `face_quality`.
 *
 * Values observed in the wild: "good". Anything else is treated as a warning.
 */
export interface FaceQuality {
  has_face: boolean;
  /** Is the face large enough in frame. */
  area: string;
  /** Is it facing the camera. */
  frontal: string;
  /** ⚠️ The one that matters: is there enough, even light to measure colour. */
  lighting: string;
  faceangle: string;
}

export interface SkinToneFull {
  color: SkinToneResult;
  faceQuality: FaceQuality | null;
}
export interface SkinAnalysisResult {
  [concern: string]: { raw_score: number; ui_score: number } | undefined;
}

/**
 * How far the head may be turned before the colour analyser refuses the photo.
 *
 *   strict   pitch ≤ 4°, yaw ≤ 6°, roll ≤ 4°
 *   high     ≤ 10° on every axis   ← the documented default
 *   medium   ≤ 15°
 *   low      ≤ 20°
 *   flexible ≤ 30°
 *
 * ⚠️ ALWAYS SENT EXPLICITLY. The MCP schema of the same tool declares its
 *    default as `null` while its own description says "high", and the two
 *    transports have returned visibly different iris colours for one image.
 *    Pinning the level removes one possible cause of that disagreement.
 */
export type StrictnessLevel = 'strict' | 'high' | 'medium' | 'low' | 'flexible';
export const DEFAULT_STRICTNESS: StrictnessLevel = 'high';

/** Values `cloth-v4` accepts for its multi-person filter. */
export type MultiPersonFilter = 'off' | 'normal' | 'strict';

/**
 * One concealer effect for `makeup-vto`. Only the category this product uses is
 * typed; the engine accepts thirteen.
 */
export interface ConcealerEffect {
  category: 'concealer';
  palettes: Array<{
    color: string;
    colorIntensity: number;
    colorUnderEyeIntensity: number;
    coverageLevel: number;
  }>;
}

/**
 * The wrapper of a finished task. Only the part we consume is declared: the
 * response carries more fields, and typing the ones we never read would be
 * inventing contract. `pollTask` already returns `json.data`, so this is its shape.
 */
interface TaskWith<R> {
  results: R;
}

/** Image-producing tasks return a URL that EXPIRES AFTER 2 HOURS. */
type TaskWithUrl = TaskWith<{ url: string }>;

/**
 * ⚠️ `version` is REQUIRED by fitzpatrick even though the docs call it a default.
 * Omitting it returns 400 "version is required but wasn't included in your
 * request". "1.0" is the only accepted value.
 */
const FITZPATRICK_VERSION = '1.0';

/**
 * ⚠️ THE PHOTOTYPE ARRIVES AS A ROMAN NUMERAL IN A STRING: "III", not 3.
 * The contract uses 1–6, so it is translated through an explicit table.
 */
const FITZPATRICK_ROMAN: Record<string, 1|2|3|4|5|6> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
};

function romanToFitzpatrick(v: string | undefined): FitzpatrickResult['fitzpatrick'] {
  const n = v ? FITZPATRICK_ROMAN[v.trim().toUpperCase()] : undefined;
  if (!n) {
    /**
     * ⚠️ NULL, NOT A GUESS. Returning the middle value (III) for an answer we
     *    could not read would hand the screen a phototype nobody measured —
     *    and redness is interpreted against it. Null is shown as "not measured".
     */
    console.error(`[youcam] unexpected fitzpatrick_scale: ${JSON.stringify(v)}; reported as unmeasured.`);
    return null;
  }
  return n;
}

export const youcam = {
  /** Phototype I–VI. */
  async fitzpatrick(srcFileId: string): Promise<FitzpatrickResult> {
    if (IS_MOCK) return mock.fitzpatrick();
    const id = await startTask(ENDPOINTS.fitzpatrick, {
      src_file_id: srcFileId,
      version: FITZPATRICK_VERSION,
    });
    const d = await pollTask<{ results?: { fitzpatrick_scale?: string } }>(
      ENDPOINTS.fitzpatrick,
      id,
    );
    return { fitzpatrick: romanToFitzpatrick(d.results?.fitzpatrick_scale) };
  },

  /**
   * Full facial colour. ONE call returns skin, eyes, brows, lips AND hair, with
   * NAMES as well as hex. Hair comes free here: do not make another call.
   */
  async skinTone(
    srcFileId: string,
    opts: { strictness?: StrictnessLevel } = {},
  ): Promise<SkinToneFull> {
    if (IS_MOCK) return mock.skinTone();
    const id = await startTask(ENDPOINTS.skinTone, {
      src_file_id: srcFileId,
      face_angle_strictness_level: opts.strictness ?? DEFAULT_STRICTNESS,
    });
    const d = await pollTask<TaskWith<{ color: SkinToneResult; face_quality?: FaceQuality }>>(
      ENDPOINTS.skinTone,
      id,
    );
    return { color: d.results.color, faceQuality: d.results.face_quality ?? null };
  },

  /**
   * Skin analysis.
   *
   * ⚠️ THE RESPONSE IS AN ARRAY, NOT A MAP: `results.output: [{ type, region?,
   *    raw_score, ui_score }, …]` with `format: 'json'`. Reading it as
   *    `results.redness` yields `undefined`, which a `?? 0` default turns into
   *    "worst possible redness" — on an inverted scale, the most alarming value
   *    there is.
   *
   * ⚠️ SOME CONCERNS COME BACK ONCE PER REGION (`hd_pore`, `hd_wrinkle`,
   *    `skin_type`: forehead, nose, t_zone…). Keyed by type alone, the regions
   *    overwrite each other and the survivor is whichever came last. Whole-face
   *    entries keep the plain `type` key; regional ones become `type:region`.
   *
   * ⚠️ SD and HD concerns cannot be mixed in one request: all SD or all HD.
   * ⚠️ HD concerns need a short side of at least 1080 px. Our engine format is
   *    capped at 1600 px on the LONG side, so most portrait photos are below
   *    that — this product requests SD concerns only.
   * ⚠️ 1 to 4 SD concerns cost the same 9 units. Asking for one is not cheaper.
   * ⚠️ ALWAYS use raw_score, never ui_score (see contracts/types.ts).
   */
  async skinAnalysis(srcFileId: string, concerns: string[]): Promise<SkinAnalysisResult> {
    if (IS_MOCK) return mock.skinAnalysis(concerns);
    const hd = concerns.filter((c) => c.startsWith('hd_'));
    if (hd.length && hd.length !== concerns.length) {
      throw new Error('SD and HD concerns cannot be mixed in one skin-analysis request.');
    }
    const id = await startTask(ENDPOINTS.skinAnalysis, {
      src_file_id: srcFileId, dst_actions: concerns, format: 'json',
    });
    const d = await pollTask<
      TaskWith<{
        output?: Array<{ type?: string; region?: string; raw_score?: number; ui_score?: number }>;
      }>
    >(ENDPOINTS.skinAnalysis, id, 'skinAnalysis');

    const out: SkinAnalysisResult = {};
    for (const item of d.results.output ?? []) {
      // Entries without a raw_score ('all', 'skin_age', 'resize_image') are not
      // concern measurements and must not be presented as one.
      if (!item.type || typeof item.raw_score !== 'number') continue;
      const key = item.region && item.region !== 'whole' ? `${item.type}:${item.region}` : item.type;
      out[key] = { raw_score: item.raw_score, ui_score: item.ui_score ?? 0 };
    }
    return out;
  },

  /**
   * Clothes try-on. Returns the DOWNLOADED BINARY, not the URL (it dies in 2 h).
   *
   * ⚠️ THE OUTERWEAR VALUE IS SPELLED `outer`. `outerwear` returns 400
   *    "garment_category is not one of the accepted values". Accepted:
   *    full_body · upper_body · lower_body · shoes · auto · outer.
   *
   * ⚠️ `filter_multi_person` DEFAULTS TO `off`, which means "use the largest
   *    person in the frame" — so a friend standing next to you can be the one
   *    dressed. `normal` rejects a comparable second person and ignores distant,
   *    blurry ones, answering `error_multi_person`. That is the behaviour a
   *    try-on of YOUR wardrobe needs.
   *
   * ⚠️ LOWER-BODY TRY-ON NEEDS A WORN PHOTO. The documented reference spec says
   *    trousers and skirts are supported only as "actual worn outfits, not
   *    standalone product images".
   */
  async clothTryOn(opts: {
    srcFileId: string; refFileId: string;
    garmentCategory?: 'full_body'|'upper_body'|'lower_body'|'shoes'|'auto'|'outer';
    multiPerson?: MultiPersonFilter;
  }): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const id = await startTask(ENDPOINTS.cloth, {
      src_file_id: opts.srcFileId,
      ref_file_id: opts.refFileId,
      garment_category: opts.garmentCategory ?? 'auto',
      filter_multi_person: opts.multiPerson ?? 'normal',
    });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.cloth, id, 'cloth');
    return downloadResult(d.results.url);
  },

  /**
   * Scarf or hat.
   *
   * ⚠️ `gender` IS REQUIRED and absent from the generic examples. Omitting it
   *    produces an unclear error.
   *
   * ⚠️ THESE ENGINES RESTYLE THE WHOLE PICTURE. Their `style` parameter
   *    "controls outfit and background style" and defaults to `random`; there
   *    is no value that keeps the original outfit. So the colours around the
   *    accessory are invented by design, and nothing measured may be read off
   *    this render.
   */
  async accessoryTryOn(opts: {
    kind: 'scarf' | 'hat'; srcFileId: string; refFileId: string;
    gender: 'male' | 'female';
  }): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const path = opts.kind === 'scarf' ? ENDPOINTS.scarf : ENDPOINTS.hat;
    const id = await startTask(path, {
      src_file_id: opts.srcFileId, ref_file_id: opts.refFileId, gender: opts.gender,
    });
    const d = await pollTask<TaskWithUrl>(path, id);
    return downloadResult(d.results.url);
  },

  /**
   * F16 · Render makeup effects onto a face. Returns the downloaded binary.
   *
   * ⚠️ SIZE: long side under 1920 px, and the documented error also names a
   *    1080 px height cap. Callers send `MAKEUP_LONG_EDGE` from `upload.ts`,
   *    which satisfies both in any orientation.
   */
  async makeupVto(opts: { srcFileId: string; effects: ConcealerEffect[] }): Promise<Buffer> {
    if (IS_MOCK) return mock.makeupVto();
    const id = await startTask(ENDPOINTS.makeupVto, {
      src_file_id: opts.srcFileId,
      version: '1.0',
      effects: opts.effects,
    });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.makeupVto, id);
    return downloadResult(d.results.url);
  },

  /** Normalises the light BEFORE measuring. The basis of the confidence layer (F4). */
  async normalizeLighting(srcFileId: string): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const id = await startTask(ENDPOINTS.lighting, { src_file_id: srcFileId });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.lighting, id);
    return downloadResult(d.results.url);
  },

  /** Isolates the garment so its colour is measured without the background. */
  async removeBackground(srcFileId: string): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const id = await startTask(ENDPOINTS.bgRemoval, { src_file_id: srcFileId });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.bgRemoval, id);
    return downloadResult(d.results.url);
  },

  /**
   * The real cost of every feature. Free to call.
   *
   * ⚠️ PAGINATED, 20 SKUs PER PAGE AT MOST. The first page is a plausible,
   *    complete-looking list that contains none of the Skin AI or try-on SKUs.
   *    Every page is followed until `next_token` is null.
   */
  async featureCost(): Promise<Array<Record<string, unknown>>> {
    if (IS_MOCK) return mock.featureCost();
    const skus: Array<Record<string, unknown>> = [];
    let token: string | null = null;
    for (let page = 0; page < 50; page++) {
      const url = new URL(`${YOUCAM_BASE_URL}${ENDPOINTS.featureCost}`);
      url.searchParams.set('page_size', '20');
      if (token) url.searchParams.set('starting_token', token);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}` },
      });
      const json = await res.json();
      skus.push(...(json?.result?.skus ?? []));
      token = json?.result?.next_token ?? null;
      if (!token) break;
    }
    return skus;
  },

  /** Units left on the key, summed across every unit bundle. Free to call. */
  async credits(): Promise<number> {
    if (IS_MOCK) return mock.credits();
    const res = await fetch(`${YOUCAM_BASE_URL}${ENDPOINTS.credits}`, {
      headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}` },
    });
    const json = await res.json();
    const rows: Array<{ amount_dec?: number; amount?: number }> = json?.results ?? [];
    return rows.reduce((sum, r) => sum + (r.amount_dec ?? r.amount ?? 0), 0);
  },

  /** Deletes a finished task with its input and output files. */
  async deleteTask(taskId: string): Promise<void> {
    await fetch(`${YOUCAM_BASE_URL}${ENDPOINTS.deleteTask}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
  },
};
