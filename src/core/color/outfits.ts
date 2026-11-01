/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F19 · COMPLETE OUTFITS, CERTIFIED — the morning decision
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ── WHY THIS EXISTS, AND WHY IT IS THE POINT OF THE WHOLE PRODUCT ────────
 *
 *  Everything before this answers "do these two clash?". That is the right
 *  question and we answer it better than anyone. But it leaves the user doing
 *  the work: holding a wardrobe in their head and checking it pair by pair —
 *  which is precisely the task their vision makes unreliable, and precisely
 *  why they end up asking a partner or a flatmate every morning.
 *
 *  This file removes the asking. It hands over complete outfits that have
 *  already been checked, every pair, against the palette they wear on their
 *  own face.
 *
 *  ── ZERO API COST, AND THAT IS AN ARGUMENT, NOT A DETAIL ─────────────────
 *
 *  Not one call. Every colour here was measured once, when the garment was
 *  photographed. Composing outfits is arithmetic over numbers we already own,
 *  so the wardrobe does not multiply the cost of the product — it amortises it.
 *
 *  ⚠️ PERFORMANCE IS A DESIGN CONSTRAINT HERE, NOT AN OPTIMISATION. A naive
 *     sweep re-judges the same pair inside thousands of combinations, and
 *     CIEDE2000 is not cheap. The pairwise verdicts are computed ONCE — N
 *     garments give N²/2 pairs, so 25 garments is 300 operations — and the
 *     combinations become lookups.
 */
import type {
  ColorFamily,
  ColorPortrait,
  CVDProfile,
  Garment,
  GarmentCategory,
  PairVerdict,
  Verdict,
} from '@/core/contracts/types';
import { judgePair, judgeAgainstPalette, type PaletteVerdict } from './verdict';

/** What a piece does in an outfit, which is not the same as its category. */
export type OutfitRole = 'top' | 'bottom' | 'dress' | 'shoes' | 'layer' | 'accessory';

const ROLE_OF: Record<GarmentCategory, OutfitRole> = {
  top: 'top',
  bottom: 'bottom',
  dress: 'dress',
  shoes: 'shoes',
  outerwear: 'layer',
  scarf: 'accessory',
  hat: 'accessory',
  bag: 'accessory',
  belt: 'accessory',
  tie: 'accessory',
  socks: 'accessory',
  other: 'accessory',
};

/**
 * Categories worn close enough to the face for the wearer's own colouring to
 * matter.
 *
 * ⚠️ THIS DISTINCTION EXISTS BECAUSE ITS ABSENCE EMPTIED THE SCREEN. The first
 *    version judged every piece against skin and hair and threw the outfit away
 *    on any collision. With a brown-haired user, tan shoes collide with skin and
 *    brown trousers collide with hair — so a perfectly wearable wardrobe
 *    produced ZERO outfits and a message blaming the user's clothes.
 *
 *    A top that vanishes into your own skin tone is a real effect people
 *    describe. Shoes that happen to sit near your face's hue are not: nobody
 *    sees your feet and your face as one shape. Judging them the same way was
 *    treating a number as if it were an experience.
 */
const NEAR_THE_FACE: ReadonlySet<GarmentCategory> = new Set([
  'top',
  'dress',
  'outerwear',
  'scarf',
  'hat',
  'tie',
]);

export interface OutfitPiece {
  garment: Garment;
  role: OutfitRole;
  /** Against skin and hair. `null` when there is no portrait to judge against. */
  vsPalette: PaletteVerdict | null;
  /** Whether `vsPalette` was allowed to affect the verdict. */
  paletteCounts: boolean;
}

export interface Outfit {
  id: string;
  pieces: OutfitPiece[];
  /** The worst thing true of this outfit. */
  verdict: Verdict;
  /** Pairs worth mentioning: they collide in hue but lightness separates them. */
  risky: { a: Garment; b: Garment; verdict: PairVerdict }[];
  /** Only ever populated for outfits the USER chose — suggestions have none. */
  clashing: { a: Garment; b: Garment; verdict: PairVerdict }[];
  /** A garment in here was measured in poor light, so the whole set is a guide. */
  degraded: boolean;
  /** Pieces the user will not be able to tell apart FROM EACH OTHER. */
  sameFamily: { a: Garment; b: Garment }[];
  /** Face-adjacent pieces that sit close to the wearer's own skin or hair. */
  vanishing: OutfitPiece[];
  certificate: string;
}

