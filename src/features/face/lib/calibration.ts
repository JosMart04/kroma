/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F1 · CALIBRACIÓN — orquestación y perfil final
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P2.
 *
 *  Junta las dos etapas y produce el `CVDProfile` del que depende todo el
 *  resto del producto.
 *
 *  🔑 QUIÉN MANDA, Y POR QUÉ NO ES OBVIO.
 *
 *     La etapa B (umbrales en los tres ejes) es el instrumento PRIMARIO: mide
 *     a cualquier severidad. La etapa A (ordenamiento) solo separa
 *     severidades ≥ 0,9 — lo demostró el arnés de autoconsistencia, y es una
 *     propiedad conocida de los tests de ordenamiento, no un fallo nuestro.
 *
 *     Así que A no decide: CORROBORA. Cuando las dos coinciden, la confianza
 *     sube. Cuando A no ve nada y B sí, no es contradicción — es el punto
 *     ciego esperado de A, y la confianza no debe bajar por eso. Pero cuando A
 *     ve una deficiencia marcada y B no la encuentra, eso sí es una
 *     contradicción real y hay que decirlo.
 *
 *  ⚠️ La confianza NO es decorativa. El contrato dice que por debajo de 0,5 hay
 *     que sugerir repetir el test, y esa es la única defensa del usuario: no
 *     puede mirar el resultado y notar que está mal.
 */
import type { CVDProfile, CVDType } from '@/core/contracts/types';
import {
  AXIS_KEYS,
  allHypotheses,
  axisOf,
  predictedThreshold,
  type AxisKey,
  type Hypothesis,
} from './observer';
import type { ArrangementResult } from './arrangement';
import { severityFromThreshold, type ThresholdSet } from './threshold';

/** Severidad por debajo de la cual la etapa A es ciega, según el propio arnés. */
const ARRANGEMENT_BLIND_BELOW = 0.9;

/** Si una escalera no llegó a converger, la medida vale menos. */
const NON_CONVERGENCE_PENALTY = 0.75;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface AxisClassification {
  type: CVDType;
  severity: number;
  worstAxis: AxisKey;
  /** Umbral del peor eje dividido por la media de los otros dos. Informativo. */
  ratio: number;
  /** Referencia de ruido para ese cociente. Informativo. */
  boundary: number;
  /** Cuánto le gana el mejor candidato con deficiencia a la normalidad. */
  evidence: number;
  /** Dispersión relativa de las respuestas del usuario. El listón a superar. */
  noise: number;
}

/** Divide un triple de umbrales por su media: compara la FORMA, no la escala. */
function normalizeTriple(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return mean > 0 ? values.map((v) => v / mean) : values.map(() => 1);
}

/**
 * Clasifica a partir de los tres umbrales.
 *
 * 🔑 SE COMPARA EL PATRÓN COMPLETO, NO SOLO CUÁL ES EL PEOR.
 *
 *    Coger el eje de umbral más alto parecía lo natural, y el arnés demostró
 *    que no funciona: protán y deután confunden en direcciones casi iguales
 *    dentro de Lab, así que el máximo salta de uno a otro con nada de ruido y
 *    salían protanes clasificados como deutanes.
 *
 *    Lo que sí los separa es la FORMA de los tres umbrales a la vez: cuánto
 *    sube el rojo-verde RESPECTO al azul-amarillo es distinto en protán y en
 *    deután, aunque su eje peor sea casi el mismo. Así que se predice el
 *    triple de umbrales de cada hipótesis con el modelo y se busca el que
 *    mejor case con el medido — la misma comparación de modelos que en la
 *    etapa A, aplicada aquí.
 *
 * 🔑 Y EL LÍMITE DE DECISIÓN SALE DE LOS DATOS DEL PROPIO USUARIO, no de una
 *    tabla: hace falta que el mejor candidato con deficiencia le gane a la
 *    normalidad por más de lo que varían las propias respuestas del usuario.
 *    Quien contesta errático necesita más evidencia; quien contesta
 *    consistente, menos.
 */
