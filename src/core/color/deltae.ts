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

/** CIEDE2000 — the correct metric. Use it unless you have measured a bottleneck. */
export function deltaE(a: Lab, b: Lab): number {
  return ciede2000(
    { mode: 'lab', l: a[0], a: a[1], b: a[2] },
    { mode: 'lab', l: b[0], a: b[1], b: b[2] },
  );
}

/**
 * 🔑 ΔE2000 IGNORING LIGHTNESS — equalises L* before measuring.
 *
 * Answers "are they the same HUE?", which is NOT the same as "do they look alike?".
 *
 * ⚠️ WHY THIS FUNCTION EXISTS:
 *
 * `deltaE()` is full CIEDE2000 and includes the lightness difference ΔL*.
 * Using it to decide "they collide in hue" makes the luminance rescue
 * IMPOSSIBLE: any pair with enough contrast to be saved already has a large
 * ΔE and is classified `safe` before reaching the rule. Verified over 130,816
 * pairs on a grid covering all of sRGB: with the full metric, 8,147 collided
 * and **0** were saved, with a maximum contrast of 1.68 against a threshold of
 * 1.80 — `savedByLuminance` would be dead code.
 *
 * Separating the two axes — hue here, luminance with `contrastRatio()` — makes
 * the rule reachable, which is what the written intention always said.
 */
export function deltaEHue(a: Lab, b: Lab): number {
  const l = (a[0] + b[0]) / 2;
  return deltaE([l, a[1], a[2]], [l, b[1], b[2]]);
}

/** ΔE76 — Euclidean. Cheaper, less faithful. Only for very large loops. */
export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