/**
 * ⚠️ A CEILING, BECAUSE A WARDROBE CAN COMBINATORIALLY EXPLODE. Twelve tops,
 *    twelve bottoms, six pairs of shoes and four coats is 3.456 candidate sets
 *    before accessories. The lookups are cheap but they are not free, and this
 *    runs on a phone.
 */
const MAX_CANDIDATES = 4000;

const RANK: Record<Verdict, number> = { safe: 0, risky: 1, clash: 2 };
const worse = (a: Verdict, b: Verdict): Verdict => (RANK[b] > RANK[a] ? b : a);

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Every pair judged once. This is the whole performance story: after this,
 * building outfits touches no colour maths at all.
 */
function buildPairMatrix(garments: Garment[], profile: CVDProfile): Map<string, PairVerdict> {
  const matrix = new Map<string, PairVerdict>();
  for (let i = 0; i < garments.length; i++) {
    for (let j = i + 1; j < garments.length; j++) {
      const a = garments[i];
      const b = garments[j];
      matrix.set(
        pairKey(a.id, b.id),
        judgePair({
          aHex: a.colorHex,
          bHex: b.colorHex,
          aName: a.colorName,
          bName: b.colorName,
          profile,
          aConfidence: a.confidence,
          bConfidence: b.confidence,
        }),
      );
    }
  }
  return matrix;
}

function familyOf(families: ColorFamily[], garmentId: string): number | null {
  return families.find((f) => f.garmentIds.includes(garmentId))?.id ?? null;
}

export interface BuildOutfitsOptions {
  garments: Garment[];
  profile: CVDProfile;
  /** `null` is legitimate: the portrait may not have been measured yet. */
  portrait: ColorPortrait | null;
  families?: ColorFamily[];
  limit?: number;
}

/**
 * Build the best complete outfits this wardrobe allows.
 *
 * 🔑 THE CONTRACT: nothing returned here contains a pair that clashes for THIS
 *    person. That is what makes the headline ("no two pieces here will look the
 *    same to you") a statement about the data rather than marketing — and it is
 *    also the limit of what we claim. Colour is checked; the choice is not.
 */
