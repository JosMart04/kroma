/**
 * Conversiones sRGB ↔ RGB lineal y luminancia relativa.
 * ⛔ PROPIETARIO: P1.
 *
 * ⚠️ POR QUÉ ESTE FICHERO EXISTE Y ES OBLIGATORIO USARLO:
 * sRGB NO es lineal en luz. Aplicar una transformación de conos sobre valores
 * con gamma opera sobre el número equivocado y produce colores inventados.
 * Este es exactamente el error que tenía el borrador inicial del equipo.
 * Toda simulación cromática DEBE linealizar primero y aplicar gamma al final.
 */

export type RGB = readonly [r: number, g: number, b: number];

/** sRGB 0–255 → RGB lineal 0–1. */
export function linearize(c: RGB): RGB {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [f(c[0]), f(c[1]), f(c[2])];
}

/** RGB lineal 0–1 → sRGB 0–255, con recorte. */
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

/** Luminancia relativa WCAG (0–1) a partir de sRGB 0–255. */
export function relativeLuminance(c: RGB): number {
  const [r, g, b] = linearize(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ratio de contraste de luminancia, 1:1 a 21:1.
 *
 * 🔑 ESTE ES EL CANAL QUE SOBREVIVE AL DALTONISMO.
 * Dos colores pueden ser indistinguibles en tono para el usuario y seguir
 * siendo perfectamente separables por claridad. El veredicto DEBE usarlo,
 * o produciremos falsas alarmas constantes.
 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
