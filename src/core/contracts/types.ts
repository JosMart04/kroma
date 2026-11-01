/**
 * ══════════════════════════════════════════════════════════════════════════
 *  CONTRATOS — LA FRONTERA ENTRE LAS CUATRO REBANADAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P1 (núcleo). Nadie más edita este fichero.
 *  🔒 CONGELADO: 13 de agosto, 14:00.
 *
 *  Después de esa hora, cambiar un tipo aquí rompe el trabajo de otras tres
 *  personas simultáneamente. Si necesitas un cambio: se lo pides a P1, P1
 *  decide, P1 lo hace y avisa en el canal del equipo. No lo edites tú aunque
 *  sea "un campo de nada".
 *
 *  Todo lo que cruza una frontera de rebanada pasa por aquí.
 *  Lo que es interno a tu rebanada NO tiene que estar en este fichero.
 */

// ─────────────────────────────────────────────────────────────────────────
//  BLOQUE A · Perfil perceptual del usuario
// ─────────────────────────────────────────────────────────────────────────

/** Los tres ejes de confusión soportados. Acromatopsia queda fuera de alcance. */
export type CVDType = 'protan' | 'deutan' | 'tritan' | 'normal';

/**
 * Perfil del usuario. Producto de F1 (calibración).
 * TODO el sistema calcula contra esto: sin perfil no hay veredicto posible.
 */
export interface CVDProfile {
  type: CVDType;
  /** 0.0 = visión normal · 1.0 = dicromacia completa. La mayoría cae en 0.3–0.7. */
  severity: number;
  source: 'calibrated' | 'self_reported';
  /** Cómo de concluyente fue el test. 0–1. Por debajo de 0.5, sugerir repetir. */
  confidence: number;
  calibratedAt: string; // ISO 8601
}

// ─────────────────────────────────────────────────────────────────────────
//  Capa de confianza — atraviesa TODAS las mediciones
// ─────────────────────────────────────────────────────────────────────────

/**
 * 'measured'  → la medición es fiable, se puede mostrar
 * 'low_light' → se muestra, pero degradada y con aviso visible
 * 'refuse'    → NO SE MUESTRA. Pantalla de negativa. Esto no es un error:
 *               es una función del producto.
 */
export type ConfidenceLevel = 'measured' | 'low_light' | 'refuse';

export interface MeasurementConfidence {
  level: ConfidenceLevel;
  /**
   * Shift between the raw reading and the light-normalised one. High = the
   * light is lying.
   *
   * ⚠️ NULL MEANS THE CHECK NEVER RAN, and it is not interchangeable with 0.
   * Zero is a verified result: we looked and the light was honest. Null is the
   * absence of a result, and reporting it as 0 would show a perfect-confidence
   * badge for a measurement nobody checked.
   */
  lightingDeltaE: number | null;
  /** Actionable text for the user when level !== 'measured'. Null when fine. */
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOQUE A · Retrato cromático — la paleta FIJA del usuario
// ─────────────────────────────────────────────────────────────────────────

export type FitzpatrickType = 1 | 2 | 3 | 4 | 5 | 6;

/** Valores exactos que devuelve AI_Facial_Color_Tones_Analyzer. No inventar otros. */
export type EyeColorName = 'Amber' | 'Brown' | 'Green' | 'Blue' | 'Gray' | 'Other';
export type HairColorName = 'Auburn' | 'Black' | 'Blonde' | 'Brown' | 'Grey/White' | 'Red';

/**
 * Producto de F2. Es la paleta que el usuario lleva puesta SIEMPRE.
 * El semáforo de F11 debe considerarla como un elemento más del conjunto:
 * una camisa no compite solo contra el pantalón, también contra la piel y el pelo.
 */
export interface ColorPortrait {
  /**
   * ⚠️ NULL MEANS THE PHOTOTYPE WAS NOT MEASURED, and it must be shown as such.
   * It used to be required, so one failing call out of five destroyed an
   * otherwise perfect portrait. Redness is uninterpretable without it, which is
   * a reason to SAY it is missing — never a reason to invent one.
   */
  fitzpatrick: FitzpatrickType | null;

  skinHex: string;
  eyeHex: string;
  eyeName: EyeColorName;
  eyebrowHex: string;
  lipHex: string;
  hairHex: string;
  hairName: HairColorName;

