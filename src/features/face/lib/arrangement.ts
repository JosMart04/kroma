/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ETAPA A — PUNTUACIÓN DEL ORDENAMIENTO (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P2.
 *
 *  Entra la permutación que produjo el usuario. Sale qué observador sintético
 *  la explica mejor. Comparación de modelos pura: ninguna constante clínica
 *  escrita a mano — ver la cabecera de `observer.ts` para el porqué.
 */
import type { CVDType } from '@/core/contracts/types';
import { deltaE, hexToLab } from '@/core/color';
import { CAPS, CAP_COUNT } from './caps';
import {
  allHypotheses,
  NORMAL_HYPOTHESIS,
  predictedOrder,
  type Hypothesis,
} from './observer';

export interface RankedHypothesis {
  hypothesis: Hypothesis;
  /** Distancia de permutación al ordenamiento predicho. Menos = mejor ajuste. */
  footrule: number;
}

export interface ArrangementResult {
  best: Hypothesis;
  runnerUp: Hypothesis | null;
  /** Separación entre la mejor hipótesis y la mejor de OTRO tipo, normalizada 0–1. */
  margin: number;
  /** ΔE acumulado del recorrido del usuario, en visión normal. */
  userCost: number;
  /** ΔE acumulado del recorrido ideal. El suelo teórico. */
  normalCost: number;
  /** userCost / normalCost. 1 = perfecto. Alto = cruzó el círculo. */
  errorIndex: number;
  ranked: RankedHypothesis[];
}

/**
 * El otro sentido de giro del mismo recorrido.
 *
 * El círculo de tono no tiene principio ni final: recorrerlo en sentido
 * horario o antihorario son las dos respuestas correctas. Sin esto, la mitad
 * de los usuarios sanos saldrían diagnosticados por haber girado al revés.
 * La referencia se queda fija en la cabeza; se invierte solo la cola.
 */
function mirror(order: number[]): number[] {
  return [order[0], ...order.slice(1).reverse()];
}

/** Posición de cada muestra dentro de un ordenamiento. */
function positions(order: number[]): number[] {
  const pos = new Array<number>(CAP_COUNT);
  order.forEach((cap, i) => {
    pos[cap] = i;
  });
  return pos;
}

/** Footrule de Spearman: suma de desplazamientos de cada muestra. */
function footrule(a: number[], b: number[]): number {
  const pa = positions(a);
  const pb = positions(b);
  let sum = 0;
  for (let i = 0; i < CAP_COUNT; i++) sum += Math.abs(pa[i] - pb[i]);
  return sum;
}

/** Footrule invariante al sentido de giro. */
function ringFootrule(user: number[], predicted: number[]): number {
  return Math.min(footrule(user, predicted), footrule(user, mirror(predicted)));
}

/** ΔE acumulado de recorrer las muestras en este orden, en VISIÓN NORMAL. */
function pathCost(order: number[]): number {
  const labs = CAPS.map((cap) => hexToLab(cap.hex));
  let sum = 0;
  for (let i = 0; i < order.length - 1; i++) {
    sum += deltaE(labs[order[i]], labs[order[i + 1]]);
  }
  return sum;
}

/**
 * Cuánto tiene que ganarle una hipótesis de daltonismo a la normalidad antes
 * de que se lo digamos al usuario.
 *
 * 🔑 NO ES UN NÚMERO ELEGIDO A DEDO. Es el punto medio entre el ordenamiento
 *    que predice la visión normal y el de la deficiencia más leve que el
 *    modelo SEPARA DE VERDAD. Regla del clasificador por punto medio: para
 *    llamarte daltónico, tu ordenamiento tiene que parecerse más al de un
 *    daltónico que al de un observador normal.
 *
 * ⚠️ EL FILTRO `> 0` NO ES COSMÉTICO, Y COSTÓ UN FALLO REAL.
 *    En las severidades más bajas Machado deforma tan poco que el recorrido
 *    predicho es IDÉNTICO al de la visión normal, así que su distancia es 0.
 *    Tomar el mínimo sin filtrar daba un margen de 0, y con eso cualquier
 *    empate se resolvía a favor del daltonismo: un ordenamiento perfecto salía
 *    diagnosticado. Nos interesa la deficiencia más leve DISTINGUIBLE, que es
 *    otra cosa que la más leve representable.
 *
 *    Decir "puede que tengas una deficiencia" a alguien que no la tiene es un
 *    daño real, y esta es la única decisión de producto del fichero. Por eso
 *    está aquí, con nombre, y no escondida dentro de una comparación.
 */
function normalMargin(): number {
  const normalOrder = predictedOrder(NORMAL_HYPOTHESIS);
  const gaps = allHypotheses()
    .filter((h) => h.type !== 'normal')
    .map((h) => ringFootrule(normalOrder, predictedOrder(h)))
    .filter((gap) => gap > 0);
  return gaps.length > 0 ? Math.min(...gaps) / 2 : Infinity;
}

let _margin: number | null = null;
export function getNormalMargin(): number {
  _margin ??= normalMargin();
  return _margin;
}

/** Footrule máximo posible, para normalizar márgenes a 0–1. */
const MAX_FOOTRULE = Math.floor((CAP_COUNT * CAP_COUNT) / 2);

export function scoreArrangement(userOrder: number[]): ArrangementResult {
  if (userOrder.length !== CAP_COUNT || new Set(userOrder).size !== CAP_COUNT) {
    throw new Error(
      `[face/arrangement] Se esperaba una permutación de ${CAP_COUNT} muestras, ` +
        `llegaron ${userOrder.length} (${new Set(userOrder).size} distintas).`,
    );
  }

  const ranked: RankedHypothesis[] = allHypotheses()
    .map((hypothesis) => ({
      hypothesis,
      footrule: ringFootrule(userOrder, predictedOrder(hypothesis)),
    }))
    // Empates → menor severidad. La hipótesis más simple gana, que es lo que
    // impide que el ruido se lea como un diagnóstico.
    .sort((a, b) => a.footrule - b.footrule || a.hypothesis.severity - b.hypothesis.severity);

  const normalFit = ranked.find((r) => r.hypothesis.type === 'normal')!;
  const bestDeficiency = ranked.find((r) => r.hypothesis.type !== 'normal')!;

  // Estrictamente mayor: en un empate gana la normalidad. Es la asimetría
  // deliberada — el coste de decirle a alguien sano que quizá es daltónico es
  // mayor que el de quedarnos cortos, porque la etapa B todavía puede corregir.
  const beatsNormal = normalFit.footrule - bestDeficiency.footrule > getNormalMargin();
  const winner = beatsNormal ? bestDeficiency : normalFit;

  // El competidor relevante es el mejor de OTRO tipo: saber que deután 0,5 va
  // por delante de deután 0,6 no dice nada sobre si el diagnóstico es firme.
  const runnerUp =
    ranked.find((r) => r.hypothesis.type !== winner.hypothesis.type) ?? null;

  const margin = runnerUp
    ? Math.min(1, Math.abs(runnerUp.footrule - winner.footrule) / (MAX_FOOTRULE / 4))
    : 1;

  const normalCost = pathCost(predictedOrder(NORMAL_HYPOTHESIS));
  const userCost = pathCost(userOrder);

  return {
    best: winner.hypothesis,
    runnerUp: runnerUp?.hypothesis ?? null,
    margin,
    userCost,
    normalCost,
    errorIndex: userCost / normalCost,
    ranked,
  };
}

/** Mejor ajuste por cada eje. Para el panel de diagnóstico. */
export function bestPerType(ranked: RankedHypothesis[]): Record<CVDType, RankedHypothesis> {
  const out = {} as Record<CVDType, RankedHypothesis>;
  for (const r of ranked) {
    if (!out[r.hypothesis.type]) out[r.hypothesis.type] = r;
  }
  return out;
}