export function buildOutfits({
  garments,
  profile,
  portrait,
  families = [],
  limit = 5,
}: BuildOutfitsOptions): Outfit[] {
  const byRole = (role: OutfitRole) => garments.filter((g) => ROLE_OF[g.category] === role);

  const tops = byRole('top');
  const bottoms = byRole('bottom');
  const dresses = byRole('dress');
  const shoes = byRole('shoes');
  const layers = byRole('layer');
  // Accessories are read for verdicts elsewhere, never composed into a
  // suggestion here — see the note further down for why.

  const matrix = buildPairMatrix(garments, profile);
  const verdictOf = (a: Garment, b: Garment) => matrix.get(pairKey(a.id, b.id));

  // The palette verdict depends only on the garment, so it is computed once per
  // garment rather than once per outfit it appears in.
  const paletteCache = new Map<string, PaletteVerdict | null>();
  const paletteOf = (g: Garment): PaletteVerdict | null => {
    if (!portrait) return null;
    let v = paletteCache.get(g.id);
    if (v === undefined) {
      v = judgeAgainstPalette(g.colorHex, g.colorName, portrait, profile, g.confidence);
      paletteCache.set(g.id, v);
    }
    return v;
  };

  /** Core combinations: a dress, or a top with a bottom. Nothing else is an outfit. */
  const cores: Garment[][] = [
    ...dresses.map((d) => [d]),
    ...tops.flatMap((t) => bottoms.map((b) => [t, b])),
  ];

  // Optional slots include "nothing", so an outfit is still valid without shoes
  // in the wardrobe — a half-built wardrobe should still produce answers.
  const shoeOptions: (Garment | null)[] = shoes.length ? shoes : [null];
  const layerOptions: (Garment | null)[] = [null, ...layers];

  const candidates: Garment[][] = [];
  outer: for (const core of cores) {
    for (const s of shoeOptions) {
      for (const l of layerOptions) {
        candidates.push([...core, ...(s ? [s] : []), ...(l ? [l] : [])]);
        if (candidates.length >= MAX_CANDIDATES) break outer;
      }
    }
  }

  const ctx: ScoreContext = { verdictOf, paletteOf, families };
  const scored = candidates
    .map((pieces) => scoreOutfit(pieces, ctx))
    .filter((x): x is { outfit: Outfit; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);

  return pickDiverse(scored, limit);
}

/**
 * ⚠️ ACCESSORIES ARE DELIBERATELY NOT ADDED TO SUGGESTIONS, and this note is
 *    here because a version that did was written and removed.
 *
 *    They still take part in every pair verdict in the wardrobe — a belt
 *    against shoes and a tie against a shirt are among the collisions the
 *    research cites most — and the user can put them in an outfit themselves.
 *    What they must not be is something WE slip in:
 *
 *      · a belt, a tie and socks have no try-on at all, so a suggested outfit
 *        would show four pieces and be able to render two;
 *      · the scarf and hat engines GENERATE rather than transfer. Measured on
 *        the real endpoint: a flat magenta reference came back as a crimson
 *        patterned scarf in front of the Colosseum, ΔE 31.4 — a colour, a
 *        pattern and a backdrop that were never in the input;
 *      · and adding one shipped a real bug. A tie that passed every
 *        piece-against-piece check collided with the wearer's own skin, so a
 *        `safe` outfit was badged `clash` because of a piece nobody asked for.
 *
 *    Suggesting something we cannot show, and cannot render honestly, is not a
 *    service to someone who cannot check it themselves.
 */

export type UnusedReason = 'no-partner' | 'clashes-with-all' | 'ranked-out';

export interface UnusedGarment {
  garment: Garment;
  reason: UnusedReason;
  /** The reason in the user's language, naming what it collides with. */
  explanation: string;
}

/**
 * Why a garment is in the wardrobe and in none of the outfits on screen.
 *
 * 🔑 THE SILENCE WAS THE PROBLEM. A user photographs eight things, sees three
 *    outfits, and cannot tell whether the missing jacket is unwearable or just
 *    unlucky. For someone who cannot verify any of this themselves, an absence
 *    with no explanation is indistinguishable from a bug — and twice it WAS one.
 */
export function explainUnused(
  garments: Garment[],
  shown: Outfit[],
  profile: CVDProfile,
): UnusedGarment[] {
  const used = new Set(shown.flatMap((o) => o.pieces.map((p) => p.garment.id)));
  const missing = garments.filter((g) => !used.has(g.id));
  if (missing.length === 0) return [];

  const matrix = buildPairMatrix(garments, profile);
  const verdictOf = (a: Garment, b: Garment) => matrix.get(pairKey(a.id, b.id));
  const roleOf = (g: Garment) => ROLE_OF[g.category];

  const tops = garments.filter((g) => roleOf(g) === 'top');
  const bottoms = garments.filter((g) => roleOf(g) === 'bottom');
  const dresses = garments.filter((g) => roleOf(g) === 'dress');

  return missing.map((g) => {
    const role = roleOf(g);

    // Accessories are never suggested by design, so "not in an outfit" says
    // nothing about them. Answering with a colour problem they do not have
    // would be inventing a reason.
    if (role === 'accessory') {
      return {
        garment: g,
        reason: 'ranked-out' as const,
        explanation:
          'We never put accessories into a suggestion — the try-on cannot render them ' +
          'honestly. It still counts in every verdict, and you can add it to an outfit of ' +
          'your own.',
      };
    }

    /**
     * The groups this piece has to survive, not just the obvious one.
     *
     * ⚠️ CHECKING ONLY THE OPPOSITE HALF OF THE OUTFIT GAVE A WRONG ANSWER, and
     *    a user caught it: a camel coat was reported as "simply outranked, ask
     *    for more suggestions" when it clashed with the only pair of shoes in
     *    the wardrobe and could never appear at all. Telling someone to wait
     *    for a garment that will never come is worse than saying nothing.
     *
     *    An outfit fills several slots at once, so ONE fully blocked slot is
     *    enough to keep the piece out forever — whichever slot it is.
     */
    const shoes = garments.filter((x) => roleOf(x) === 'shoes');
    const mustCoexistWith: { label: string; items: Garment[] }[] = [];
    if (role === 'top') mustCoexistWith.push({ label: 'bottoms', items: bottoms });
    else if (role === 'bottom') mustCoexistWith.push({ label: 'tops', items: tops });
    else {
      // A layer or a pair of shoes goes over whatever the base turns out to be.
      if (tops.length || dresses.length)
        mustCoexistWith.push({ label: 'tops', items: [...tops, ...dresses] });
      if (bottoms.length) mustCoexistWith.push({ label: 'bottoms', items: bottoms });
    }
    if (role !== 'shoes' && shoes.length) mustCoexistWith.push({ label: 'shoes', items: shoes });

    const partners = mustCoexistWith.flatMap((s) => s.items);
    if (partners.length === 0) {
      const need = role === 'top' ? 'a bottom' : role === 'bottom' ? 'a top' : 'a top and a bottom';
      return {
        garment: g,
        reason: 'no-partner' as const,
        explanation: `There is nothing to wear it with yet — add ${need} and it can start appearing.`,
      };
    }

    // One slot with no survivor is enough. Report THAT slot, because it is the
    // one the user would have to change something about.
    const blocked = mustCoexistWith.find(
      (s) => s.items.length > 0 && s.items.every((p) => verdictOf(g, p)?.verdict === 'clash'),
    );
    if (blocked) {
      const clashesWith = blocked.items;
      // Naming the collisions is the useful half: "it clashes" is not
      // actionable, "you cannot separate it from these three" is.
      const names = clashesWith.map((p) => p.colorName);
      const list = names.slice(0, 3).join(', ');
      return {
        garment: g,
        reason: 'clashes-with-all' as const,
        explanation:
          `You could not tell it apart from ${blocked.items.length === 1 ? 'the only one of your ' : 'any of your '}` +
          `${blocked.label} — ${list}${names.length > 3 ? ` and ${names.length - 3} more` : ''}. ` +
          `It is not unwearable: it needs ${blocked.label} in a colour you can separate from it.`,
      };
    }

    return {
      garment: g,
      reason: 'ranked-out' as const,
      explanation:
        'It works in outfits we checked — the ones above simply scored higher. Ask for more ' +
        'suggestions and it will appear.',
    };
  });
}

/**
 * Judge a set the USER chose, rather than one we proposed.
 *
 * 🔑 THIS ONE NEVER REFUSES, AND THAT IS THE WHOLE POINT. `buildOutfits` throws
 *    away anything containing a clash, because it is making a recommendation.
 *    Here the person has already decided — perhaps someone they trust put this
 *    combination together for them years ago. Hiding our verdict because we
 *    disagree would leave them wearing it anyway, without the one piece of
 *    information we exist to provide.
 *
 *    So a clashing custom outfit comes back marked `clash`, with the reason.
 *    Telling someone their trusted outfit has a problem is the job; refusing to
 *    show it is not.
 */
export function judgeOutfit({
  pieces,
  profile,
  portrait,
  families = [],
}: {
  pieces: Garment[];
  profile: CVDProfile;
  portrait: ColorPortrait | null;
  families?: ColorFamily[];
}): Outfit | null {
  if (pieces.length === 0) return null;

  const matrix = buildPairMatrix(pieces, profile);
  const ctx: ScoreContext = {
    verdictOf: (a, b) => matrix.get(pairKey(a.id, b.id)),
    paletteOf: (g) =>
      portrait ? judgeAgainstPalette(g.colorHex, g.colorName, portrait, profile, g.confidence) : null,
    families,
  };
  return scoreOutfit(pieces, ctx, { rejectClashes: false })?.outfit ?? null;
}

interface ScoreContext {
  verdictOf: (a: Garment, b: Garment) => PairVerdict | undefined;
  paletteOf: (g: Garment) => PaletteVerdict | null;
  families: ColorFamily[];
}

function scoreOutfit(
  pieces: Garment[],
  ctx: ScoreContext,
  { rejectClashes = true }: { rejectClashes?: boolean } = {},
): { outfit: Outfit; score: number } | null {
  const risky: Outfit['risky'] = [];
  const clashing: Outfit['risky'] = [];
  const sameFamily: Outfit['sameFamily'] = [];
  let internal: Verdict = 'safe';

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const v = ctx.verdictOf(pieces[i], pieces[j]);
      if (!v) continue;
      // 🔑 ONE CLASH KILLS A SUGGESTION. That is the promise of the suggestions
      //    list: what comes out of it has been checked so the user does not
      //    have to. A set the USER assembled is reported instead — see
      //    `judgeOutfit`.
      if (v.verdict === 'clash') {
        if (rejectClashes) return null;
        clashing.push({ a: pieces[i], b: pieces[j], verdict: v });
      }
      if (v.verdict === 'risky') risky.push({ a: pieces[i], b: pieces[j], verdict: v });
      internal = worse(internal, v.verdict);

      const fa = familyOf(ctx.families, pieces[i].id);
      const fb = familyOf(ctx.families, pieces[j].id);
      if (fa !== null && fa === fb) sameFamily.push({ a: pieces[i], b: pieces[j] });
    }
  }

  const built: OutfitPiece[] = pieces.map((g) => ({
    garment: g,
    role: ROLE_OF[g.category],
    vsPalette: ctx.paletteOf(g),
    paletteCounts: NEAR_THE_FACE.has(g.category),
  }));

  /**
   * ⚠️ THE PALETTE WARNS; IT DOES NOT VETO. A piece merging into the wearer's
   *    own skin is worth saying out loud, but it is a different question from
   *    the one this screen promises to have answered — "do these pieces clash
   *    with each other" — and letting it delete outfits made the feature
   *    silently useless for anyone whose wardrobe sits near their own colouring.
   */
  const paletteWorst: Verdict = built.reduce<Verdict>(
    (acc, p) => (p.vsPalette && p.paletteCounts ? worse(acc, p.vsPalette.worst.verdict) : acc),
    'safe',
  );
  const vanishing = built.filter(
    (p) => p.paletteCounts && p.vsPalette && p.vsPalette.worst.verdict !== 'safe',
  );
  const vanishingClash = built.filter(
    (p) => p.paletteCounts && p.vsPalette && p.vsPalette.worst.verdict === 'clash',
  );

  const degraded = pieces.some((g) => g.confidence.level === 'low_light');

  /**
   * A dress IS the outfit, so a top or a bottom beside it is not one.
   *
   * ⚠️ SAID, NOT BLOCKED. The suggestions never build this — a core is either a
   *    dress or a top-and-bottom pair. But a set the user assembled is theirs,
   *    and refusing to judge it because we disagree with the shape would leave
   *    them with no answer about the colours, which is the part they cannot
   *    check. It is also not always wrong: a top under a pinafore is a real
   *    outfit. So it is a note, not a veto.
   *
   *    A coat is a different matter and deliberately absent from this check:
   *    a dress with a coat over it is exactly the case the engine's `outer`
   *    category exists for.
   */
  const roles = new Set(pieces.map((g) => ROLE_OF[g.category]));
  const dressWithSeparates =
    roles.has('dress') && (roles.has('top') || roles.has('bottom'));
  const verdict = worse(worse(internal, paletteWorst), degraded ? 'risky' : 'safe');
  // `internal` already carries a clash when rejection is off, so nothing extra.

  /**
   * Scoring, in plain terms: fewer warnings is better, and a complete outfit
   * beats a partial one.
   *
   * ⚠️ THE SAME-FAMILY PENALTY IS NOT AESTHETIC. Two pieces in one colour family
   *    are, by the definition in `computeFamilies`, ones THIS PERSON CANNOT TELL
   *    APART. An outfit built from them is the accidental-monochrome failure:
   *    it never clashes, so a pair-checker calls it perfect, and the user walks
   *    out unable to see the difference between their own shirt and trousers.
   */
  const score =
    pieces.length * 10 -
    risky.length * 6 -
    sameFamily.length * 8 -
    (paletteWorst === 'clash' ? 14 : paletteWorst === 'risky' ? 5 : 0) -
    (degraded ? 12 : 0);

  return {
    score,
    outfit: {
      id: pieces.map((p) => p.id).join('+'),
      pieces: built,
      verdict,
      risky,
      clashing,
      degraded,
      sameFamily,
      vanishing,
      certificate: certify({
        risky,
        clashing,
        vanishingClash,
        dressWithSeparates,
        sameFamily,
        vanishing,
        degraded,
        hasPortrait: built.some((b) => b.vsPalette !== null),
      }),
    },
  };
}

