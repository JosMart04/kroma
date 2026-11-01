/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ETAPA B — UMBRALES CONTRA GRIS NEUTRO, EN LOS TRES EJES (F1)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P2.
 *
 *  🔑 ESTA ES LA ETAPA QUE DE VERDAD MIDE, y hubo que rediseñarla.
 *
 *  El primer diseño corría UNA escalera, sobre el eje que hubiera elegido el
 *  ordenamiento. El arnés de autoconsistencia (`DiagnosticPanel`) demostró que
 *  eso no vale: el ordenamiento solo separa severidades ≥ 0,9, así que por
 *  debajo de ahí no aportaba ningún eje y la escalera medía donde no tocaba.
 *
 *  No era un fallo de código sino una propiedad conocida de los tests de
 *  ordenamiento — por eso existe la versión desaturada de Lanthony. Pero para
 *  nosotros era inaceptable: `CLAUDE.md` dice que más de la mitad de nuestros
 *  usuarios son deuteranómalos LEVES, y habrían salido todos como normales.
 *
 *  Solución: se miden los TRES ejes, entrelazados. El eje en el que el usuario
 *  necesita más desplazamiento para ver algo es su eje averiado. Un observador
 *  normal da los tres umbrales parecidos; uno con deficiencia da uno claramente
 *  peor. Y eso funciona a cualquier severidad, no solo en las extremas.
 *
 *  Entrelazadas y no seguidas para que el usuario no pueda aprenderse una
 *  escalera y anticipar: cada ensayo puede venir de cualquiera de las tres.
 */
import { inGamut } from 'culori';
import type { CVDType } from '@/core/contracts/types';
import { SEVERITY_STEPS } from '@/core/color/matrices';
import {
  AXIS_KEYS,
  JND_DELTA_E,
  NEUTRAL_LIGHTNESS,
  axisOf,
  labOffsetHex,
  perceivedOffsetDeltaE,
  type AxisKey,
} from './observer';

export { JND_DELTA_E } from './observer';

/** Por debajo de esto el desplazamiento se pierde en el redondeo a 8 bits. */
const MIN_OFFSET = 0.5;

/** Reversiones antes de dar una escalera por buena. */
const TARGET_REVERSALS = 6;

/** Se promedian las últimas, ya en régimen estable. */
const AVERAGED_REVERSALS = 4;

/** Paso grande hasta la primera reversión (llegar rápido), fino después. */
const COARSE_FACTOR = 0.6;
const FINE_FACTOR = 0.85;

/**
 * Tope de seguridad por escalera: no dejamos al usuario encerrado ahí.
 *
 * Con margen suficiente para el peor descenso honesto. Quien acierta siempre
 * no genera reversiones, así que el paso se queda en el factor grueso y hacen
 * falta unos 18 ensayos solo para bajar de 25 al suelo; con el tope pegado a
 * esa cifra, el mejor observador posible se quedaba sin medir.
 */
const MAX_TRIALS_PER_AXIS = 26;

const rgbInGamut = inGamut('rgb');

function offsetInGamut(axisDeg: number, offset: number): boolean {
  const rad = (axisDeg * Math.PI) / 180;
  const a = offset * Math.cos(rad);
  const b = offset * Math.sin(rad);
  return (
    rgbInGamut({ mode: 'lab', l: NEUTRAL_LIGHTNESS, a, b }) &&
    rgbInGamut({ mode: 'lab', l: NEUTRAL_LIGHTNESS, a: -a, b: -b })
  );
}

/** El desplazamiento más grande que cabe en sRGB sobre este eje. */
export function maxOffset(axisDeg: number): number {
  let hi = 0;
  for (let o = 1; o <= 60; o += 1) {
    if (!offsetInGamut(axisDeg, o)) break;
    hi = o;
  }
  return hi;
}

export interface StaircaseState {
  axisKey: AxisKey;
  axisDeg: number;
  offset: number;
  consecutiveCorrect: number;
  /** Desplazamiento en cada cambio de dirección. */
  reversals: number[];
  lastDirection: 'up' | 'down' | null;
  trials: number;
  /** Veces que quiso bajar estando ya en el suelo: lo ve todo. */
  floorHits: number;
  /** Veces que quiso subir estando ya en el techo: no ve nada. */
  ceilingHits: number;
  done: boolean;
}

