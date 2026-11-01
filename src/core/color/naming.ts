/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F10 · NAMING A COLOUR, HONESTLY
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  This is the single place where a measurement becomes a word, and the most
 *  dangerous line in the product. Say "olive green" about a brown garment and
 *  anyone else catches it instantly — our user cannot. It is precisely the
 *  failure this app exists to prevent.
 *
 *  Naming is therefore DERIVED FROM THE MEASUREMENT: deterministic, auditable,
 *  instant, identical on every run, and no language model anywhere near it.
 *
 *  ── WHY NOT NEAREST-NEIGHBOUR AGAINST A NAME TABLE ──────────────────────
 *
 *  The first version looked up the closest of the 148 CSS named colours. It
 *  shipped a real, reported bug: a dark purple jacket measured at hue 316° came
 *  back as "midnight blue", whose hue is around 265°. Fifty degrees away, a
 *  different colour family entirely.
 *
 *  The cause is structural, not a tuning problem. In the dark region CIEDE2000
 *  is dominated by the lightness term, and the CSS table has almost nothing
 *  dark and saturated — so the nearest entry is whatever dark thing happens to
 *  be closest, regardless of hue. A forest green measured at 140° came back as
 *  "dark slate gray". Reporting the distance alongside did not fix it: a name
 *  from the wrong family is wrong however politely it is hedged.
 *
 *  ── WHAT IT DOES INSTEAD ────────────────────────────────────────────────
 *
 *  Reads the colour in LCh — the polar form of the same CIELAB space every
 *  other measurement in this project uses — and describes it:
 *
 *      hue angle  -> the colour family      (cannot be wrong: it IS the hue)
 *      lightness  -> dark / light modifier
 *      chroma     -> muted / vivid modifier, or "grey" when there is no hue
 *
 *  "dark purple" instead of "midnight blue". Less poetic, impossible to get
 *  wrong by a whole family, and it degrades honestly: a colour with almost no
 *  chroma is called a grey, because that is what it is.
 *
 *  The nearest CSS name is still offered as a SECONDARY label, but only when it
 *  is genuinely close (ΔE < 10). At that distance it is a real match —
 *  "gainsboro" for #d8d8d8 sits at ΔE 0.9 — and it gives a familiar handle
 *  without ever standing in for the measurement.
 *
 *  ⚠️ Named in the OBSERVER-INDEPENDENT space, on purpose. This is what the
 *     colour actually is, not how this particular user perceives it. Telling
 *     someone their jacket is purple is only useful if it matches what everyone
 *     else calls it — which is the entire reason they are asking us.
 */
import { colorsNamed, converter, differenceCiede2000 } from 'culori';
import { hexToLab } from './deltae';

const toLch = converter('lch');
const toLab = converter('lab');
const dE = differenceCiede2000();

/**
 * Hue families by CIELAB hue angle. Boundaries are the midpoints between the
 * canonical hues, walking the wheel once. Every angle lands in exactly one
 * family, so a hue can never be described as belonging to another one.
 */
const HUE_BANDS: Array<{ upTo: number; name: string }> = [
  { upTo: 15, name: 'crimson' },
  { upTo: 42, name: 'red' },
  { upTo: 70, name: 'orange' },
  { upTo: 100, name: 'yellow' },
  { upTo: 125, name: 'yellow-green' },
  { upTo: 160, name: 'green' },
  { upTo: 195, name: 'teal' },
  { upTo: 240, name: 'cyan' },
  { upTo: 290, name: 'blue' },
  { upTo: 330, name: 'purple' },
  { upTo: 350, name: 'magenta' },
  { upTo: 360, name: 'crimson' },
];

/** Below this chroma there is no usable hue left: it is a neutral. */
const ACHROMATIC_CHROMA = 8;
/** A genuinely close CSS match is worth offering as a familiar handle. */
const CLOSE_CSS_MATCH = 10;

export interface ColorName {
  /** What we call it: "dark purple". Always in the right hue family. */
  name: string;
  /** A familiar CSS keyword, only when it is genuinely close. */
  closestStandard: { keyword: string; deltaE: number } | null;
  /** True when the colour is a neutral and has no meaningful hue. */
  achromatic: boolean;
}

function hueFamily(h: number): string {
  const a = ((h % 360) + 360) % 360;
  return HUE_BANDS.find((b) => a < b.upTo)?.name ?? 'crimson';
}

/**
 * English has dedicated words for some dark, low-chroma hues, and using them is
 * more accurate than the systematic form — "brown" really is what people call a
 * dark orange, and refusing to say so would be pedantic rather than honest.
 */
function idiomatic(family: string, l: number, c: number): string | null {
  if (family === 'orange' && l < 45) return 'brown';
  // Olive covers the dark, unsaturated end of both yellow and yellow-green.
  // Calling a #67714c garment "yellow-green" is technically true and useless:
  // nobody shopping for clothes uses that phrase, and "olive" is what the
  // colour is called.
  if ((family === 'yellow' || family === 'yellow-green') && l < 62 && c < 38) return 'olive';
  if (family === 'blue' && l < 25) return 'navy';
  if (family === 'crimson' && l > 65 && c < 35) return 'pink';
  return null;
}

const TABLE = Object.keys(colorsNamed).flatMap((keyword) => {
  const lab = toLab(keyword);
  // A keyword culori cannot parse would poison the nearest-neighbour search, so
  // it is dropped rather than defaulted to some stand-in colour.
  return lab ? [{ keyword, lab }] : [];
});

export function nameColor(hex: string): ColorName {
  const lab = hexToLab(hex);
  const lch = toLch({ mode: 'lab', l: lab[0], a: lab[1], b: lab[2] });
  const L = lch?.l ?? 0;
  const C = lch?.c ?? 0;
  const H = lch?.h ?? 0;

  // Nearest CSS keyword, kept only if it is a real match.
  let bestKeyword = TABLE[0].keyword;
  let bestD = Infinity;
  for (const e of TABLE) {
    const d = dE({ mode: 'lab', l: lab[0], a: lab[1], b: lab[2] }, e.lab);
    if (d < bestD) {
      bestD = d;
      bestKeyword = e.keyword;
    }
  }
  const closestStandard =
    bestD < CLOSE_CSS_MATCH ? { keyword: bestKeyword, deltaE: Math.round(bestD * 10) / 10 } : null;

  // ── Neutrals: no hue to speak of, so do not invent one ─────────────────
  if (C < ACHROMATIC_CHROMA) {
    const neutral =
      L < 12 ? 'black' : L < 30 ? 'very dark grey' : L < 50 ? 'dark grey' : L < 70 ? 'grey' : L < 88 ? 'light grey' : 'white';
    return { name: neutral, closestStandard, achromatic: true };
  }

  const family = hueFamily(H);
  const idiom = idiomatic(family, L, C);
  const base = idiom ?? family;

  const lightness = L < 25 ? 'very dark ' : L < 45 ? 'dark ' : L < 65 ? '' : L < 82 ? 'light ' : 'very light ';
  // "muted" only earns a mention when the colour is noticeably washed out; a
  // strong colour does not need to be called strong.
  const saturation = C < 18 ? 'muted ' : C > 55 ? 'vivid ' : '';

  // An idiom like "navy" or "brown" already encodes darkness; stacking "dark"
  // on top reads wrong.
  const prefix = idiom ? (idiom === 'pink' ? '' : saturation) : `${lightness}${saturation}`;

  return { name: `${prefix}${base}`.replace(/\s+/g, ' ').trim(), closestStandard, achromatic: false };
}
