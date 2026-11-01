/**
 * ══════════════════════════════════════════════════════════════════════════
 *  LOCAL STORAGE — THERE IS NO DATABASE, AND THAT IS DELIBERATE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  The wardrobe, the profile and the images live in IndexedDB, in the browser.
 *  No accounts, no login, no external service, no cost.
 *
 *  WHY, and it is not laziness:
 *
 *  The rules require the project to be available "free of charge and without
 *  any restriction" to the judges until 31 August. Consider what a login does:
 *  a judge opens the link on a Tuesday night, meets a sign-up form, creates an
 *  account, gets in — and every screen is empty anyway, because the wardrobe is
 *  theirs and they have not photographed anything. All the form bought was a
 *  reason to close the tab.
 *
 *  SQLite would not help either: Vercel's filesystem is ephemeral and is wiped
 *  between invocations. We would end up on a hosted Turso or similar — back
 *  where we started, with an account to manage.
 *
 *  ⚠️ THE APP STARTS EMPTY AND STAYS THAT WAY UNTIL THE USER TAKES A PHOTO.
 *     An earlier version of this comment said the wardrobe "needs to be FULL
 *     when the judge arrives" and pointed at a seeding module. That module is
 *     gone and the argument was backwards: pre-baked colours presented as
 *     measurements are precisely the failure this product exists to prevent,
 *     and our user is the one person who could not catch them. The empty start
 *     is paid for by the guided three-step onboarding, not by fake data.
 *
 *  The only thing we lose is persistence across devices. For a product with no
 *  account, that is the honest trade rather than a gap.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CVDProfile, ColorPortrait, Garment } from '@/core/contracts/types';

interface CBFDatabase extends DBSchema {
  profile: { key: string; value: { id: 'me'; cvd: CVDProfile | null; portrait: ColorPortrait | null } };
  garments: { key: string; value: Garment; indexes: { 'by-category': string } };
  /**
   * Images as Blobs. IndexedDB handles them well and gives hundreds of MB.
   *
   * Keyed by garment id, plus `me-body`: the one full-body photo the try-on
   * reuses for every garment, so nobody has to pose twice.
   */
  images: { key: string; value: Blob };
  /** Internal storage flags. Small key/value strings, no user data. */
  meta: { key: string; value: string };
}

let _db: Promise<IDBPDatabase<CBFDatabase>> | null = null;

function db() {
  if (typeof indexedDB === 'undefined') {
    throw new Error('El almacenamiento local solo existe en el navegador. Este módulo no se usa en el servidor.');
  }
  _db ??= openDB<CBFDatabase>('colorblindfit', 2, {
    // ⚠️ Migración por versión, no incondicional: quien ya tenga la v1 abierta
    // en su navegador —cualquiera que probara la app antes de hoy— llegaría aquí
    // con los tres almacenes ya creados, y crearlos otra vez lanza.
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('profile', { keyPath: 'id' });
        const g = d.createObjectStore('garments', { keyPath: 'id' });
        g.createIndex('by-category', 'category');
        d.createObjectStore('images');
      }
      if (oldVersion < 2) {
        d.createObjectStore('meta');
      }
    },
  });
  return _db;
}

// ── Banderas internas ────────────────────────────────────────────────────
export async function getMeta(key: string): Promise<string | null> {
  return (await (await db()).get('meta', key)) ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await (await db()).put('meta', value, key);
}

// ── Perfil ───────────────────────────────────────────────────────────────
export async function getProfile(): Promise<CVDProfile | null> {
  return (await (await db()).get('profile', 'me'))?.cvd ?? null;
}

export async function getPortrait(): Promise<ColorPortrait | null> {
  return (await (await db()).get('profile', 'me'))?.portrait ?? null;
}

export async function saveProfile(cvd: CVDProfile): Promise<void> {
  const d = await db();
  const cur = await d.get('profile', 'me');
  await d.put('profile', { id: 'me', cvd, portrait: cur?.portrait ?? null });
}

export async function savePortrait(portrait: ColorPortrait): Promise<void> {
  const d = await db();
  const cur = await d.get('profile', 'me');
  await d.put('profile', { id: 'me', cvd: cur?.cvd ?? null, portrait });
}

// ── Armario ──────────────────────────────────────────────────────────────
export async function listGarments(): Promise<Garment[]> {
  return (await db()).getAll('garments');
}

export async function getGarment(id: string): Promise<Garment | null> {
  return (await (await db()).get('garments', id)) ?? null;
}

export async function saveGarment(g: Garment): Promise<void> {
  await (await db()).put('garments', g);
}

export async function deleteGarment(id: string): Promise<void> {
  const d = await db();
  await d.delete('garments', id);
  await d.delete('images', id);
}

// ── Imágenes ─────────────────────────────────────────────────────────────

/**
 * The key the user's own body photo is stored under, shared by every screen
 * that dresses them.
 *
 * ⚠️ IT LIVES HERE BECAUSE HAVING TWO COPIES ALREADY BROKE SOMETHING. The
 *    outfit try-on declared its own constant and spelled it `body-photo` while
 *    the garment try-on had been saving under `me-body`. Nothing errored: the
 *    lookup simply found nothing and the screen told the user "I do not have a
 *    photo of you on this device yet" — blaming them for a typo of ours. A key
 *    with two owners is a silent failure waiting for a second caller.
 */
export const BODY_PHOTO_KEY = 'me-body';

/**
 * ⚠️ Guarda SIEMPRE el binario, nunca la URL de YouCam: caduca a las 2 horas.
 * Si guardas el enlace, el demo se cae en cámara y cualquier juez que abra la
 * app entre el 18 y el 31 de agosto verá un error.
 */
export async function saveImage(id: string, blob: Blob): Promise<void> {
  await (await db()).put('images', blob, id);
}

/**
 * Remove one stored image.
 *
 * `deleteGarment` already drops a garment's photo, but an outfit render is
 * keyed independently of any garment, so deleting the outfit has to drop it
 * too — otherwise the blob stays in storage with nothing pointing at it.
 */
export async function deleteImage(id: string): Promise<void> {
  await (await db()).delete('images', id);
}

export async function getImageUrl(id: string): Promise<string | null> {
  const blob = await (await db()).get('images', id);
  return blob ? URL.createObjectURL(blob) : null;
}

/**
 * The stored binary itself, for when it has to be sent somewhere rather than
 * displayed. The try-on posts the user's photo and the garment's photo back to
 * our own route, and an object URL cannot be uploaded.
 */
export async function getImage(id: string): Promise<Blob | null> {
  return (await (await db()).get('images', id)) ?? null;
}

/**
 * The "start over" button, and the only way to run the whole journey twice.
 *
 * ⚠️ It clears `images` too, which includes the body photo the try-on stores.
 *    Starting over has to mean starting over: leaving a photo of the previous
 *    person behind would be both wrong and unpleasant.
 */
export async function resetAll(): Promise<void> {
  const d = await db();
  await Promise.all([
    d.clear('profile'),
    d.clear('garments'),
    d.clear('images'),
    d.clear('meta'),
  ]);
}