export function classifyFromThresholds(thresholds: ThresholdSet): AxisClassification {
  const value = (k: AxisKey) => thresholds[k].threshold;
  const measured = normalizeTriple(AXIS_KEYS.map(value));

  const fit = (h: Hypothesis) => {
    const predicted = normalizeTriple(AXIS_KEYS.map((k) => predictedThreshold(h, axisOf(k))));
    return measured.reduce((acc, m, i) => acc + Math.abs(m - predicted[i]), 0);
  };

  const ranked = allHypotheses()
    .map((hypothesis) => ({ hypothesis, distance: fit(hypothesis) }))
    // Empates → menor severidad. La hipótesis más simple gana.
    .sort((a, b) => a.distance - b.distance || a.hypothesis.severity - b.hypothesis.severity);

  const normalFit = ranked.find((r) => r.hypothesis.type === 'normal')!;
  const bestDeficiency = ranked.find((r) => r.hypothesis.type !== 'normal')!;

  const relativeSpread = (k: AxisKey) =>
    value(k) > 0 ? thresholds[k].spread / value(k) : 1;
  const noise = Math.max(...AXIS_KEYS.map(relativeSpread));

  const worstAxis = AXIS_KEYS.reduce((a, b) => (value(b) > value(a) ? b : a));
  const others = AXIS_KEYS.filter((k) => k !== worstAxis);
  const baseline = others.reduce((acc, k) => acc + value(k), 0) / others.length;
  const ratio = baseline > 0 ? value(worstAxis) / baseline : 1;
  const boundary = 1 + noise;

  const evidence = normalFit.distance - bestDeficiency.distance;
  if (evidence <= noise) {
    return { type: 'normal', severity: 0, worstAxis, ratio, boundary, evidence, noise };
  }

  const type = bestDeficiency.hypothesis.type as AxisKey;
  return {
    type,
    severity: severityFromThreshold(type, axisOf(type), value(type)),
    worstAxis,
    ratio,
    boundary,
    evidence,
    noise,
  };
}

export interface CalibrationInput {
  arrangement: ArrangementResult;
  thresholds: ThresholdSet;
}

export interface CalibrationOutcome {
  profile: CVDProfile;
  /**
   * 🔑 FALSE = NO DAMOS RESULTADO. No es un error: es una función del producto.
   *
   * Si las escaleras no convergieron o se fueron al techo, no hemos medido
   * nada — da igual lo que salga del clasificador. `CLAUDE.md` lo dice para
   * las mediciones ópticas y vale igual aquí: nuestro usuario no puede
   * detectar que le hemos dado un número inventado, así que preferimos no
   * dárselo. La interfaz enseña una negativa, no un diagnóstico.
   */
  measurable: boolean;
  detail: {
    typeFromArrangement: CVDType;
    severityFromArrangement: number;
    typeFromThresholds: CVDType;
    severityFromThresholds: number;
    ratio: number;
    boundary: number;
    agreement: number;
    evidence: number;
    consistency: number;
    errorIndex: number;
    /**
     * ⚠️ WHY the refusal fired, per axis, and it is not a diagnostic luxury.
     * "I could not measure it" was a dead end for the person taking the test
     * AND for whoever had to fix it: a tester with normal colour vision was
     * refused repeatedly and neither of us could say which axis gave up. A
     * refusal that cannot be acted on teaches nobody anything.
     */
    axes: Array<{ axis: AxisKey; converged: boolean; saturated: boolean; trials: number }>;
  };
}

/**
 * Cuánto se corroboran las dos etapas.
 *
 * No es una simple igualdad porque las dos etapas no miden lo mismo ni tienen
 * la misma sensibilidad. Cada caso está enumerado a propósito: esconder esto
 * en una fórmula haría imposible saber por qué bajó la confianza.
 */
function agreementBetweenStages(
  typeA: CVDType,
  severityA: number,
  typeB: CVDType,
  severityB: number,
): number {
  // Las dos coinciden en el eje: la confianza depende de cuánto se parezcan
  // las severidades.
  if (typeA === typeB && typeA !== 'normal') {
    return clamp01(1 - Math.abs(severityA - severityB));
  }

  // Las dos dicen "sin deficiencia". Corroboración limpia.
  if (typeA === 'normal' && typeB === 'normal') return 1;

  // B encuentra algo que A no ve. Si cae en el punto ciego conocido de A, no
  // es una contradicción: es lo esperado. Si es marcado, A debería haberlo
  // visto y algo no cuadra.
  if (typeA === 'normal' && typeB !== 'normal') {
    return severityB < ARRANGEMENT_BLIND_BELOW ? 0.9 : 0.3;
  }

  // A ve una deficiencia marcada (solo las ve así) y B no la encuentra.
  // Contradicción real entre el instrumento sensible y el ordenamiento.
  if (typeA !== 'normal' && typeB === 'normal') return 0.2;

  // Cada una nombra un eje distinto. Es el peor caso.
  return 0.1;
}

