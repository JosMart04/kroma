/** Perceptual distances in CIELAB. */
import { converter, differenceCiede2000 } from 'culori';
import type { Lab } from '@/core/contracts/types';
import { rgbToHex, type RGB } from './srgb';

const toLab = converter('lab');
const toRgb = converter('rgb');
const ciede2000 = differenceCiede2000();

/** sRGB 0–255 → Lab. */
export function rgbToLab(c: RGB): Lab {
  const l = toLab(rgbToHex(c));
  if (!l) throw new Error(`Could not convert to Lab: ${rgbToHex(c)}`);
  return [l.l, l.a ?? 0, l.b ?? 0];
}

/** Lab → sRGB 0–255, clipped to the gamut. */
export function labToRgb(lab: Lab): RGB {
  const c = toRgb({ mode: 'lab', l: lab[0], a: lab[1], b: lab[2] });
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return [q(c.r), q(c.g), q(c.b)];
}

export function hexToLab(hex: string): Lab {
  const l = toLab(hex);
  if (!l) throw new Error(`Could not convert to Lab: ${hex}`);
  return [l.l, l.a ?? 0, l.b ?? 0];
}

/** CIEDE2000 — la métrica correcta. Úsala salvo que midas un cuello de botella. */
export function deltaE(a: Lab, b: Lab): number {
  return ciede2000(
    { mode: 'lab', l: a[0], a: a[1], b: a[2] },
    { mode: 'lab', l: b[0], a: b[1], b: b[2] },
  );
}

/**
 * 🔑 ΔE2000 IGNORANDO LA CLARIDAD — iguala L* antes de medir.
 *
 * Responde a «¿son el mismo TONO?», que NO es lo mismo que «¿se parecen?».
 *
 * ⚠️ POR QUÉ EXISTE ESTA FUNCIÓN, Y ES UN BUG REAL QUE TUVIMOS:
 *
 * `deltaE()` es CIEDE2000 completo, e incluye la diferencia de claridad ΔL*.
 * Usarlo para decidir «colisionan en tono» hacía IMPOSIBLE el rescate por
 * luminancia: cualquier par con contraste suficiente para salvarse ya tenía un
 * ΔE grande y salía clasificado como `safe` antes de llegar a la regla. Se
 * verificó sobre 130.816 pares de una rejilla que cubre todo sRGB: 8.147
 * colisionaban y **0** se salvaban, con un contraste máximo de 1,68 frente a un
 * umbral de 1,80. `savedByLuminance` era código muerto.
 *
 * Separando los dos ejes —tono aquí, luminancia con `contrastRatio()`— la regla
 * vuelve a ser alcanzable, que es lo que siempre dijo la intención escrita.
 */
export function deltaEHue(a: Lab, b: Lab): number {
  const l = (a[0] + b[0]) / 2;
  return deltaE([l, a[1], a[2]], [l, b[1], b[2]]);
}

/** ΔE76 — euclídeo. Más barato, menos fiel. Solo para bucles muy grandes. */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
