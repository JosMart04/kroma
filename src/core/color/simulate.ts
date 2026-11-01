/**
 * Motor de simulación cromática (F3).
 * ⛔ PROPIETARIO: P1. Consumen: P2 (vista doble), P3 (familias, semáforo), P4 (analizador).
 */
import type { CVDProfile, CVDType } from '@/core/contracts/types';
import { linearize, delinearize, hexToRgb, rgbToHex, type RGB } from './srgb';
import { MACHADO_2009, SEVERITY_STEPS, assertReady, type Matrix3 } from './matrices';

function nearestStep(severity: number): number {
  const s = Math.max(0, Math.min(1, severity));
  let best = 0;
  let bestD = Infinity;
  SEVERITY_STEPS.forEach((v, i) => {
    const d = Math.abs(v - s);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function applyMatrix(m: Matrix3, c: RGB): RGB {
  return [
    m[0][0] * c[0] + m[0][1] * c[1] + m[0][2] * c[2],
    m[1][0] * c[0] + m[1][1] * c[1] + m[1][2] * c[2],
    m[2][0] * c[0] + m[2][1] * c[1] + m[2][2] * c[2],
  ];
}

/**
 * Simula un color en el espacio perceptual del usuario.
 *
 * Pipeline obligatorio (no saltarse pasos):
 *   sRGB → linealizar → matriz de deficiencia → delinealizar → sRGB
 */
export function simulateRgb(c: RGB, profile: CVDProfile): RGB {
  if (profile.type === 'normal' || profile.severity <= 0) return c;
  assertReady(profile.type);
  const m = MACHADO_2009[profile.type as Exclude<CVDType, 'normal'>][nearestStep(profile.severity)];
  return delinearize(applyMatrix(m, linearize(c)));
}

export function simulateHex(hex: string, profile: CVDProfile): string {
  return rgbToHex(simulateRgb(hexToRgb(hex), profile));
}

/**
 * Simula un ImageData completo, in-place. Para la vista doble (F5).
 *
 * ⚠️ Cuidado con el rendimiento: en una imagen de 2000x2000 son 4M de
 * operaciones. Redimensiona a un máximo de ~1200px de lado antes de llamar,
 * o el hilo principal se bloquea y el demo se ve a tirones.
 */
export function simulateImageData(img: ImageData, profile: CVDProfile): ImageData {
  if (profile.type === 'normal' || profile.severity <= 0) return img;
  assertReady(profile.type);
  const m = MACHADO_2009[profile.type as Exclude<CVDType, 'normal'>][nearestStep(profile.severity)];
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lin = linearize([d[i], d[i + 1], d[i + 2]]);
    const out = delinearize(applyMatrix(m, lin));
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
    // el canal alfa (d[i+3]) se deja intacto
  }
  return img;
}