/**
 * Toques contra cada extremo antes de dar la escalera por resuelta ahí.
 *
 * Asimétrico a propósito. Llegar al SUELO es una afirmación modesta —"lo
 * distingue hasta donde la pantalla llega"— y con una vez basta. Llegar al
 * TECHO afirma que no ve nada ni con el mayor desplazamiento que cabe en sRGB,
 * que es mucho decir, y un despiste al principio no debería bastar.
 */
const FLOOR_HITS_TO_STOP = 1;
const CEILING_HITS_TO_STOP = 2;

function createStaircase(axisKey: AxisKey): StaircaseState {
  const axisDeg = axisOf(axisKey);
  return {
    axisKey,
    axisDeg,
    offset: Math.min(25, maxOffset(axisDeg)),
    consecutiveCorrect: 0,
    reversals: [],
    lastDirection: null,
    trials: 0,
    floorHits: 0,
    ceilingHits: 0,
    done: false,
  };
}

/**
 * Avanza una escalera con el resultado de un ensayo.
 * Puro: mismo estado + misma respuesta = mismo estado siguiente, siempre.
 */
export function advanceStaircase(state: StaircaseState, correct: boolean): StaircaseState {
  if (state.done) return state;

  const trials = state.trials + 1;
  const ceiling = maxOffset(state.axisDeg);
  const factor = state.reversals.length === 0 ? COARSE_FACTOR : FINE_FACTOR;

  let { offset, consecutiveCorrect, lastDirection, floorHits, ceilingHits } = state;
  const reversals = [...state.reversals];
  let direction: 'up' | 'down' | null = null;

  if (correct) {
    consecutiveCorrect += 1;
    // 2-abajo: hacen falta DOS aciertos seguidos para acercarse al gris.
    if (consecutiveCorrect >= 2) {
      consecutiveCorrect = 0;
      direction = 'down';
      // ⚠️ TOPAR CONTRA UN EXTREMO NO ES UNA REVERSIÓN, Y ESO COLGABA EL TEST.
      //
      // Quien discrimina muy bien acierta siempre, la escalera pide bajar una
      // y otra vez, el suelo la clava en su sitio y NUNCA cambia de dirección:
      // cero reversiones, se agotan los intentos y acababa en la pantalla de
      // negativa. Es decir, rechazábamos justo a quien mejor ve.
      //
      // Topar contra el suelo no es un fallo de convergencia: es la respuesta.
      // Su umbral está en el suelo o por debajo, y con eso basta.
      if (offset <= MIN_OFFSET) floorHits += 1;
      offset = Math.max(MIN_OFFSET, offset * factor);
    }
  } else {
    // 1-arriba: un solo fallo basta para alejarse.
    consecutiveCorrect = 0;
    direction = 'up';
    if (offset >= ceiling) ceilingHits += 1;
    offset = Math.min(ceiling, offset / factor);
  }

  if (direction && lastDirection && direction !== lastDirection) {
    reversals.push(state.offset);
  }
  if (direction) lastDirection = direction;

  return {
    ...state,
    offset,
    consecutiveCorrect,
    reversals,
    lastDirection,
    trials,
    floorHits,
    ceilingHits,
    done:
      reversals.length >= TARGET_REVERSALS ||
      floorHits >= FLOOR_HITS_TO_STOP ||
      ceilingHits >= CEILING_HITS_TO_STOP ||
      trials >= MAX_TRIALS_PER_AXIS,
  };
}

// ── El conjunto de tres escaleras entrelazadas ────────────────────────────

export interface StaircaseSet {
  staircases: Record<AxisKey, StaircaseState>;
  /** Eje del ensayo que se está mostrando ahora. */
  current: AxisKey;
  done: boolean;
}

export function createStaircaseSet(): StaircaseSet {
  return {
    staircases: {
      protan: createStaircase('protan'),
      deutan: createStaircase('deutan'),
      tritan: createStaircase('tritan'),
    },
    current: AXIS_KEYS[0],
    done: false,
  };
}

/** Siguiente eje pendiente, en rueda. Determinista. */
function nextAxis(set: StaircaseSet, from: AxisKey): AxisKey | null {
  const start = AXIS_KEYS.indexOf(from);
  for (let i = 1; i <= AXIS_KEYS.length; i++) {
    const candidate = AXIS_KEYS[(start + i) % AXIS_KEYS.length];
    if (!set.staircases[candidate].done) return candidate;
  }
  return null;
}