/**
 * Pick sets that are actually different from each other.
 *
 * ⚠️ WITHOUT THIS, THE TOP FIVE ARE THE SAME OUTFIT FIVE TIMES. The ranking is
 *    dominated by whichever top scores best, so the list comes back as that
 *    shirt with five pairs of trousers — technically the best five, useless as
 *    a set of choices. Two outfits count as different when they differ in a
 *    core piece.
 */
function pickDiverse(scored: { outfit: Outfit; score: number }[], limit: number): Outfit[] {
  const coreOf = (o: Outfit) =>
    o.pieces
      .filter((p) => p.role === 'top' || p.role === 'bottom' || p.role === 'dress')
      .map((p) => p.garment.id);

  const chosen: Outfit[] = [];
  const usedCores: string[][] = [];

  for (const { outfit } of scored) {
    if (chosen.length >= limit) break;
    const core = coreOf(outfit);
    const tooSimilar = usedCores.some((prev) => prev.every((id) => core.includes(id)));
    if (tooSimilar) continue;
    chosen.push(outfit);
    usedCores.push(core);
  }

  /**
   * 🔑 EVERY GARMENT THAT CAN BE WORN GETS A CHANCE TO BE SEEN.
   *
   * ⚠️ A USER REPORTED THIS AND THEY WERE RIGHT: a jacket they had photographed
   *    never appeared in a single suggestion. Nothing was wrong with it.
   *
   *    The diversity key is the CORE — top, bottom, dress — so for one
   *    top-and-trousers pair exactly one variant survives, with the coat or
   *    without it. The coat adds a piece (+10) but also its own warnings, and
   *    whenever those outweighed the bonus the bare version won. Lose on every
   *    core and the garment is invisible forever, with the wardrobe insisting it
   *    is fine.
   *
   *    So after ranking, anything wearable that no chosen outfit uses gets its
   *    best-scoring outfit swapped in over the weakest one. A suggestion list
   *    that silently ignores part of someone's wardrobe is not a suggestion
   *    list, it is a shorter wardrobe.
   */
  const covered = () => new Set(chosen.flatMap((o) => o.pieces.map((p) => p.garment.id)));
  const wearable = new Set(
    scored.flatMap(({ outfit }) =>
      outfit.pieces.filter((p) => p.role !== 'accessory').map((p) => p.garment.id),
    ),
  );

  for (const id of wearable) {
    if (covered().has(id)) continue;
    const best = scored.find(({ outfit }) => outfit.pieces.some((p) => p.garment.id === id));
    if (!best) continue;
    if (chosen.length < limit) chosen.push(best.outfit);
    // At capacity: the weakest suggestion is worth less than showing a garment
    // the user owns and has never seen recommended.
    else chosen[chosen.length - 1] = best.outfit;
  }

  // A small wardrobe may not offer `limit` distinct cores. Better to return
  // three honest outfits than pad the list with near-duplicates.
  return chosen;
}

