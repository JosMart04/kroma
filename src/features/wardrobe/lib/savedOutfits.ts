/**
 * ══════════════════════════════════════════════════════════════════════════
 *  SAVED OUTFITS — the ones the user put together, and their render
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  🔑 WHY THIS EXISTS AND THE SUGGESTIONS ARE NOT ENOUGH.
 *
 *     A lot of people with colour vision deficiency already own outfits that
 *     work, because someone they trust assembled them years ago. A parent, a
 *     partner. They wear them because they are known-safe, not because they
 *     were chosen.
 *
 *     A product that only ever proposes its own combinations ignores that
 *     entirely — and worse, offers no way to check the outfit they already
 *     rely on. Saving one means the app can finally answer the question nobody
 *     has asked them: is the safe outfit actually safe?
 *
 *  ⚠️ STORED IN `meta` AS JSON, DELIBERATELY, RATHER THAN IN A NEW OBJECT STORE.
 *     A new store means an IndexedDB version bump, and a migration that goes
 *     wrong takes the user's whole wardrobe with it. A handful of id lists is
 *     not worth that risk. The render itself goes in the existing `images`
 *     store, which is already the right shape for a blob.
 */
import { getMeta, setMeta, saveImage, getImage, deleteImage } from '@/core/db';

const KEY = 'saved-outfits';

export interface SavedOutfit {
  id: string;
  /** Order matters: it is the order the pieces are rendered in. */
  garmentIds: string[];
  name: string;
  createdAt: string;
  /** True once a render has been stored for it. The blob lives under `imageKey`. */
  hasRender: boolean;
}

/** Where this outfit's render lives in the images store. */
export function renderKey(outfitId: string): string {
  return `outfit:${outfitId}`;
}

export async function listSavedOutfits(): Promise<SavedOutfit[]> {
  const raw = await getMeta(KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedOutfit[]) : [];
  } catch {
    // A corrupt blob is not worth crashing the screen over, and there is
    // nothing here we cannot ask the user to rebuild.
    return [];
  }
}

async function write(all: SavedOutfit[]): Promise<void> {
  await setMeta(KEY, JSON.stringify(all));
}

export async function saveOutfit(garmentIds: string[], name: string): Promise<SavedOutfit> {
  const all = await listSavedOutfits();
  const outfit: SavedOutfit = {
    // Stable and derived from the contents, so saving the same combination
    // twice updates it instead of filling the list with duplicates.
    id: [...garmentIds].sort().join('+'),
    garmentIds,
    name: name.trim() || 'My outfit',
    createdAt: new Date().toISOString(),
    hasRender: false,
  };
  const existing = all.findIndex((o) => o.id === outfit.id);
  if (existing >= 0) {
    // Keep the render it already has: the pieces have not changed.
    outfit.hasRender = all[existing].hasRender;
    all[existing] = outfit;
  } else {
    all.unshift(outfit);
  }
  await write(all);
  return outfit;
}

export async function deleteSavedOutfit(id: string): Promise<void> {
  await write((await listSavedOutfits()).filter((o) => o.id !== id));
  // The blob would otherwise sit in storage forever with nothing pointing at it.
  await deleteImage(renderKey(id)).catch(() => undefined);
}

/**
 * Keep the render so the user is not charged twice for the same picture.
 *
 * ⚠️ THIS IS A SPENDING DECISION, NOT A CACHE. Every render costs a unit of the
 *    user's own account, so re-rendering an unchanged outfit each time the
 *    screen opens would quietly bill them for looking. It is only regenerated
 *    when they ask.
 */
export async function saveOutfitRender(id: string, image: Blob): Promise<void> {
  await saveImage(renderKey(id), image);
  const all = await listSavedOutfits();
  const i = all.findIndex((o) => o.id === id);
  if (i >= 0) {
    all[i] = { ...all[i], hasRender: true };
    await write(all);
  }
}

export async function getOutfitRender(id: string): Promise<Blob | null> {
  return getImage(renderKey(id));
}
