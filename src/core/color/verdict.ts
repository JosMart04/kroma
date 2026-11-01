/**
 * Semáforo de conjunto (F11) — el corazón del producto.
 * ⛔ PROPIETARIO: P1. Consumen: P3 (armario) y P4 (analizador de compra).
 */
import type { CVDProfile, PairVerdict, MeasurementConfidence } from '@/core/contracts/types';
import { COLLISION_THRESHOLD_DELTA_E, LUMINANCE_RESCUE_THRESHOLD } from '@/core/contracts/types';
import { deltaE, deltaEHue, rgbToLab } from './deltae';
import { hexToRgb, contrastRatio } from './srgb';
import { simulateRgb } from './simulate';

/**
 * Por encima de este contraste, el par NO se avisa aunque colisione en tono.
 *
 * ⚠️ POR QUÉ HACE FALTA: dos NEUTROS no tienen tono que colisionar. Una camiseta
 * blanca y un pantalón gris marengo dan ΔE de tono 5,3 —simplemente porque
 * ninguno tiene croma— y se colaban como "arriesgado". Nadie confunde blanco con
 * marengo: eso es una falsa alarma, y CLAUDE.md avisa de que un producto que
 * avisa de más deja de usarse.
 *
 * 4.5 es el mínimo AA de WCAG para texto normal: el umbral por debajo del cual
 * la propia norma de accesibilidad considera que dos claridades ya no se
 * distinguen con fiabilidad. Usar el número de una norma existente, y no uno
 * inventado por nosotros, es deliberado.
 *
 * Vive aquí y no en `contracts/types.ts` porque los contratos están congelados.
 */
const LUMINANCE_OBVIOUS_THRESHOLD = 4.5;

export interface VerdictInput {
  aHex: string;
  bHex: string;
  aName: string;
  bName: string;
  profile: CVDProfile;
  /** Si alguna de las dos mediciones es dudosa, el veredicto se degrada. */
  aConfidence?: MeasurementConfidence;
  bConfidence?: MeasurementConfidence;
}

/**
 * Emite el veredicto de un par.
 *
 * 🔑 LA REGLA QUE NOS DIFERENCIA DE CUALQUIER "MODO DALTÓNICO" GENÉRICO:
 * un par que colisiona en TONO pero tiene contraste de LUMINANCIA suficiente
 * NO es una colisión — el usuario los separa por claridad. Marcarlo como
 * choque genera falsas alarmas, y un producto que avisa de más deja de usarse.
 */
