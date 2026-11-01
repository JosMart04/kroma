/**
 * ══════════════════════════════════════════════════════════════════════════
 *  OUR WARDROBE CATEGORIES → THE ENGINE'S `garment_category`
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Two vocabularies that look alike and are not the same, which is exactly how
 *  a wrong value ships. Ours describes what the user owns; the engine's
 *  describes what its renderer can place on a body.
 *
 *  ⚠️ CORRECTED 17 AUG 2026 — THE DOCUMENTED NAME WAS WRONG, NOT THE CAPABILITY.
 *
 *     This file said a coat cannot be rendered as outerwear, because sending
 *     `outerwear` returns 400 "garment_category is not one of the accepted
 *     values". That test was right and the conclusion was wrong: the engine
 *     does have a dedicated outerwear mode and it is spelled `outer`.
 *
 *     It surfaced from the MCP tool's own `inputSchema`, which publishes the
 *     enum the REST documentation only describes in prose:
 *         full_body · lower_body · upper_body · shoes · auto · outer
 *
 *     Confirmed on REST too, without spending a unit, by sending a deliberately
 *     invalid `file_id` so no task starts — an accepted enum answers about the
 *     file, a rejected one answers about the enum:
 *         upper_body  → "One or more parameters in this request are invalid"
 *         outer       → the same, i.e. ACCEPTED
 *         outerwear   → "garment_category is not one of the accepted values"
 *
 *     So a coat is now rendered as a coat. Keeping `outerwear` in our own
 *     vocabulary is still correct — the user owns a coat, and the wardrobe
 *     verdicts treat it as one.
 *
 *  ⚠️ NOT EVERYTHING IN A WARDROBE CAN BE RENDERED, and that is not a bug to
 *     paper over. A belt, a tie and a pair of socks have no try-on, and the
 *     clashes they take part in are among the most cited in the research. They
 *     stay in the wardrobe and in every verdict; they simply have no picture.
 *     `null` here means "no render", and the UI must say so rather than
 *     silently substitute a category the engine would accept.
 */
import type { GarmentCategory } from '@/core/contracts/types';

/** The six values `cloth-v4` actually accepts, from the MCP tool's own schema. */
export type EngineGarmentCategory =
  | 'full_body'
  | 'upper_body'
  | 'lower_body'
  | 'shoes'
  | 'auto'
  | 'outer';

const MAPPING: Partial<Record<GarmentCategory, EngineGarmentCategory>> = {
  top: 'upper_body',
  // The trap is the SPELLING, not the capability: `outerwear` is a 400, `outer`
  // is the real value. See the correction at the top of this file.
  outerwear: 'outer',
  bottom: 'lower_body',
  dress: 'full_body',
};

/**
 * What to send for one of our categories, or `null` when `cloth-v4` cannot
 * render it at all.
 *
 * ⚠️ Shoes are absent on purpose. The engine accepts `shoes`, but footwear
 *    try-on is declared out of scope for this submission, and quietly rendering
 *    it would contradict the scope we publish. Scarves and hats have their own
 *    endpoints and are handled by F14, not here.
 */
export function toEngineCategory(c: GarmentCategory): EngineGarmentCategory | null {
  return MAPPING[c] ?? null;
}

/**
 * The order pieces have to be rendered in: you put the coat on LAST.
 *
 * ⚠️ THE CHAIN REDRAWS ITS OWN OUTPUT, so the sequence is the layering. Render
 *    a coat and then a dress and the engine paints the dress over the coat —
 *    a plausible, wrong picture, which is the worst failure this product has.
 *
 *    It matters most for outfits the USER saved, where the order is whatever
 *    they happened to tap. Nobody should have to know that tapping the jacket
 *    first ruins the render.
 */
const LAYER_ORDER: Partial<Record<GarmentCategory, number>> = {
  dress: 0,
  top: 0,
  bottom: 0,
  outerwear: 1,
};

/**
 * Which pieces of an outfit actually go on the body, in the order they go on.
 *
 * 🔑 ONE OWNER FOR THIS DECISION, AND IT COST A BUG TO LEARN.
 *
 *    The panel filtered with `isRenderable`, which is true for a scarf — right
 *    for the single-garment try-on, where `/task/scarf` exists. But an OUTFIT
 *    chain is `cloth-v4` only, and its route filters with `toEngineCategory`.
 *    So a saved outfit of scarf + top + trousers showed "scarf and top" as the
 *    two pieces going on, while the server quietly rendered top and trousers.
 *
 *    The render was right and the screen was wrong, which is not "only a
 *    display problem": the panel also states what the user is about to be
 *    charged. Scarf + top would have promised two renders and paid for one.
 */
export function piecesForOutfitRender<T extends { category: GarmentCategory }>(
  pieces: readonly T[],
): T[] {
  return pieces
    .filter((p) => toEngineCategory(p.category) !== null)
    .sort((a, b) => (LAYER_ORDER[a.category] ?? 0) - (LAYER_ORDER[b.category] ?? 0))
    .slice(0, MAX_OUTFIT_PIECES);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F14 · SCARVES AND HATS ARE A DIFFERENT ENDPOINT, NOT A CLOTH CATEGORY
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  `cloth-v4` does not render them at all; `/task/scarf` and `/task/hat` do.
 *
 *  ⚠️ WHY THESE TWO AND NOT SHOES OR A BAG. Because they FRAME THE FACE. A
 *     scarf sits directly against the skin tone measured in F2, so it is the
 *     tightest demonstration of the product's whole claim: skin and clothing
 *     are one decision, not two. A shoe is far from the face and says nothing
 *     about undertone, which is why footwear try-on is out of scope while shoes
 *     stay in the wardrobe and in every verdict.
 *
 *  ⚠️ BOTH ENDPOINTS REQUIRE `gender`, AND IT IS ABSENT FROM THE GENERIC
 *     EXAMPLES IN THE DOCUMENTATION. Omitting it produces an unclear error.
 *     We do not measure it, we do not infer it, and we do not store it: it is
 *     asked for at the moment of the render, labelled as the engine's field.
 *     Guessing someone's gender from a photograph to satisfy an API parameter
 *     is not a shortcut this product takes.
 */
/**
 * How many garments one outfit render may chain.
 *
 * ⚠️ A TIME BUDGET, NOT A PRODUCT PREFERENCE. Vercel's free plan caps a request
 *    at 60s; a `cloth-v4` render is ~25s and each pass needs its own upload
 *    first. Three do not fit, and timing out after spending two units is the
 *    worst outcome available.
 *
 *    It lives here rather than in the route because a Next route handler may
 *    only export its own reserved names, and because the screen has to state
 *    the same number the server enforces — two copies of a shared constant is
 *    the bug that already cost us the body-photo key.
 */
export const MAX_OUTFIT_PIECES = 2;

export type AccessoryKind = 'scarf' | 'hat';

export function toAccessoryKind(c: GarmentCategory): AccessoryKind | null {
  return c === 'scarf' || c === 'hat' ? c : null;
}

/** Whether the engine can render this category at all, either way. */
export function isRenderable(c: GarmentCategory): boolean {
  return toEngineCategory(c) !== null || toAccessoryKind(c) !== null;
}
