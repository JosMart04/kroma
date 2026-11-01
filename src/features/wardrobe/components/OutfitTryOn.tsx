'use client';

/**
 * F19 · The outfit on the body.
 *
 * ⚠️ THE PICTURE IS GENERATED AND THE SCREEN HAS TO SAY SO. By the second pass
 *    the engine is redrawing its own output. It answers "how does this hang on
 *    a body", which is worth knowing and is not a colour measurement. The
 *    verdicts stay where they were: computed from what we measured at ingestion.
 *
 * 🔑 THE RENDER IS KEPT, AND THAT IS A SPENDING DECISION RATHER THAN A CACHE.
 *    Each pass costs a unit of the user's own account, so regenerating an
 *    unchanged outfit every time this panel opens would quietly bill them for
 *    looking at it. It is stored the first time and only redone when asked.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader, TriangleAlert, Shirt, X, RefreshCw, Info } from 'lucide-react';
import type { CVDProfile, Garment } from '@/core/contracts/types';
import { getImage, BODY_PHOTO_KEY } from '@/core/db';
import { readApiError, GarmentThumb, DualView } from '@/core/ui';
import type { Outfit } from '@/core/color';
import { piecesForOutfitRender, toEngineCategory } from '@/core/youcam/tryOnCategory';

/** What one `cloth-v4` render costs, from the paginated `/credit/feature-cost` list. */
const UNITS_PER_RENDER = 2;
import { getOutfitRender, saveOutfitRender } from '../lib/savedOutfits';

interface Props {
  outfit: Outfit;
  /** Passed through to the thumbnails so they honour assisted contrast. */
  profile: CVDProfile | null;
  onClose: () => void;
}

