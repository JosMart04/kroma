/**
 * ══════════════════════════════════════════════════════════════════════════
 *  OBSERVADORES SINTÉTICOS — de dónde sale el eje de confusión (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P2.
 *
 *  Puntuar un D-15 exige saber en qué dirección confunde los colores cada
 *  deficiencia. Eso son constantes publicadas (Vingrys & King-Smith, 1988).
 *
 *  🚫 NO LAS ESCRIBIMOS DE MEMORIA. Es exactamente el error que P1 estuvo a
 *     punto de cometer con las matrices: citar la fuente correcta y poner
 *     números plausibles pero inventados. Nuestro usuario no puede auditar el
 *     resultado, así que un eje mal puesto le daría un diagnóstico erróneo que
 *     no tendría forma de detectar.
 *
 *  💡 EN VEZ DE CITARLAS, LAS DERIVAMOS. Ya tenemos un modelo perceptual
 *     sellado: Machado 2009 en `matrices.generated.ts`, con SHA256 del origen
 *     y 11 pasos de severidad. Si simulamos las muestras con una hipótesis y
 *     ordenamos por proximidad EN ESE ESPACIO, obtenemos el ordenamiento que
 *     produciría un observador con ese perfil. El eje de confusión sale del
 *     modelo, no de nuestra memoria.
 *
 *     Ventaja de producto, no solo de honestidad: el motor que CALIBRA es el
 *     mismo que luego SIMULA lo que el usuario ve. Una sola fuente de verdad.
 */
import { converter, formatHex } from 'culori';
import type { CVDProfile, CVDType, Lab } from '@/core/contracts/types';
import { simulateHex, hexToLab, deltaE } from '@/core/color';
import { SEVERITY_STEPS } from '@/core/color/matrices';
import { CAPS, CAP_LIGHTNESS } from './caps';

const fromLab = converter('rgb');

/** El gris neutro de la etapa B va a la misma claridad que las muestras. */
export const NEUTRAL_LIGHTNESS = CAP_LIGHTNESS;

export interface Hypothesis {
  type: CVDType;
  severity: number;
}

export const NORMAL_HYPOTHESIS: Hypothesis = { type: 'normal', severity: 0 };

/** Los tres ejes que se miden. `normal` no es un eje: es la ausencia de todos. */
export type AxisKey = Exclude<CVDType, 'normal'>;
export const AXIS_KEYS: readonly AxisKey[] = ['protan', 'deutan', 'tritan'];

/**
 * Diferencia apenas perceptible, en CIEDE2000.
 *
 * ΔE2000 = 1 es la definición estándar del umbral de percepción — es el
 * propósito declarado de la métrica, no un valor que hayamos elegido nosotros.
 * Es la única constante externa de todo el test, y es una definición.
 */
export const JND_DELTA_E = 1.0;

export function labToHex(lab: Lab): string {
  return formatHex(fromLab({ mode: 'lab', l: lab[0], a: lab[1], b: lab[2] }));
}

/** Gris neutro desplazado (a*, b*) a la claridad del test, como hex. */
export function labOffsetHex(a: number, b: number): string {
  return labToHex([NEUTRAL_LIGHTNESS, a, b]);
}

/** `simulateHex` pide un perfil entero; solo mira `type` y `severity`. */
function asProfile(h: Hypothesis): CVDProfile {
  return {
    type: h.type,
    severity: h.severity,
    source: 'calibrated',
    confidence: 1,
    calibratedAt: '1970-01-01T00:00:00.000Z',
  };
}

/**
 * Las hipótesis que se ponen a competir.
 *
 * Son 3 deficiencias × 11 pasos, pero en `severity: 0` la matriz de Machado es
 * la identidad (lo verificó P1 al generarlas), así que las tres colapsan en el
 * mismo observador. Se cuenta una sola vez, como `normal` → 31 en total.
 */
export function allHypotheses(): Hypothesis[] {
  const deficiencies: Exclude<CVDType, 'normal'>[] = ['protan', 'deutan', 'tritan'];
  const out: Hypothesis[] = [NORMAL_HYPOTHESIS];
  for (const type of deficiencies) {
    for (const severity of SEVERITY_STEPS) {
      if (severity > 0) out.push({ type, severity });
    }
  }
  return out;
}

/** Las 16 muestras vistas por este observador, en Lab. Memoizado: se piden mucho. */
const simulatedCache = new Map<string, Lab[]>();

export function simulatedCaps(h: Hypothesis): Lab[] {
  const key = `${h.type}:${h.severity}`;
  let labs = simulatedCache.get(key);
  if (!labs) {
    const profile = asProfile(h);
    labs = CAPS.map((cap) => hexToLab(simulateHex(cap.hex, profile)));
    simulatedCache.set(key, labs);
  }
  return labs;
}