export function advanceSet(set: StaircaseSet, correct: boolean): StaircaseSet {
  const advanced = advanceStaircase(set.staircases[set.current], correct);
  const staircases = { ...set.staircases, [set.current]: advanced };
  const partial: StaircaseSet = { staircases, current: set.current, done: false };
  const next = nextAxis(partial, set.current);

  return {
    staircases,
    current: next ?? set.current,
    done: next === null,
  };
}

/**
 * Overall progress, for the bar.
 *
 * ⚠️ A finished staircase counts as FULL even if it stopped before reaching
 * TARGET_REVERSALS. A staircase can legitimately end by hitting the floor, the
 * ceiling or the per-axis trial cap, and counting only reversals made the bar
 * stall short of 100% on a perfectly normal run — it looked broken.
 */
export function setProgress(set: StaircaseSet): { done: number; total: number } {
  const total = AXIS_KEYS.length * TARGET_REVERSALS;
  const done = AXIS_KEYS.reduce((acc, key) => {
    const s = set.staircases[key];
    return acc + (s.done ? TARGET_REVERSALS : Math.min(TARGET_REVERSALS, s.reversals.length));
  }, 0);
  return { done, total };
}

// ── Lectura de umbrales ───────────────────────────────────────────────────

export interface ThresholdResult {
  /** Desplazamiento umbral, en unidades a*b*. */
  threshold: number;
  /** Dispersión de las reversiones promediadas. Alta = respondió errático. */
  spread: number;
  converged: boolean;
  trials: number;
  /** Reversiones logradas sobre las que se querían promediar, 0–1. */
  reliability: number;
  /** El umbral se pegó al techo del gamut: no se pudo medir nada. */
  saturated: boolean;
}

export function readThreshold(state: StaircaseState): ThresholdResult {
  // Umbral en el suelo: discrimina hasta donde la pantalla llega. Es una
  // medición válida y completa, no una escalera a medias.
  if (state.floorHits >= FLOOR_HITS_TO_STOP) {
    return {
      threshold: MIN_OFFSET,
      spread: 0,
      converged: true,
      trials: state.trials,
      reliability: 1,
      saturated: false,
    };
  }

  // Umbral en el techo: ni con el máximo desplazamiento que cabe en sRGB lo
  // ve. Aquí sí hay que declararlo no medible.
  if (state.ceilingHits >= CEILING_HITS_TO_STOP) {
    return {
      threshold: maxOffset(state.axisDeg),
      spread: 0,
      converged: true,
      trials: state.trials,
      reliability: 1,
      saturated: true,
    };
  }

  const used = state.reversals.slice(-AVERAGED_REVERSALS);
  // Si no hubo reversiones, el umbral es donde se quedó: mejor que fingir.
  const sample = used.length > 0 ? used : [state.offset];
  const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
  const variance = sample.reduce((acc, v) => acc + (v - mean) ** 2, 0) / sample.length;

  /**
   * ⚠️ CON MENOS DE DOS REVERSIONES LA DISPERSIÓN ES 0, Y ESO MIENTE.
   *
   * Lo cazó el arnés recorriendo la interfaz de verdad: alguien contestando al
   * azar nunca genera reversiones, así que se promediaba UNA muestra, la
   * varianza salía 0 y el sistema lo leía como "consistencia perfecta". Se le
   * daba un "sin deficiencia detectada" con un 68% de confianza a quien no
   * había mirado la pantalla.
   *
   * Sin reversiones no es que la medida sea estable: es que NO HAY MEDIDA. La
   * incertidumbre honesta es del tamaño del propio umbral.
   */
  const spread = used.length >= 2 ? Math.sqrt(variance) : mean;

  return {
    threshold: mean,
    spread,
    /**
     * ⚠️ FIXED 2026-08-15 — this used to require TARGET_REVERSALS (6) and made
     * the whole test unusable: `measurable` was false for EVERY observer, so
     * every user got the refusal screen instead of a result.
     *
     * Cause: a staircase also stops at MAX_TRIALS_PER_AXIS (26), and a clean,
     * noise-free observer only reaches 5 reversals by then. The stopping rule
     * and the success rule had been tuned independently and disagreed by one.
     *
     * The threshold itself is the mean of the last AVERAGED_REVERSALS (4)
     * reversals — so once we have that many, we have exactly the sample the
     * measurement is built from. Anything short of it is what `reliability`
     * (reversals / AVERAGED_REVERSALS) already downgrades, and a genuinely
     * unmeasurable run is still caught by `saturated`.
     *
     * Verified with a synthetic-observer harness: 7/7 profiles measurable,
     * while a random guesser still fails to produce a usable measurement.
     */
    converged: state.reversals.length >= AVERAGED_REVERSALS,
    trials: state.trials,
    reliability: Math.min(1, state.reversals.length / AVERAGED_REVERSALS),
    // El 0,95 deja margen al redondeo del paso multiplicativo.
    saturated: mean >= maxOffset(state.axisDeg) * 0.95,
  };
}