export function buildProfile(input: CalibrationInput): CalibrationOutcome {
  const { arrangement, thresholds } = input;

  const classification = classifyFromThresholds(thresholds);
  const typeA = arrangement.best.type;
  const severityA = arrangement.best.severity;

  // La etapa B manda salvo que no encuentre nada y A sí: en ese caso se
  // conserva el eje de A, que solo dispara ante deficiencias marcadas, pero la
  // confianza se hunde por la contradicción.
  const type = classification.type !== 'normal' ? classification.type : typeA;
  const severity =
    classification.type !== 'normal'
      ? classification.severity
      : typeA !== 'normal'
        ? severityA
        : 0;

  // 🔑 LA FUERZA DE LA EVIDENCIA SALE DE LA ETAPA B, NO DE LA A.
  //
  // La primera versión usaba el margen del ordenamiento y salían confianzas de
  // 0,42 hasta en los casos que el sistema clavaba: como el ordenamiento es
  // ciego por debajo de severidad 0,9, su margen es bajo casi siempre y
  // arrastraba el total. Resultado: se le habría pedido repetir el test a casi
  // todo el mundo, incluidos aquellos cuya medición fue impecable.
  //
  // Lo que mide de verdad la solidez es a cuántos "ruidos" de distancia quedó
  // la decisión de su propio límite. Relación señal-ruido, en las dos
  // direcciones.
  //
  // ⚠️ El valor absoluto era un error, y el arnés lo cantó: dejaba el caso
  //    `normal` en 0,45 y le habría pedido repetir el test a toda persona sin
  //    daltonismo. Que ninguna deficiencia le gane a la normalidad NO es falta
  //    de evidencia — es evidencia de normalidad, y de la buena. Hay que medir
  //    la separación respecto al límite, no su magnitud bruta.
  const distanceFromBoundary =
    classification.type === 'normal'
      ? classification.noise - classification.evidence
      : classification.evidence - classification.noise;

  const evidence = clamp01(
    classification.noise > 0 ? distanceFromBoundary / classification.noise : 1,
  );

  const agreement = agreementBetweenStages(
    typeA,
    severityA,
    classification.type,
    classification.severity,
  );

  const consistency = clamp01(
    1 -
      Math.max(
        ...AXIS_KEYS.map((k) =>
          thresholds[k].threshold > 0 ? thresholds[k].spread / thresholds[k].threshold : 1,
        ),
      ),
  );

  const allConverged = AXIS_KEYS.every((k) => thresholds[k].converged);
  const anySaturated = AXIS_KEYS.some((k) => thresholds[k].saturated);
  const reliability = Math.min(...AXIS_KEYS.map((k) => thresholds[k].reliability));

  const raw = (evidence + agreement + consistency) / 3;
  const confidence = clamp01(
    raw * reliability * (allConverged ? 1 : NON_CONVERGENCE_PENALTY),
  );

  return {
    measurable: allConverged && !anySaturated,
    profile: {
      type,
      severity: Math.round(clamp01(severity) * 100) / 100,
      source: 'calibrated',
      confidence: Math.round(confidence * 100) / 100,
      calibratedAt: new Date().toISOString(),
    },
    detail: {
      typeFromArrangement: typeA,
      severityFromArrangement: severityA,
      typeFromThresholds: classification.type,
      severityFromThresholds: classification.severity,
      ratio: classification.ratio,
      boundary: classification.boundary,
      agreement,
      evidence,
      consistency,
      errorIndex: arrangement.errorIndex,
      axes: AXIS_KEYS.map((k) => ({
        axis: k,
        converged: thresholds[k].converged,
        saturated: thresholds[k].saturated,
        trials: thresholds[k].trials,
      })),
    },
  };
}

/**
 * Vía secundaria: el usuario ya tiene diagnóstico y prefiere introducirlo.
 *
 * ⚠️ Nunca es la pregunta de entrada. Más de la mitad de nuestros usuarios son
 *    deuteranómalos leves sin diagnosticar: preguntarles qué tienen es pedirles
 *    justo el dato que han venido a buscar.
 *
 * `confidence: 1` refleja que el usuario está seguro de SU dato, no que lo
 * hayamos medido nosotros. Quien necesite esa distinción mira `source`, que
 * para eso está en el contrato.
 */