  /**
   * ⚠️ raw_score, NEVER ui_score. The official documentation admits ui_score is
   * inflated upwards as a "psychological motivator". This whole product rests
   * on the user being unable to detect us flattering them, so the raw value is
   * not optional.
   *
   * ⚠️ INVERTED SCALE: higher = BETTER condition. 72 is not "72% redness".
   *
   * ⚠️ `null` means WE DID NOT MEASURE IT, and it must be shown as such. It was
   *    a plain `number` until the API returned no redness entry and a `?? 0`
   *    default turned that into 0 — the most alarming value on an inverted
   *    scale. A type that cannot say "unknown" forces a lie at the first gap.
   */
  rednessRaw: number | null;

  confidence: MeasurementConfidence;
  measuredAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOQUE B · Armario
// ─────────────────────────────────────────────────────────────────────────

/**
 * Categorías. Solo algunas tienen VTO en la API — ver `CATEGORIES_WITH_VTO`.
 * Las que no lo tienen ENTRAN IGUAL en el armario y en el veredicto:
 * cinturón contra zapatos y corbata contra camisa son los puntos de choque
 * más citados en la investigación, y ninguno de los dos tiene render.
 */
export type GarmentCategory =
  | 'top' | 'bottom' | 'outerwear' | 'dress'
  | 'shoes' | 'scarf' | 'hat' | 'bag'
  | 'belt' | 'tie' | 'socks' | 'other';

/** Coordenadas CIELAB. Sobre esto corre TODA la matemática del proyecto. */
export type Lab = readonly [L: number, a: number, b: number];

export interface Garment {
  id: string;
  userId: string;
  imageUrl: string;
  category: GarmentCategory;

  colorHex: string;
  colorLab: Lab;
  /** Nombre en lenguaje natural: "verde oliva", "azul marino". */
  colorName: string;

  /** Si es estampada, el color dominante es orientativo: hay que avisarlo. */
  isPatterned: boolean;

  /**
   * ⚠️ Una prenda medida con 'low_light' contamina TODAS las combinaciones
   * futuras en las que participe. El semáforo debe degradar su veredicto.
   */
  confidence: MeasurementConfidence;

  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────
//  Veredicto — el corazón del producto
// ─────────────────────────────────────────────────────────────────────────

export type Verdict = 'safe' | 'risky' | 'clash';

export interface PairVerdict {
  verdict: Verdict;

  /** Distancia perceptual en visión normal. */
  deltaENormal: number;
  /** Distancia perceptual en el espacio simulado del usuario. Esto es lo que importa. */
  deltaESimulated: number;
  /** Ratio de contraste de luminancia, estilo WCAG. */
  luminanceContrast: number;

  /**
   * 🔑 LA REGLA QUE NOS DIFERENCIA.
   * true cuando el par colisiona en TONO pero se distingue por CLARIDAD.
   * La luminosidad es el canal que sobrevive al daltonismo. Marcar estos casos
   * como colisión genera falsas alarmas constantes y destruye la confianza.
   */
  savedByLuminance: boolean;