/**
 * The certificate, in the user's language.
 *
 * ⚠️ NEVER CLAIM A CHECK WE DID NOT RUN. Without a portrait there is no verdict
 *    against skin and hair, and the sentence has to say so rather than quietly
 *    describe a smaller check in confident words.
 */
function certify(a: {
  risky: Outfit['risky'];
  clashing: Outfit['risky'];
  vanishingClash: OutfitPiece[];
  dressWithSeparates: boolean;
  sameFamily: Outfit['sameFamily'];
  vanishing: OutfitPiece[];
  degraded: boolean;
  hasPortrait: boolean;
}): string {
  const parts: string[] = [];

  /**
   * ⚠️ COUNT THE PAIRS THAT ACTUALLY LEAN ON LIGHTNESS, not every `risky` one.
   *    A pair also turns `risky` when one of the two was measured in poor light,
   *    and describing that as "leaning on lightness rather than colour" invents
   *    a colour relationship out of a measurement problem. Two different
   *    warnings; they do not get to share a sentence.
   */
  const leaning = a.risky.filter((r) => r.verdict.savedByLuminance);

  /**
   * ⚠️ THE HEADLINE HAS TO AGREE WITH THE BADGE, AND ONCE IT DID NOT.
   *
   *    Three outfits were shown badged "Clashes" above a sentence reading
   *    "Nothing in this outfit collides for you." The badge was reading the
   *    palette verdict and this text was only counting piece-against-piece
   *    pairs. A card contradicting itself is worse than either message alone,
   *    and our user cannot look at the colours to decide which half to believe.
   */
  if (a.vanishingClash.length > 0) {
    const names = a.vanishingClash.map((p) => p.garment.colorName).join(' and ');
    parts.push(
      `The ${names} will look like your own skin or hair to you — against your face it ` +
        `reads as nothing at all.`,
    );
  }

  // A set the user chose can contain a real collision. Say it plainly: it is
  // the whole reason they cannot check this themselves.
  if (a.clashing.length > 0) {
    parts.push(
      a.clashing.length === 1
        ? 'These two will look like the same colour to you.'
        : `${a.clashing.length} pairs in this outfit will look like the same colour to you.`,
    );
  }

  parts.push(
    a.clashing.length > 0 || a.vanishingClash.length > 0
      ? 'The pieces themselves are fine together.'
      : leaning.length === 0
      ? 'Nothing in this outfit collides for you.'
      : `Nothing collides badly, but ${leaning.length === 1 ? 'one pair leans' : `${leaning.length} pairs lean`} on lightness rather than colour to stay apart.`,
  );

  if (!a.hasPortrait) {
    parts.push('Not checked against your face — no colour portrait has been measured yet.');
  } else if (a.vanishing.length === 0) {
    parts.push('Checked against your skin and your hair too.');
  } else if (a.vanishingClash.length === a.vanishing.length) {
    // Already said above, in stronger words. Do not say it twice, softer.
  } else {
    // Name the piece. "Something clashes with you" is not actionable; "the navy
    // top sits close to your skin" is.
    const names = a.vanishing.map((p) => p.garment.colorName).join(' and ');
    parts.push(
      `Worth knowing: the ${names} sits close to your own skin or hair, so it will not stand out against you.`,
    );
  }

  if (a.sameFamily.length > 0) {
    parts.push(
      `Careful: ${a.sameFamily.length === 1 ? 'two of these pieces are' : 'some of these pieces are'} a colour you cannot separate from each other, so the outfit may read as one block.`,
    );
  }

  if (a.degraded) {
    parts.push('One of these was measured in poor light, so treat this as a guide.');
  }

  if (a.dressWithSeparates) {
    parts.push(
      'One thing about the shape rather than the colour: a dress is already a whole outfit, ' +
        'so a top or trousers beside it only works if you are layering them deliberately.',
    );
  }

  return parts.join(' ');
}
