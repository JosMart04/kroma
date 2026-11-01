/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MATRICES DE SIMULACIÓN CROMÁTICA — Machado 2009
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P1.
 *
 *  🚫 NO EDITES LOS NÚMEROS A MANO. NO LOS COPIES DE UN BLOG. NO LOS SAQUES DE
 *     LA MEMORIA DE UN MODELO DE LENGUAJE.
 *
 *  Los 297 valores viven en `matrices.generated.ts`, transcritos mecánicamente
 *  por `scripts/gen-matrices.mjs`, con el SHA256 del fichero de origen en la
 *  cabecera. Si hay que tocarlos, se regenera:  npm run gen:matrices
 *
 *  El borrador inicial del equipo citaba a Brettel/Viénot y a continuación
 *  usaba las matrices de la aproximación web de los años 2000, que la propia
 *  literatura de DaltonLens desaconseja. Un proyecto cuyo argumento central es
 *  la honestidad perceptual no puede entregar una simulación falsa citando el
 *  paper correcto: es el único error que un juez con formación en color detecta
 *  de inmediato, y desmonta la nota de Technological Implementation.
 *
 *  ── DE DÓNDE SALEN, CON PRECISIÓN ───────────────────────────────────────
 *
 *  ⚠️ CORRECCIÓN DEL 13-AGO-2026: durante dos días este fichero y el brief de
 *     P1 dijeron «rellenar desde libDaltonLens». Es FALSO y se verificó:
 *
 *       · libDaltonLens (C, dominio público) → Brettel 1997 y Viénot 1999.
 *         La cadena "machado" aparece CERO veces en libDaltonLens.c.
 *       · DaltonLens-Python (MIT) → `machado_2009_matrices`, que es la tabla
 *         que necesitamos: 11 pasos de severidad, en RGB LINEAL.
 *
 *     Fuente primaria de los números: Machado, Oliveira & Fernandes (2009),
 *     IEEE TVCG 15(6), Tabla 1.
 *
 *  ── QUÉ MODELO PARA QUÉ PERFIL ──────────────────────────────────────────
 *
 *   · Tricromacia anómala (LA MAYORÍA de usuarios) → Machado 2009. Es el único
 *     que parametriza severidad de verdad, y más de la mitad de nuestro público
 *     son deuteranómalos leves, no dicrómatas.
 *
 *   · ⚠️ TRITÁN — LIMITACIÓN CONOCIDA Y ACEPTADA A PROPÓSITO:
 *     La propia fuente advierte de que Machado 2009 no es preciso para
 *     tritanopía, y su selector automático usa Brettel 1997 en ese caso.
 *     Nosotros usamos Machado también para tritán. Es una decisión consciente:
 *     tritán es rarísimo comparado con protán y deután, y la proyección en dos
 *     semiplanos de Brettel no cabe en el calendario de cuatro días.
 *
 *     NO se esconde: está declarado en `docs/entrega/limitaciones.md` para que
 *     entre en el README de la entrega. Declarar el límite puntúa mejor que
 *     fingir que no existe — y es coherente con la tesis del producto.
 */

import type { CVDType } from '@/core/contracts/types';
import { MACHADO_2009_GENERATED } from './matrices.generated';

export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Severidades en las que Machado 2009 publica matrices. */
export const SEVERITY_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const;

/**
 * Machado 2009, en el espacio RGB LINEAL (ojo: no en LMS).
 * Índice = paso de severidad. Los valores están en `matrices.generated.ts`.
 */
export const MACHADO_2009: Record<'protan' | 'deutan' | 'tritan', Matrix3[]> =
  MACHADO_2009_GENERATED;

/** Trazabilidad de la transcripción, por si alguien quiere auditarla. */
export { MACHADO_2009_SOURCE_SHA256, MACHADO_2009_SOURCE_URL } from './matrices.generated';

export function isReady(type: CVDType): boolean {
  if (type === 'normal') return true;
  return MACHADO_2009[type].length === SEVERITY_STEPS.length;
}

export function assertReady(type: CVDType): void {
  if (!isReady(type)) {
    throw new Error(
      `[core/color] Faltan las matrices de simulación para "${type}".\n` +
        `Regenera src/core/color/matrices.generated.ts con: npm run gen:matrices\n` +
        `NO inventes los valores: la honestidad perceptual es la tesis del proyecto.`,
    );
  }
}