export function judgePair(input: VerdictInput): PairVerdict {
  const { aHex, bHex, aName, bName, profile } = input;

  const aRgb = hexToRgb(aHex);
  const bRgb = hexToRgb(bHex);

  const deltaENormal = deltaE(rgbToLab(aRgb), rgbToLab(bRgb));

  const aSimLab = rgbToLab(simulateRgb(aRgb, profile));
  const bSimLab = rgbToLab(simulateRgb(bRgb, profile));
  const deltaESimulated = deltaE(aSimLab, bSimLab);

  const luminanceContrast = contrastRatio(aRgb, bRgb);

  /**
   * ⚠️ LA COLISIÓN SE MIDE SOBRE EL TONO, NO SOBRE EL ΔE COMPLETO.
   *
   * `deltaESimulated` incluye la diferencia de claridad, así que usarlo aquí
   * hacía que las dos condiciones se excluyeran mutuamente y `savedByLuminance`
   * no se cumpliera JAMÁS (0 de 8.147 pares colisionantes en un barrido de todo
   * sRGB). Ver la nota en `deltaEHue()`.
   *
   * `deltaESimulated` se sigue reportando tal cual en el veredicto: es la
   * distancia perceptual real y el contrato no cambia.
   */
  const collidesInHue = deltaEHue(aSimLab, bSimLab) < COLLISION_THRESHOLD_DELTA_E;
  const savedByLuminance = collidesInHue && luminanceContrast >= LUMINANCE_RESCUE_THRESHOLD;

  /**
   * Colisiona en tono, pero la claridad los separa tanto que no hay nada que
   * avisar. `savedByLuminance` sigue siendo `true` —el par SÍ se salva por
   * luminancia, que es lo que el contrato dice que significa ese campo—, pero
   * el veredicto es `safe`, no `risky`: avisar aquí sería una falsa alarma.
   */
  const obviouslySeparated = luminanceContrast >= LUMINANCE_OBVIOUS_THRESHOLD;

  let verdict: PairVerdict['verdict'];
  if (!collidesInHue || obviouslySeparated) verdict = 'safe';
  else if (savedByLuminance) verdict = 'risky';
  else verdict = 'clash';

  // Una medición dudosa nunca puede producir un "seguro" rotundo.
  const dudosa =
    input.aConfidence?.level === 'low_light' || input.bConfidence?.level === 'low_light';
  if (dudosa && verdict === 'safe') verdict = 'risky';

  return {
    verdict,
    deltaENormal: round(deltaENormal),
    deltaESimulated: round(deltaESimulated),
    luminanceContrast: round(luminanceContrast),
    savedByLuminance,
    explanation: explain({
      verdict, aName, bName, deltaESimulated, luminanceContrast, savedByLuminance, dudosa,
      collidesInHue,
    }),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The reason, in the user's language.
 * ⚠️ Never show raw numbers in the interface without this translation.
 */
function explain(a: {
  verdict: PairVerdict['verdict'];
  aName: string; bName: string;
  deltaESimulated: number; luminanceContrast: number;
  savedByLuminance: boolean; dudosa: boolean;
  collidesInHue: boolean;
}): string {
  const pct = Math.round((1 - 1 / a.luminanceContrast) * 100);
  const caveat = a.dudosa
    ? ' Careful: one of these was measured in poor light, so treat it as a rough guide.'
    : '';

  /**
   * ⚠️ A PAIR DOWNGRADED BY POOR LIGHT WAS BEING DESCRIBED AS A COLLISION, AND
   *    THE SENTENCE WAS FLATLY FALSE.
   *
   *    A `safe` pair becomes `risky` when either measurement came from bad
   *    light. That verdict is right — we should not be emphatic about a colour
   *    we are unsure of. But the explanation branched on the DOWNGRADED verdict
   *    with no memory of why, fell past both `safe` clauses, and landed on the
   *    clash text: "white and muddy brown will look like practically the same
   *    colour to you, and there is no difference in lightness to separate them
   *    either." White. And brown.
   *
   *    Our user cannot look at the screen and catch that. It is exactly the
   *    failure this product exists to prevent, so the doubt has to be named as
   *    doubt about the MEASUREMENT, never invented as a collision.
   */
  if (!a.collidesInHue) {
    return (
      `${cap(a.aName)} and ${a.bName} are easy for you to tell apart` +
      (a.dudosa
        ? ', but one of them was measured in poor light, so the colour itself may not be exact.'
        : '.')
    );
  }

  if (a.verdict === 'safe') {
    // The "same hue, very different lightness" case is worth saying out loud:
    // it explains WHY it is safe, and it is exactly the product's argument.
    if (a.savedByLuminance) {
      return (
        `${cap(a.aName)} and ${a.bName} are the same hue to you, but the difference in ` +
        `lightness is so large there is no way to confuse them.${caveat}`
      );
    }
    return `${cap(a.aName)} and ${a.bName} are easy for you to tell apart.${caveat}`;
  }
  if (a.savedByLuminance) {
    return (
      `To you, ${a.aName} and ${a.bName} are almost the same hue — but there is ${pct}% ` +
      `difference in lightness, so you will separate them by light and dark, not by colour.${caveat}`
    );
  }
  return (
    `${cap(a.aName)} and ${a.bName} will look like practically the same colour to you, ` +
    `and there is no difference in lightness to separate them either.${caveat}`
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface PaletteVerdict {
  skin: PairVerdict;
  hair: PairVerdict;
  /** The worse of the two. A garment only has to disappear against one of them. */
  worst: PairVerdict;
}

/**
 * Verdict for a garment against the palette the user always wears.
 *
 * 🔑 SKIN **AND** HAIR, and the second one is the fix. The specification of F11
 *    says the fixed palette is an element of the outfit like any other — "a
 *    shirt does not only compete against the trousers, it competes against the
 *    face wearing it". The code only ever compared against skin, so someone
 *    with auburn hair got no warning about the rust-coloured jumper that makes
 *    their head and shoulders merge into one shape.
 *
 * ⚠️ EYES ARE MEASURED AND DELIBERATELY NOT JUDGED HERE. An iris is about one
 *    percent of what another person sees; a garment "colliding" with it is not
 *    a failure anyone experiences. Skin and hair are large continuous areas
 *    that a garment can genuinely merge into. Declaring this beats silently
 *    dropping a third of the palette the portrait went to the trouble of
 *    measuring.
 *
 * ⚠️ This answers "can you TELL THEM APART", not "does it suit you". Those are
 *    different questions and we only measure the first one. A beige may be
 *    perfectly distinguishable from your skin and still drain your face.
 */
export function judgeAgainstPalette(
  garmentHex: string,
  garmentName: string,
  portrait: { skinHex: string; hairHex: string; confidence?: MeasurementConfidence },
  profile: CVDProfile,
  garmentConfidence?: MeasurementConfidence,
): PaletteVerdict {
  const common = {
    aHex: garmentHex,
    aName: garmentName,
    profile,
    aConfidence: garmentConfidence,
    bConfidence: portrait.confidence,
  };
  const skin = judgePair({ ...common, bHex: portrait.skinHex, bName: 'your skin' });
  const hair = judgePair({ ...common, bHex: portrait.hairHex, bName: 'your hair' });

  const rank: Record<PairVerdict['verdict'], number> = { safe: 0, risky: 1, clash: 2 };
  return { skin, hair, worst: rank[hair.verdict] > rank[skin.verdict] ? hair : skin };
}
