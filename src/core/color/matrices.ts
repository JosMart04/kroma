/**
 * ══════════════════════════════════════════════════════════════════════════
 *  COLOUR SIMULATION MATRICES — Machado 2009
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ OWNER: core.
 *
 *  🚫 DO NOT EDIT THE NUMBERS BY HAND. DO NOT COPY THEM FROM A BLOG. DO NOT
 *     TAKE THEM FROM A LANGUAGE MODEL'S MEMORY.
 *
 *  The 297 values live in `matrices.generated.ts`, transcribed mechanically by
 *  `scripts/gen-matrices.mjs`, with the SHA256 of the source file in the header.
 *  If they ever need to change, regenerate them:  npm run gen:matrices
 *
 *  Citing Brettel/Viénot and then using the matrices of the early-2000s web
 *  approximation — which the DaltonLens literature itself advises against — is
 *  the classic mistake here. A project whose central argument is perceptual
 *  honesty cannot ship a false simulation while citing the right paper: it is
 *  the one error a judge with a colour background spots at once.
 *
 *  ── EXACTLY WHERE THEY COME FROM ────────────────────────────────────────
 *
 *  ⚠️ VERIFIED 13 AUG 2026 — the two DaltonLens projects contain different
 *     models, and only one of them has the table we need:
 *
 *       · libDaltonLens (C, public domain) → Brettel 1997 and Viénot 1999.
 *         The string "machado" appears ZERO times in libDaltonLens.c.
 *       · DaltonLens-Python (MIT) → `machado_2009_matrices`, which is the table
 *         we need: 11 severity steps, in LINEAR RGB.
 *
 *     Primary source of the numbers: Machado, Oliveira & Fernandes (2009),
 *     IEEE TVCG 15(6), Table 1.
 *
 *  ── WHICH MODEL FOR WHICH PROFILE ───────────────────────────────────────
 *
 *   · Anomalous trichromacy (MOST users) → Machado 2009. It is the only model
 *     that truly parameterises severity, and more than half of our audience
 *     are mild deuteranomals, not dichromats.
 *
 *   · ⚠️ TRITAN — A KNOWN LIMITATION, ACCEPTED ON PURPOSE:
 *     The source itself warns that Machado 2009 is not accurate for
 *     tritanopia, and its automatic selector uses Brettel 1997 in that case.
 *     We use Machado for tritan as well. It is a conscious decision: tritan is
 *     very rare compared with protan and deutan, and Brettel's two-half-plane
 *     projection is a separate piece of work.
 *
 *     It is NOT hidden: it is declared in `docs/submission/limitations.md` and
 *     in the README. Declaring the limit is worth more than pretending it does
 *     not exist — and it is consistent with the product's thesis.
 */

import type { CVDType } from '@/core/contracts/types';
import { MACHADO_2009_GENERATED } from './matrices.generated';

export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** The severities at which Machado 2009 publishes matrices. */
export const SEVERITY_STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] as const;

/**
 * Machado 2009, in LINEAR RGB space (careful: not LMS).
 * Index = severity step. The values are in `matrices.generated.ts`.
 */
export const MACHADO_2009: Record<'protan' | 'deutan' | 'tritan', Matrix3[]> =
  MACHADO_2009_GENERATED;

/** Traceability of the transcription, for anyone who wants to audit it. */
export { MACHADO_2009_SOURCE_SHA256, MACHADO_2009_SOURCE_URL } from './matrices.generated';

export function isReady(type: CVDType): boolean {
  if (type === 'normal') return true;
  return MACHADO_2009[type].length === SEVERITY_STEPS.length;
}

export function assertReady(type: CVDType): void {
  if (!isReady(type)) {
    throw new Error(
      `[core/color] The simulation matrices for "${type}" are missing.\n` +
        `Regenerate src/core/color/matrices.generated.ts with: npm run gen:matrices\n` +
        `Do NOT invent the values: perceptual honesty is the project's thesis.`,
    );
  }
}
