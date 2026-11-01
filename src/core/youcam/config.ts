/** ⛔ PROPIETARIO: P1. Configuración y constantes verificadas de la API. */

export const YOUCAM_BASE_URL =
  process.env.YOUCAM_BASE_URL ?? 'https://yce-api-01.makeupar.com';

export const IS_MOCK = process.env.YOUCAM_MOCK !== 'false';

/**
 * ⚠️ RUTAS VERIFICADAS contra la documentación oficial el 12-ago-2026 (v1.14.2).
 *
 * OJO CON `cloth-v4`: un borrador interno afirmaba que había que usar
 * `/task/cloth`. Es FALSO y seguirlo degrada silenciosamente al motor V2.0,
 * perdiendo `outerwear` y el modo `auto`. La documentación dice literalmente
 * «Use the AI Task API (/s2s/v2.0/task/cloth-v4)».
 *   /task/cloth     → motor V2.0 (antiguo)
 *   /task/cloth-v3  → motor V3.0
 *   /task/cloth-v4  → motor V4.0  ← ESTE
 */
export const ENDPOINTS = {
  file: '/s2s/v2.0/file',
  featureCost: '/s2s/v2.0/credit/feature-cost',
  deleteTask: '/s2s/v2.0/task/delete',

  fitzpatrick: '/s2s/v2.0/task/fitzpatrick-scale-analyzer',
  skinTone: '/s2s/v2.0/task/skin-tone-analysis',
  skinAnalysis: '/s2s/v2.1/task/skin-analysis',
  cloth: '/s2s/v2.0/task/cloth-v4',
  scarf: '/s2s/v2.0/task/scarf',
  hat: '/s2s/v2.0/task/hat',

  // ⚠️ CORREGIDAS EL 13-AGO-2026 CONTRA LA API REAL, NO CONTRA LA DOCUMENTACIÓN.
  //    Las rutas anteriores devolvían 404 NotFound con una clave válida:
  //      lighting   /task/photo-lighting      → 404   ahora /task/lighting
  //      bgRemoval  /task/background-removal  → 404   ahora /task/sod
  //    Ambas confirmadas dos veces: aparecen en /credit/feature-cost como
  //    "AI Photo Lighting V2.0" y "AI Photo Background Removal V1.0", y al
  //    sondearlas responden 400 InvalidParameters (existen y son accesibles).
  //
  //    🔴 `lighting` es la que normaliza la iluminación ANTES de medir, o sea
  //       la base de la capa de confianza (F4). Estaba apuntando a un 404: la
  //       tesis del producto entero no habría funcionado nunca contra la API.
  lighting: '/s2s/v2.0/task/lighting',
  bgRemoval: '/s2s/v2.0/task/sod',
} as const;

/**
 * ⚠️ SIN RESOLVER: la ruta de maquillaje.
 *
 * `/s2s/v2.0/task/makeup` devuelve **404 NotFound**, y "makeup" no aparece en
 * ninguno de los 20 SKUs de /credit/feature-cost. No se pone una ruta a ojo:
 * hay que sacarla de la documentación oficial. Afecta a F15/F16 (P2).
 *
 * Mientras tanto, `youcam.applyMakeup()` no existe y nadie debe asumir que sí.
 */
export const MAKEUP_ENDPOINT_UNRESOLVED = true;

export type FeatureKey = keyof typeof ENDPOINTS;

/**
 * Política de sondeo por endpoint.
 * skin-analysis retiene el resultado 24 h y admite intervalos flexibles;
 * el try-on conviene sondearlo con backoff más agresivo.
 */
export const POLL_POLICY: Record<string, { first: number; factor: number; max: number; deadlineMs: number }> = {
  default:        { first: 2000, factor: 1.6, max: 15000, deadlineMs: 180_000 },
  skinAnalysis:   { first: 3000, factor: 1.5, max: 20000, deadlineMs: 120_000 },
  cloth:          { first: 2000, factor: 1.6, max: 15000, deadlineMs: 240_000 },
};

/**
 * ⚠️ 250 peticiones / 300 s POR IP **y** POR TOKEN. Ambas a la vez.
 * Con 4 personas desde la misma red, el límite por IP salta ANTES que el de
 * token, y el síntoma —429 aparentemente aleatorio— se atribuye por error al
 * código. Crítico durante la carga masiva del armario.
 */
export const RATE_LIMIT = { requests: 250, windowSeconds: 300, recommendedQps: 5 } as const;

/** ⚠️ La URL de descarga del resultado CADUCA A LAS 2 HORAS. */
export const RESULT_URL_TTL_MS = 2 * 60 * 60 * 1000;