  /** El porqué, en lengua del usuario. Nunca números crudos en la interfaz. */
  explanation: string;
}

/** Producto de F8. Se calcula al vuelo, NO se persiste. */
export interface ColorFamily {
  id: number;
  garmentIds: string[];
  representativeHex: string;
  /** Separación mínima dentro de la familia, en el espacio del usuario. */
  minInternalDeltaE: number;
}

/** Producto de F9. */
/**
 * F9 · "You may already own this."
 *
 * ⚠️ TWO DIFFERENT WARNINGS LIVE HERE AND THEY MUST NOT BE MERGED, because the
 *    advice differs and one of them can embarrass the user.
 *
 *    · `same_colour` — the two garments really are the same colour, and anyone
 *      would agree. Safe to say out loud: "you already own this."
 *    · `indistinguishable` — they are genuinely DIFFERENT colours that this
 *      person cannot separate. Telling them "you already own this navy" when
 *      the new one is dark green would be wrong, and someone with normal vision
 *      would contradict us in front of them. The honest sentence is that they
 *      will not be able to tell the two apart.
 *
 *    Collapsing them into one message was the shape of the original type, and
 *    it would have made us confidently wrong in the case our user can least
 *    afford.
 */
export type DuplicateKind = 'same_colour' | 'indistinguishable';

export interface DuplicateAlert {
  newGarmentId: string;
  collidesWith: Array<{
    garmentId: string;
    colorName: string;
    kind: DuplicateKind;
    /** Distance between the measured colours. Small = the same colour. */
    deltaEReal: number;
    /**
     * Distance as THIS person sees them. Small = they cannot be separated.
     *
     * ⚠️ Null when there is no calibrated profile yet, and it must never be
     * rendered as a number in that case. "Not computed" is not "computed and
     * zero" — zero would claim the two are identical to them, which is the
     * strongest statement this type can make and one we have not earned.
     */
    deltaESimulated: number | null;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOQUE C · Decisión de compra — la salida que cierra el demo
// ─────────────────────────────────────────────────────────────────────────

export interface GarmentAnalysis {
  garment: Garment;
  /** "Combina con el 62% de tu armario". Esta cifra es el argumento de retail. */
  compatibilityPercent: number;
  worksWith: Garment[];
  clashesWith: Garment[];
  /** Binario ya descargado a NUESTRO storage. Nunca la URL de YouCam: caduca en 2h. */
  vtoImageUrl: string | null;
  /** Veredicto contra la paleta fija de F2 (piel, ojos, pelo). */
  verdictVsPortrait: PairVerdict;
}

// ─────────────────────────────────────────────────────────────────────────
//  BLOQUE D · Maquillaje
// ─────────────────────────────────────────────────────────────────────────

export interface CorrectorRecommendation {
  /** "verde menta", "verde oliva", "melocotón" — depende del fototipo. */
  color: string;
  colorHex: string;
  reason: string;
  rednessLevel: 'none' | 'mild' | 'marked';
}

/** Producto de F16. El número que ningún otro proyecto de la galería puede producir. */
export interface CorrectionResult {
  rednessBefore: number;
  rednessAfter: number;
  delta: number;
  correctorUsed: string;
  neutralized: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
//  Constantes compartidas
// ─────────────────────────────────────────────────────────────────────────

/**
 * Categorías con VTO real en la API. El resto entra en la lógica, sin render.
 *
 * ⚠️ CORRECCIÓN DEL 13-AGO-2026, POSTERIOR AL CONGELADO. Se anunció en el canal.
 *
 * `'outerwear'` estaba aquí y **se ha quitado**: no es un `garment_category`
 * válido de `cloth-v4`. Enumerados los seis valores documentados contra la API
 * con una clave real, cinco responden 200 y **outerwear es el único que
 * devuelve 400** «garment_category is not one of the accepted values».
 *
 * Se rompió el congelado a propósito y con coste cero: en el momento del cambio
 * NINGÚN fichero importaba esta constante. Dejarla habría hecho que P4
 * construyera el try-on de la chaqueta contra una categoría que la API rechaza,
 * y se habría descubierto el día 15 con el vídeo a medio grabar.
 *
 * ⚠️ NO CONFUNDIR CON `GarmentCategory`: ahí `'outerwear'` **sigue siendo
 * válido**. Una chaqueta es una prenda de abrigo en nuestro armario; lo que no
 * existe es como parámetro de la API. Para el try-on de una chaqueta se manda
 * `upper_body` o `auto`.
 */
export const CATEGORIES_WITH_VTO: readonly GarmentCategory[] = [
  'top', 'bottom', 'dress', 'shoes', 'scarf', 'hat', 'bag',
] as const;

/**
 * Estas cuatro exigen el parámetro `gender` explícito, que NO aparece en los
 * ejemplos genéricos de la documentación. Omitirlo da un error poco claro.
 */
export const CATEGORIES_REQUIRING_GENDER: readonly GarmentCategory[] = [
  'shoes', 'scarf', 'hat', 'bag',
] as const;

/** Umbral práctico de colisión de tono, en ΔE sobre el espacio simulado. */
export const COLLISION_THRESHOLD_DELTA_E = 11;

/** Por debajo de esto, dos prendas son "casi la misma" → alerta de duplicado (F9). */
export const DUPLICATE_THRESHOLD_DELTA_E = 5;

/** Contraste de luminancia por encima del cual un par se salva pese a colisionar en tono. */
export const LUMINANCE_RESCUE_THRESHOLD = 1.8;
