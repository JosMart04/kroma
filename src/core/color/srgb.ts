/**
 * sRGB ↔ linear RGB conversions and relative luminance.
 * ⛔ OWNER: core.
 *
 * ⚠️ WHY THIS FILE EXISTS AND MUST BE USED:
 * sRGB is NOT linear in light. Applying a cone transform to gamma-encoded
 * values operates on the wrong number and produces invented colours — the
 * mistake most public implementations make. Every colour simulation MUST
 * linearise first and apply gamma at the end.
 */

export type RGB = readonly [r: number, g: number, b: number];

/** sRGB 0–255 → linear RGB 0–1. */
export function linearize(c: RGB): RGB {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

/** Linear RGB 0–1 → sRGB 0–255, clipped. */
export function delinearize(c: RGB): RGB {
  const f = (v: number) => {
    const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(s * 255)));
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function rgbToHex(c: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/** WCAG relative luminance (0–1) from sRGB 0–255. */
export function relativeLuminance(c: RGB): number {
  const [r, g, b] = linearize(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Luminance contrast ratio, 1:1 to 21:1.
 *
 * 🔑 THIS IS THE CHANNEL THAT SURVIVES COLOUR BLINDNESS.
 * Two colours can be indistinguishable in hue for the user and still be
 * perfectly separable by lightness. The verdict MUST use it, or it produces
 * constant false alarms.
 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