export function OutfitTryOn({ outfit, profile, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [fromStore, setFromStore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);

  /**
   * ⚠️ THE SAME FUNCTION THE ROUTE USES, and that is the whole point of it.
   *
   *    This filtered with `isRenderable`, which is true for a scarf because the
   *    single-garment try-on has an engine for one. An outfit chain does not:
   *    it is `cloth-v4` only. So a saved scarf + top + trousers listed "scarf
   *    and top" as the two pieces going on while the server rendered top and
   *    trousers — and the cost warning right below is built from this list.
   */
  const wearable: Garment[] = piecesForOutfitRender(outfit.pieces.map((p) => p.garment));

  /**
   * What is left out, split by the REAL reason.
   *
   * ⚠️ THREE DIFFERENT REASONS, AND LUMPING THEM TOGETHER TOLD A LIE. A first
   *    version called everything excluded "an accessory", which then announced
   *    that a pair of shoes was not clothing. Shoes have an engine and are
   *    deliberately out of scope; a belt has no engine at all; and a second
   *    coat is simply over the time budget. Only the last of those might change.
   */
  const left = outfit.pieces.map((p) => p.garment).filter((g) => !wearable.includes(g));
  const noEngine = left.filter(
    (g) => toEngineCategory(g.category) === null && g.category !== 'shoes',
  );
  const footwear = left.filter((g) => g.category === 'shoes');
  const overBudget = left.filter((g) => toEngineCategory(g.category) !== null);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    getOutfitRender(outfit.id)
      .then((blob) => {
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setResult(url);
        setFromStore(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [outfit.id]);

  const render = useCallback(async () => {
    setBusy(true);
    setError(null);
    setAction(null);
    try {
      const body = await getImage(BODY_PHOTO_KEY);
      if (!body) {
        setError('I do not have a photo of you on this device yet.');
        setAction('Take one on any garment’s try-on screen and it will be reused here.');
        return;
      }
      const photos = await Promise.all(wearable.map((g) => getImage(g.id)));
      if (photos.some((p) => !p)) {
        setError('I no longer have the photo of one of these garments on this device.');
        return;
      }

      const fd = new FormData();
      fd.append('person', body, 'person.jpg');
      wearable.forEach((g, i) => {
        fd.append('garment', photos[i]!, 'garment.jpg');
        fd.append('category', g.category);
      });

      const res = await fetch('/api/outfit', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await readApiError(res);
        setError(d.message);
        setAction(d.action ?? null);
        return;
      }
      const blob = await res.blob();
      await saveOutfitRender(outfit.id, blob).catch(() => undefined);
      setResult(URL.createObjectURL(blob));
      setFromStore(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The outfit render did not come back.');
    } finally {
      setBusy(false);
    }
  }, [outfit.id, wearable]);

  return (
    <div className="mt-4 rounded-xl border-2 border-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-slate-900">This outfit on you</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg border-2 border-slate-300 p-2 text-slate-700"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {wearable.length === 0 ? (
        <p className="mt-3 text-sm text-slate-700">
          None of these pieces can be rendered on a body. They stay in your wardrobe and in
          every verdict — there is just no picture of them being worn.
        </p>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-2" role="list">
            {wearable.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                <GarmentThumb garment={g} profile={profile} size="sm" />
                <span className="text-sm font-medium text-slate-800">{g.colorName}</span>
              </li>
            ))}
          </ul>

          {/*
            ⚠️ NAME WHAT IS LEFT OUT AND WHY. "The rest either has no try-on or
            does not fit" made the user check the code to find out which of the
            two applied to their scarf. The reasons are different — one is
            permanent, one is a time budget — and only one of them is worth
            them doing anything about.
          */}
          {left.length > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              {noEngine.length > 0 && (
                <>
                  The {noEngine.map((g) => g.colorName).join(', ')} has no try-on at all — it
                  stays in your wardrobe and in every verdict, there is just no picture of it
                  being worn.{' '}
                </>
              )}
              {footwear.length > 0 && (
                // Phrased to avoid agreeing with the garment's name: "the navy
                // shoes is judged" was what the first version produced.
                <>
                  Footwear is left out of these renders on purpose, so there is no picture of
                  the {footwear.map((g) => g.colorName).join(', ')} — the verdict still
                  counts it.{' '}
                </>
              )}
              {overBudget.length > 0 && (
                <>
                  The {overBudget.map((g) => g.colorName).join(', ')} fits the engine but not
                  this render: two pieces is all one request has time for.
                </>
              )}
            </p>
          )}

          {/*
            ⚠️ The engine's documented reference spec supports the lower body only
            as "actual worn outfits, not standalone product images". Saying so
            before the render is cheaper than a wrong picture.
          */}
          {wearable.some((g) => g.category === 'bottom') && (
            <p className="mt-2 flex items-start gap-2 text-sm text-slate-600">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              For trousers and skirts the engine needs a photo of them being worn — a flat product shot is not supported for the lower body, and usually comes back wrong.
            </p>
          )}

          {result ? (
            <div className="mt-4">
              <p className="mb-3 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
                <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  Generated by the try-on engine, one pass per piece — not photographed.
                  Judge the fit and the drape from it; the colour verdict above comes from
                  the measurement, which is the part you can trust.
                  {fromStore && ' Kept from last time, so you are not charged twice.'}
                </span>
              </p>

              {/* The same controls as the single-garment try-on: their view,
                  assisted contrast, and the true colours. */}
              {profile ? (
                <DualView
                  src={result}
                  profile={profile}
                  alt={`You wearing ${wearable.map((g) => g.colorName).join(' and ')}`}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result}
                  alt={`You wearing ${wearable.map((g) => g.colorName).join(' and ')}`}
                  className="w-full rounded-xl"
                />
              )}

              <button
                type="button"
                onClick={render}
                disabled={busy}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border-2 border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden />
                {busy ? 'Rendering…' : `Render again (${wearable.length * UNITS_PER_RENDER} more units)`}
              </button>
            </div>
          ) : (
            <>
              {/* The cost, before the button. */}
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                <span>
                  This runs the engine once per piece — <strong>{wearable.length} renders</strong>{' '}
                  at {UNITS_PER_RENDER} units each — spent from your YouCam account. The picture is kept
                  afterwards, so opening this again is free.
                </span>
              </p>

              <button
                type="button"
                onClick={render}
                disabled={busy}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader size={16} className="animate-spin" aria-hidden />
                    Dressing you…
                  </>
                ) : (
                  <>
                    <Shirt size={16} aria-hidden />
                    Render {wearable.length} {wearable.length === 1 ? 'piece' : 'pieces'}
                  </>
                )}
              </button>
            </>
          )}
        </>
      )}

      {error && (
        <div role="alert" className="mt-3 rounded-lg border-2 border-slate-800 p-3">
          <p className="text-sm font-medium text-slate-900">{error}</p>
          {action && <p className="mt-1 text-sm text-slate-700">{action}</p>}
        </div>
      )}
    </div>
  );
}
