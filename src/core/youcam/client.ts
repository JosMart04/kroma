/**
 * Cliente YouCam — la única puerta a la API.
 * ⛔ PROPIETARIO: P1. Todos consumen `youcam`. Nadie llama a fetch() directamente.
 *
 * Con YOUCAM_MOCK=true devuelve fixtures y NO consume unidades.
 * P2, P3 y P4 desarrollan casi siempre en modo mock.
 */
import { YOUCAM_BASE_URL, ENDPOINTS, IS_MOCK } from './config';
import { pollTask, downloadResult } from './poll';
import { YouCamError } from './errors';
import * as mock from './mock';

async function startTask(path: string, body: unknown, apiKey?: string): Promise<string> {
  const key = apiKey ?? process.env.YOUCAM_API_KEY;
  const res = await fetch(`${YOUCAM_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || !json?.data?.task_id) {
    throw new YouCamError(
      json?.error_code ?? json?.error ?? 'unknown_internal_error',
      path,
      undefined,
      // The readable half of the response, which used to be discarded.
      typeof json?.error === 'string' ? json.error : JSON.stringify(json)?.slice(0, 300),
    );
  }
  return json.data.task_id as string;
}

export interface FitzpatrickResult { fitzpatrick: 1|2|3|4|5|6 }

export interface SkinToneResult {
  skin_color: string; eye_color: string; eye_color_name: string;
  eyebrow_color: string; lip_color: string;
  hair_color: string; hair_color_name: string;
}

/**
 * 🔑 THE ENGINE GRADES ITS OWN INPUT, AND THAT IS A GIFT.
 *
 * `skin-tone-analysis` returns this next to the colours. It is exactly what the
 * confidence layer needs — most importantly `lighting` — so we do not have to
 * infer capture quality from the pixels ourselves. Discovered by reading a real
 * response, not the documentation, which does not mention it.
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
 * Envoltorio de una tarea ya completada. Se declara SOLO el trozo que
 * consumimos: la respuesta trae más campos, pero tipar los que no leemos sería
 * inventar contrato. `pollTask` ya devuelve `json.data`, así que esto es su forma.
 */
interface TaskWith<R> {
  results: R;
}

/** Las tareas que producen imagen devuelven una URL que CADUCA A LAS 2 HORAS. */
type TaskWithUrl = TaskWith<{ url: string }>;

/**
 * ⚠️ `version` es OBLIGATORIO en fitzpatrick y NO aparece en los ejemplos.
 * Omitirlo da 400 «version is required but wasn't included in your request».
 * Verificado el 13-ago-2026: "1.0" es aceptado; un valor cualquiera responde
 * «version is not one of the accepted values».
 */
const FITZPATRICK_VERSION = '1.0';

/**
 * ⚠️ EL FOTOTIPO LLEGA COMO NÚMERO ROMANO EN UNA CADENA: "III", no 3.
 * Verificado contra la API real. Nuestro contrato usa 1–6, así que se traduce
 * con una tabla explícita — nada de parsear a ojo.
 */
const FITZPATRICK_ROMAN: Record<string, FitzpatrickResult['fitzpatrick']> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6,
};

function romanToFitzpatrick(v: string | undefined): FitzpatrickResult['fitzpatrick'] {
  const n = v ? FITZPATRICK_ROMAN[v.trim().toUpperCase()] : undefined;
  if (!n) {
    // No inventamos un fototipo: III es el valor central y se registra el fallo.
    console.error(`[youcam] fitzpatrick_scale inesperado: ${JSON.stringify(v)}. Se usa III.`);
    return 3;
  }
  return n;
}

export const youcam = {
  /** Fototipo I–VI. */
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
   * Tono facial completo. UNA llamada devuelve piel, ojos, cejas, labios Y PELO,
   * con NOMBRES además de hex. El pelo sale gratis aquí: no hagas otra llamada.
   */
  async skinTone(srcFileId: string): Promise<SkinToneFull> {
    if (IS_MOCK) return mock.skinTone();
    const id = await startTask(ENDPOINTS.skinTone, { src_file_id: srcFileId });
    const d = await pollTask<TaskWith<{ color: SkinToneResult; face_quality?: FaceQuality }>>(
      ENDPOINTS.skinTone,
      id,
    );
    return { color: d.results.color, faceQuality: d.results.face_quality ?? null };
  },

  /**
   * Skin analysis.
   *
   * ⚠️ THE RESPONSE IS AN ARRAY, NOT A MAP — verified against the live API on
   *    2026-08-15, and this cost us a silent wrong answer. It comes back as
   *    `results.output: [{ type: 'redness', raw_score, ui_score }, …]`, not as
   *    `results.redness`. Reading it the documented way yielded `undefined`,
   *    which a `?? 0` default then turned into "worst possible redness" — on an
   *    inverted scale, the most alarming value there is. Exactly the kind of
   *    confident falsehood our user cannot catch.
   *
   *    The array also carries `all` and `skin_age` entries for free.
   *
   * ⚠️ SD and HD concerns cannot be mixed in one request: all SD or all HD.
   * ⚠️ HD concerns need a bigger image than our 1280 px engine format —
   *    `hd_redness` returns `error_below_min_image_size` on it.
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
      TaskWith<{ output?: Array<{ type?: string; raw_score?: number; ui_score?: number }> }>
    >(ENDPOINTS.skinAnalysis, id, 'skinAnalysis');

    const out: SkinAnalysisResult = {};
    for (const item of d.results.output ?? []) {
      // Entries without a raw_score ('all', 'skin_age', 'resize_image') are not
      // concern measurements and must not be presented as one.
      if (item.type && typeof item.raw_score === 'number') {
        out[item.type] = { raw_score: item.raw_score, ui_score: item.ui_score ?? 0 };
      }
    }
    return out;
  },

  /**
   * Try-on de ropa. Devuelve el BINARIO ya descargado, no la URL (caduca en 2h).
   *
   * ⚠️⚠️ `outerwear` NO EXISTE. Verificado contra la API el 13-ago-2026 con una
   * clave válida: de los seis valores que documentábamos, cinco responden 200 y
   * **`outerwear` es el único que devuelve 400** «garment_category is not one of
   * the accepted values».
   *
   * ⚠️ CORREGIDO EL 17-AGO-2026: el nombre documentado estaba mal, la capacidad
   *    existe. El esquema de la herramienta MCP publica el enum real y trae un
   *    sexto valor que la documentación REST no nombra:
   *
   *      full_body · lower_body · upper_body · shoes · auto · **outer**
   *
   *    Confirmado también en REST, sin gastar unidades: con un `file_id`
   *    inválido, `outer` responde con el error genérico de parámetros —o sea,
   *    el enum lo acepta— mientras que `outerwear` responde «garment_category
   *    is not one of the accepted values». Una chaqueta ya se renderiza como
   *    chaqueta; ver `tryOnCategory.ts`.
   */
  async clothTryOn(opts: {
    srcFileId: string; refFileId: string;
    garmentCategory?: 'full_body'|'upper_body'|'lower_body'|'shoes'|'auto'|'outer';
  }): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const id = await startTask(ENDPOINTS.cloth, {
      src_file_id: opts.srcFileId,
      ref_file_id: opts.refFileId,
      garment_category: opts.garmentCategory ?? 'auto',
    });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.cloth, id, 'cloth');
    return downloadResult(d.results.url);
  },

  /**
   * Bufanda o gorro.
   * ⚠️ TRAMPA 9: `gender` es OBLIGATORIO y no aparece en los ejemplos
   *    genéricos de la documentación. Omitirlo da un error poco claro.
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

  /** Normaliza la iluminación ANTES de medir. Es la base de la capa de confianza (F4). */
  async normalizeLighting(srcFileId: string): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const id = await startTask(ENDPOINTS.lighting, { src_file_id: srcFileId });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.lighting, id);
    return downloadResult(d.results.url);
  },

  /** Aísla la prenda para poder medir su color sin contaminación del fondo. */
  async removeBackground(srcFileId: string): Promise<Buffer> {
    if (IS_MOCK) return mock.tryOnImage();
    const id = await startTask(ENDPOINTS.bgRemoval, { src_file_id: srcFileId });
    const d = await pollTask<TaskWithUrl>(ENDPOINTS.bgRemoval, id);
    return downloadResult(d.results.url);
  },

  /**
   * Coste real por función.
   * 💡 NO ESTIMÉIS EL COSTE: MEDIDLO. Llamad a esto el día 13, volcad la
   *    respuesta a una tabla del README y presentad la economía unitaria como
   *    dato MEDIDO. Ataca directamente el «does the code reflect genuine
   *    effort» del criterio 1, y cuesta una llamada.
   */
  async featureCost(): Promise<unknown> {
    const res = await fetch(`${YOUCAM_BASE_URL}${ENDPOINTS.featureCost}`, {
      headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}` },
    });
    return res.json();
  },

  /** Borrado con recursos asociados. Barato de implementar, alto valor en Design. */
  async deleteTask(taskId: string): Promise<void> {
    await fetch(`${YOUCAM_BASE_URL}${ENDPOINTS.deleteTask}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
    });
  },
};