/**
 * El ordenamiento que produciría este observador: recorrido voraz del vecino
 * más cercano en SU espacio perceptual, arrancando en la referencia.
 *
 * Voraz y no óptimo a propósito. No estamos resolviendo el viajante: estamos
 * imitando lo que hace una persona, que mira la última ficha colocada y elige
 * la que más se le parece de las que quedan. El error característico del D-15
 * —cruzar el círculo por el eje ciego— sale precisamente de esa miopía.
 *
 * Determinista: los empates se rompen por índice menor.
 */
const orderCache = new Map<string, number[]>();

export function predictedOrder(h: Hypothesis): number[] {
  const key = `${h.type}:${h.severity}`;
  const hit = orderCache.get(key);
  if (hit) return hit;
  const computed = computeOrder(h);
  orderCache.set(key, computed);
  return computed;
}

function computeOrder(h: Hypothesis): number[] {
  const labs = simulatedCaps(h);
  const remaining = new Set(CAPS.map((c) => c.index).slice(1));
  const order = [0];
  let current = 0;

  while (remaining.size > 0) {
    let best = -1;
    let bestD = Infinity;
    for (const candidate of remaining) {
      const d = deltaE(labs[current], labs[candidate]);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = candidate;
      }
    }
    remaining.delete(best);
    order.push(best);
    current = best;
  }
  return order;
}

/**
 * El eje de confusión de una hipótesis, en grados sobre el plano a*b*.
 *
 * Se busca numéricamente la dirección en la que el modelo COMPRIME más: se
 * separan dos colores simétricos respecto al gris a lo largo de cada
 * dirección, se simulan, y se mira cuánta separación sobrevive. La dirección
 * en la que menos sobrevive es el eje ciego de ese observador.
 *
 * Lo usa la etapa B para poner la escalera sobre el eje que de verdad le
 * cuesta a este usuario, en vez de sobre un eje genérico.
 */
export function confusionAxisDeg(h: Hypothesis): number {
  if (h.type === 'normal' || h.severity <= 0) return 0;
  const profile = asProfile(h);
  const probe = 20;

  let bestDeg = 0;
  let bestSurviving = Infinity;
  for (let deg = 0; deg < 180; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    const a = probe * Math.cos(rad);
    const b = probe * Math.sin(rad);
    const surviving = deltaE(
      hexToLab(simulateHex(labOffsetHex(a, b), profile)),
      hexToLab(simulateHex(labOffsetHex(-a, -b), profile)),
    );
    if (surviving < bestSurviving) {
      bestSurviving = surviving;
      bestDeg = deg;
    }
  }
  return bestDeg;
}

/**
 * El eje de confusión de cada deficiencia, medido en su forma más pura
 * (severidad 1). Machado interpola hacia el dicrómata, así que la DIRECCIÓN
 * del eje es prácticamente la misma a cualquier severidad; lo que cambia es
 * cuánto comprime. Tomarlo en 1,0 da la estimación más limpia.
 */
const axisCache = new Map<AxisKey, number>();

export function axisOf(type: AxisKey): number {
  let deg = axisCache.get(type);
  if (deg === undefined) {
    deg = confusionAxisDeg({ type, severity: 1 });
    axisCache.set(type, deg);
  }
  return deg;
}

/**
 * ΔE que percibiría este observador entre el gris neutro y el mismo gris
 * desplazado `offset` unidades a lo largo de `axisDeg`.
 *
 * Es la función que convierte un umbral medido en una severidad: se busca la
 * severidad para la que este valor cae al JND. Ver `threshold.ts`.
 */
export function perceivedOffsetDeltaE(h: Hypothesis, axisDeg: number, offset: number): number {
  const profile = asProfile(h);
  const rad = (axisDeg * Math.PI) / 180;
  const a = offset * Math.cos(rad);
  const b = offset * Math.sin(rad);
  return deltaE(
    hexToLab(simulateHex(labOffsetHex(a, b), profile)),
    hexToLab(simulateHex(labOffsetHex(0, 0), profile)),
  );
}

/**
 * El umbral que MEDIRÍA un observador con este perfil sobre este eje: el
 * desplazamiento más pequeño que, ya deformado por su visión, sigue valiendo
 * un JND.
 *
 * Es la inversa de `perceivedOffsetDeltaE`, por bisección. La usan el arnés de
 * autoconsistencia (para simular sesiones completas) y la clasificación (para
 * saber qué diferencia entre ejes es esperable a cada severidad).
 */
const thresholdCache = new Map<string, number>();

export function predictedThreshold(h: Hypothesis, axisDeg: number): number {
  const key = `${h.type}:${h.severity}:${axisDeg}`;
  const hit = thresholdCache.get(key);
  if (hit !== undefined) return hit;
  const value = computeThreshold(h, axisDeg);
  thresholdCache.set(key, value);
  return value;
}

function computeThreshold(h: Hypothesis, axisDeg: number): number {
  let lo = 0;
  let hi = 60;
  if (perceivedOffsetDeltaE(h, axisDeg, hi) < JND_DELTA_E) return hi;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (perceivedOffsetDeltaE(h, axisDeg, mid) >= JND_DELTA_E) hi = mid;
    else lo = mid;
  }
  return hi;
}