export function selfReportedProfile(type: CVDType, severity: number): CVDProfile {
  return {
    type,
    severity: type === 'normal' ? 0 : clamp01(severity),
    source: 'self_reported',
    /**
     * ⚠️ NOT 1. The contract defines confidence as how conclusive the TEST was,
     * and here no test was taken. Reporting 1 made a self-report outrank a real
     * measurement — which rarely reaches 1 — everywhere confidence is used to
     * degrade a verdict.
     *
     * 0.6 sits above the 0.5 mark that prompts "take it again" (there is
     * nothing to retake) and below a good measurement, so measured data always
     * wins. That the information came from the user is carried by `source`.
     */
    confidence: 0.6,
    calibratedAt: new Date().toISOString(),
  };
}

/** Etiqueta en español de un eje. La interfaz nunca muestra el código interno. */
export function typeLabel(type: CVDType): string {
  switch (type) {
    case 'protan':
      return 'Protan — red axis';
    case 'deutan':
      return 'Deutan — green axis';
    case 'tritan':
      return 'Tritan — blue axis';
    default:
      return 'No deficiency detected';
  }
}

/**
 * What the result MEANS, in plain language.
 *
 * ⚠️ A LABEL IS NOT AN ANSWER. The screen used to report "Deutan — green axis"
 *    and a severity, which is precise and tells a first-time reader nothing.
 *    Most of the people this product is for have never been diagnosed — more
 *    than half the target population are mild deuteranomals who went decades
 *    without knowing — so for many of them this screen is the first time anyone
 *    has named it. It has to say what it is.
 *
 * ⚠️ DESCRIPTIVE, NEVER CLINICAL. Every sentence here is about which colours
 *    are hard to separate and what that means inside this app. It does not
 *    diagnose, prognose, or advise, and the screen carries the disclaimer.
 */
export function describeType(type: CVDType): {
  what: string;
  everyday: string;
  inApp: string;
} {
  switch (type) {
    case 'protan':
      return {
        what: 'Your red-sensitive cones respond differently from the typical case, so red and green sit closer together for you than for most people.',
        everyday:
          'Reds also tend to look darker and less vivid than others perceive them — a red that others call bright can read as almost brown.',
        inApp:
          'KROMA will warn you about red-green pairs, and about the blue/purple ones that catch almost everybody with this.',
      };
    case 'deutan':
      return {
        what: 'Your green-sensitive cones respond differently from the typical case, so green and red sit closer together for you than for most people.',
        everyday:
          'This is the most common variant by a wide margin, and it darkens nothing — which is exactly why so many people who have it are never diagnosed. Nothing looks wrong; some colours simply are not separable.',
        inApp:
          'KROMA will warn you about red-green pairs, and about navy against dark purple, which is the pair that actually matters in a wardrobe.',
      };
    case 'tritan':
      return {
        what: 'Your blue-sensitive cones respond differently from the typical case, so blue and yellow sit closer together for you than for most people.',
        everyday:
          'This is the rarest of the three. Blues and greens can be hard to separate, and yellows can read as pale or washed out.',
        inApp:
          'KROMA will warn you about blue-yellow and blue-green pairs. ⚠️ Our simulation is less accurate for this type than for the other two — see the limitations in the README.',
      };
    default:
      return {
        what: 'This test did not find a colour vision deficiency. You separated the hues it presented about as well as typical colour vision does.',
        everyday:
          'A screen test is not an eye examination, and a mild deficiency can pass one. If you have reason to think otherwise, an optometrist has instruments this does not.',
        inApp:
          'KROMA still works: it will measure your colours and tell you what goes with what — it simply will not have many collisions to warn you about.',
      };
  }
}

/** Cómo de marcada es una severidad, en palabras. Texto, nunca solo color. */
export function severityLabel(severity: number): string {
  if (severity <= 0) return 'none';
  if (severity < 0.35) return 'mild';
  if (severity < 0.7) return 'moderate';
  return 'marked';
}

export function describeHypothesis(h: Hypothesis): string {
  return h.type === 'normal' ? 'normal' : `${h.type} ${h.severity.toFixed(1)}`;
}
