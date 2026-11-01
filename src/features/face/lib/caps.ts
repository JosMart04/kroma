/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MUESTRAS DEL TEST DE ORDENAMIENTO (F1) — estilo Farnsworth D-15
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P2.
 *
 *  16 muestras repartidas por el círculo de tono a CLARIDAD Y CROMA
 *  CONSTANTES. Esa constancia no es una preferencia estética: es la única
 *  razón por la que el test mide algo.
 *
 *  🔑 SI LA CLARIDAD VARÍA, EL TEST NO MIDE NADA.
 *     La luminosidad es el canal que sobrevive al daltonismo — es justo lo
 *     que dice `srgb.ts` sobre `contrastRatio`. Si las muestras difieren en
 *     claridad, el usuario las ordena por claridad, le sale perfecto, y
 *     habremos medido su visión acromática en vez de su eje de confusión.
 *     Por el mismo motivo el croma es único para todas: si cada muestra
 *     llevara el suyo, la saturación sería otra pista de rescate.
 *
 *  🚫 No se usan las fichas del test original: son un producto comercial con
 *     especificación Munsell propia. El PROCEDIMIENTO (ordenar por similitud
 *     partiendo de una referencia) no es obra de nadie; las muestras las
 *     generamos nosotros en CIELAB. Mismo motivo por el que están prohibidas
 *     las láminas de Ishihara.
 *
 *  Se usa el modo `lch` de culori, que es CIELAB D50 — el MISMO espacio que
 *  `converter('lab')` de `@/core/color/deltae`. Mezclar D50 y D65 metería un
 *  sesgo silencioso en todas las distancias.
 */
import { converter, formatHex, inGamut, type Lch } from 'culori';

/** 1 referencia fija + 15 móviles, como el D-15. */
export const CAP_COUNT = 16;

/**
 * Claridad de todas las muestras. Media, para dejar sitio al croma por arriba
 * y por abajo sin salirse del gamut en ningún tono.
 */
export const CAP_LIGHTNESS = 55;

/** Croma de partida. Se baja hasta que las 16 quepan en sRGB (ver `solveChroma`). */
const START_CHROMA = 38;

/** Por debajo de esto las muestras son casi grises y el test deja de discriminar. */
const MIN_CHROMA = 12;

const toRgb = converter('rgb');
const toLch = converter('lch');
const rgbInGamut = inGamut('rgb');

export interface Cap {
  /** Índice estable 0–15. Es también la etiqueta que ve el usuario (+1). */
  index: number;
  hex: string;
  /** Tono en grados, para depuración y para el panel de diagnóstico. */
  hue: number;
}

function ringAtChroma(chroma: number): Lch[] {
  return Array.from({ length: CAP_COUNT }, (_, i) => ({
    mode: 'lch' as const,
    l: CAP_LIGHTNESS,
    c: chroma,
    h: (i * 360) / CAP_COUNT,
  }));
}

/**
 * El croma más alto (en pasos de 1) con el que las 16 muestras caben en sRGB.
 *
 * Se busca en vez de fijarlo porque el gamut de sRGB no es un cilindro: a
 * L*=55 el amarillo-verde admite mucho más croma que el azul. Hay que ir al
 * mínimo común, o unas muestras saldrían recortadas y su tono se desplazaría
 * — precisamente el error que arruinaría la medida.
 */
function solveChroma(): number {
  for (let c = START_CHROMA; c >= MIN_CHROMA; c -= 1) {
    if (ringAtChroma(c).every((color) => rgbInGamut(color))) return c;
  }
  throw new Error(
    `[face/caps] No hay croma en [${MIN_CHROMA}, ${START_CHROMA}] que meta las ` +
      `${CAP_COUNT} muestras en sRGB a L*=${CAP_LIGHTNESS}. Revisa CAP_LIGHTNESS.`,
  );
}

export const CAP_CHROMA = solveChroma();

/**
 * Las muestras del test. Deterministas: mismo código, mismos colores, siempre.
 * Un test que cambiara de muestras entre ejecuciones no sería reproducible y
 * no podríamos grabar el vídeo dos veces igual.
 */
export const CAPS: readonly Cap[] = ringAtChroma(CAP_CHROMA).map((color, index) => ({
  index,
  hex: formatHex(color),
  hue: color.h ?? 0,
}));

/** La muestra de referencia, fija, desde la que arranca la cadena. */
export const REFERENCE_CAP = CAPS[0];

/** Las 15 que el usuario ordena. */
export const MOVABLE_CAPS: readonly Cap[] = CAPS.slice(1);

/**
 * Comprueba las invariantes que hacen válido el test, YA CUANTIZADAS a 8 bits.
 *
 * Se verifica sobre el hex final, no sobre el Lch teórico: entre el color
 * ideal y el que acaba en pantalla hay un redondeo a 8 bits por canal, y es el
 * de pantalla el que ve el usuario. Si el redondeo desalineara la claridad,
 * este test lo detecta.
 *
 * Falla ruidosamente, igual que `assertReady()` en el núcleo: es preferible
 * que la app no arranque a que mida mal en silencio, porque nuestro usuario no
 * puede detectar que las muestras estaban mal.
 */
export function assertCapsValid(): void {
  const back = CAPS.map((cap) => toLch(cap.hex));

  const missing = back.findIndex((c) => !c);
  if (missing >= 0) {
    throw new Error(`[face/caps] La muestra ${missing} no se pudo convertir de vuelta a Lch.`);
  }

  const ls = back.map((c) => c!.l);
  const cs = back.map((c) => c!.c);
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

  if (spread(ls) > 1) {
    throw new Error(
      `[face/caps] La claridad no es constante (rango ${spread(ls).toFixed(2)} L*). ` +
        `El usuario ordenaría por claridad y el test no mediría el eje de confusión.`,
    );
  }
  if (spread(cs) > 1) {
    throw new Error(
      `[face/caps] El croma no es constante (rango ${spread(cs).toFixed(2)}). ` +
        `La saturación se convertiría en una pista alternativa.`,
    );
  }
  const outOfGamut = CAPS.filter((cap) => !toRgb(cap.hex));
  if (outOfGamut.length) {
    throw new Error(`[face/caps] ${outOfGamut.length} muestras fuera de sRGB.`);
  }
}

assertCapsValid();