export type ThresholdSet = Record<AxisKey, ThresholdResult>;

export function readSet(set: StaircaseSet): ThresholdSet {
  return {
    protan: readThreshold(set.staircases.protan),
    deutan: readThreshold(set.staircases.deutan),
    tritan: readThreshold(set.staircases.tritan),
  };
}

// ── Ensayos ───────────────────────────────────────────────────────────────

export interface Trial {
  /** Cuatro colores; tres iguales y uno desplazado. */
  patches: string[];
  /** Cuál es el distinto. Nunca se muestra: es la respuesta. */
  oddIndex: number;
}

/**
 * Monta un ensayo del eje que toque. La posición del parche distinto se sortea
 * cada vez, o el usuario aprendería la posición en vez de mirar el color.
 *
 * El generador es inyectable para que el arnés de diagnóstico pueda reproducir
 * una sesión exacta.
 */
export function buildTrial(set: StaircaseSet, rng: () => number = Math.random): Trial {
  const state = set.staircases[set.current];
  const rad = (state.axisDeg * Math.PI) / 180;
  const a = state.offset * Math.cos(rad);
  const b = state.offset * Math.sin(rad);

  const neutral = labOffsetHex(0, 0);
  const odd = labOffsetHex(a, b);
  const oddIndex = Math.min(3, Math.floor(rng() * 4));

  return {
    patches: Array.from({ length: 4 }, (_, i) => (i === oddIndex ? odd : neutral)),
    oddIndex,
  };
}

// ── Umbral → severidad ────────────────────────────────────────────────────

/**
 * Convierte el umbral medido en severidad, SIN constantes de calibración.
 *
 * 🔑 EL RAZONAMIENTO, que es lo que hace que no haya que inventar nada:
 *
 *    Una persona detecta un desplazamiento cuando, YA DEFORMADO POR SU PROPIA
 *    VISIÓN, sigue midiendo al menos un JND. Así que la severidad que le
 *    corresponde es aquella para la que el modelo predice exactamente eso:
 *
 *        ΔE( simular(gris + umbral, s), simular(gris, s) ) = 1
 *
 *    Se barren los 11 pasos de Machado buscando el cruce y se interpola.
 *
 *    Comprobación de cordura: alguien con visión normal detecta hasta el JND,
 *    o sea umbral ≈ 1. A severidad 0 la matriz es la identidad, así que el
 *    ΔE percibido ≈ 1 y el cruce cae en s = 0. Sale solo, sin ajustes.
 */
export function severityFromThreshold(
  type: CVDType,
  axisDeg: number,
  threshold: number,
): number {
  if (type === 'normal') return 0;

  const perceived = SEVERITY_STEPS.map((s) =>
    perceivedOffsetDeltaE({ type, severity: s }, axisDeg, threshold),
  );

  // A severidad 0 ya percibe menos de un JND: el umbral medido está por debajo
  // del suelo de percepción. No hay evidencia de deficiencia.
  if (perceived[0] <= JND_DELTA_E) return 0;

  for (let i = 1; i < SEVERITY_STEPS.length; i++) {
    if (perceived[i] <= JND_DELTA_E) {
      const hi = perceived[i - 1];
      const lo = perceived[i];
      const t = hi === lo ? 0 : (hi - JND_DELTA_E) / (hi - lo);
      const s = SEVERITY_STEPS[i - 1] + t * (SEVERITY_STEPS[i] - SEVERITY_STEPS[i - 1]);
      return Math.round(s * 100) / 100;
    }
  }

  // Ni con severidad máxima el modelo comprime tanto: el usuario necesita un
  // desplazamiento mayor del que Machado sabe representar. Se topa en 1.
  return 1;
}
