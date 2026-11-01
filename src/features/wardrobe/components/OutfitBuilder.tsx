'use client';

/**
 * F19 · Complete outfits, already checked.
 *
 * 🔑 THIS SCREEN IS THE PRODUCT PROMISE IN ONE SENTENCE: no two pieces in
 *    these outfits will look the same to you. Every other screen answers a
 *    question the user brought; this one removes the pair-by-pair work.
 *
 * ⚠️ AND IT STOPS THERE, DELIBERATELY. Nothing here knows about occasion, fit,
 *    weather or what someone feels like wearing. Telling a person who cannot
 *    verify us that they need no second opinion would be the exact over-reach
 *    this product exists to avoid.
 *
 * ⚠️ MEANING NEVER TRAVELS ON COLOUR ALONE — and on this screen the temptation
 *    is real, because the content IS colour. The verdict is a badge with an
 *    icon and a word; the pieces are named in text; the warnings are sentences.
 *    Someone who receives no colour at all can still use everything here.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shirt, Sparkles, TriangleAlert, RefreshCw, Plus, Trash2, HelpCircle } from 'lucide-react';
import type { ColorFamily, ColorPortrait, CVDProfile, Garment } from '@/core/contracts/types';
import {
  buildOutfits,
  computeFamilies,
  explainUnused,
  judgeOutfit,
  type Outfit,
  type OutfitPiece,
  type UnusedGarment,
} from '@/core/color';
import { getProfile, getPortrait, listGarments } from '@/core/db';
import { VerdictBadge, GarmentThumb, NextStepPrompt } from '@/core/ui';
import { OutfitTryOn } from './OutfitTryOn';
import { CustomOutfit } from './CustomOutfit';
import {
  deleteSavedOutfit,
  listSavedOutfits,
  type SavedOutfit,
} from '../lib/savedOutfits';

const ROLE_LABEL: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress',
  shoes: 'Shoes',
  layer: 'Layer',
  accessory: 'Accessory',
};

export function OutfitBuilder() {
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [profile, setProfile] = useState<CVDProfile | null>(null);
  const [portrait, setPortrait] = useState<ColorPortrait | null>(null);
  const [garments, setGarments] = useState<Garment[]>([]);
  /** Which outfit has its try-on panel open. One at a time: each pass costs. */
  const [openTryOn, setOpenTryOn] = useState<string | null>(null);
  const [families, setFamilies] = useState<ColorFamily[]>([]);
  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [building, setBuilding] = useState(false);
  /** Garments in the wardrobe that no outfit on screen uses, and why. */
  const [unused, setUnused] = useState<UnusedGarment[]>([]);

  const load = useCallback(async () => {
    const [p, pt, all] = await Promise.all([getProfile(), getPortrait(), listGarments()]);
    setProfile(p);
    setPortrait(pt);
    setGarments(all);

    // Without a measured profile there is nothing honest to say about how THIS
    // person sees these colours, so we build nothing rather than assume normal
    // vision and hand out confident advice.
    if (!p || all.length < 2) {
      setOutfits([]);
      return;
    }
    const fams = computeFamilies(all, p);
    const built = buildOutfits({ garments: all, profile: p, portrait: pt, families: fams });
    setFamilies(fams);
    setOutfits(built);
    setSaved(await listSavedOutfits());
    // Answering "why is my green shirt not here?" inside the product, because
    // an unexplained absence is indistinguishable from a bug to someone who
    // cannot check the colours themselves.
    setUnused(explainUnused(all, built, p));
  }, []);

  useEffect(() => {
    load().catch(() => setOutfits([]));
  }, [load]);

  if (outfits === null) {
    return <p className="mt-6 text-slate-600">Putting outfits together…</p>;
  }

  if (!profile) {
    return (
      <NextStepPrompt href="/calibrate" cta="Measure how you see colour">
        Outfits depend on how <em>you</em> see colour, and that has not been measured yet.
        Anything we suggested before measuring would be a guess. It takes two minutes.
      </NextStepPrompt>
    );
  }

  if (garments.length < 2) {
    return (
      <div className="mt-6 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center">
        <Shirt size={26} className="mx-auto text-slate-400" aria-hidden />
        <p className="mt-3 font-semibold text-slate-900">Not enough to combine yet</p>
        <p className="mt-1 text-sm text-slate-600">
          Photograph a top and a bottom and we can start checking whole outfits for you,
          instead of one pair at a time.
        </p>
        <Link
          href="/wardrobe"
          className="mt-4 inline-flex items-center rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          Add garments
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {!portrait && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-slate-700" aria-hidden />
          <p className="text-sm text-slate-800">
            These outfits are checked piece against piece, but <strong>not against your own
            face</strong> — no colour portrait has been measured.{' '}
            <Link href="/portrait" className="font-semibold underline">
              Measure it
            </Link>{' '}
            and we will also tell you what disappears against your skin and hair.
          </p>
        </div>
      )}

      {outfits.length === 0 ? (
        <div className="rounded-xl border-2 border-slate-800 p-6 text-center">
          <TriangleAlert size={26} className="mx-auto text-slate-800" aria-hidden />
          <p className="mt-3 font-semibold text-slate-900">
            Nothing here combines without a clash
          </p>
          <p className="mt-1 text-sm text-slate-700">
            Every complete outfit your wardrobe allows contains at least one pair you could
            not tell apart. That is worth knowing — it is not a bug, it is the reason the
            wardrobe feels difficult. Adding a piece in a different colour family will open
            up combinations.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {outfits.length} {outfits.length === 1 ? 'outfit' : 'outfits'} you can wear
              </h2>
              {/* The promise, said plainly. This is the whole product. */}
              <p className="mt-1 text-sm text-slate-700">
                {/*
                  ⚠️ WE CHECKED THE COLOURS. WE DID NOT DRESS THEM.
                  The first version read "you can put any of them on without asking
                  anyone", which quietly promised more than we measure: nothing here knows
                  about occasion, fit, weather or what they feel like wearing. Telling
                  someone who cannot verify us that they need no second opinion is exactly
                  the over-reach this product exists to avoid. State what was checked, and
                  leave the choice where it belongs.
                */}
                Every pair in these has been checked for how <em>you</em> see colour.{' '}
                <strong>No two pieces here will look the same to you</strong> — the rest of
                the choice is yours.
              </p>
            </div>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700"
            >
              <RefreshCw size={15} aria-hidden />
              Refresh
            </button>
          </div>

          <ol className="mt-5 space-y-4">
            {outfits.map((outfit) => (
              <li key={outfit.id} className="rounded-xl border-2 border-slate-300 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <VerdictBadge verdict={outfit.verdict} />
                  {outfit.degraded && (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <Sparkles size={14} aria-hidden />
                      measured in poor light
                    </span>
                  )}
                </div>

                <ul className="mt-3 flex flex-wrap gap-3" role="list">
                  {outfit.pieces.map((piece) => (
                    <li key={piece.garment.id} className="flex items-center gap-2">
                      <GarmentThumb garment={piece.garment} profile={profile} size="sm" />
                      <span className="text-sm">
                        <span className="block font-semibold text-slate-900">
                          {piece.garment.colorName}
                        </span>
                        <span className="block text-slate-600">
                          {ROLE_LABEL[piece.role] ?? piece.role}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-sm text-slate-700">{outfit.certificate}</p>

                {outfit.risky.length > 0 && (
                  <ul className="mt-2 space-y-1" role="list">
                    {outfit.risky.map((r, i) => (
                      <li key={i} className="text-sm text-slate-600">
                        · {r.verdict.explanation}
                      </li>
                    ))}
                  </ul>
                )}

                {/*
                  `cloth-v4` dresses one garment at a time, so an outfit is
                  built by feeding each render back in as the next body. The
                  panel states how many passes that is, and what they cost,
                  before anything is spent.

                  Height from padding, not `min-h-*`: it is used phone in hand
                  and the 44px target has to be real, not nominal.
                */}
                {openTryOn === outfit.id ? (
                  <OutfitTryOn outfit={outfit} profile={profile} onClose={() => setOpenTryOn(null)} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenTryOn(outfit.id)}
                    className="mt-4 inline-flex items-center rounded-lg border-2 border-slate-900 px-4 py-3 font-semibold text-slate-900"
                  >
                    See this outfit on you
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      {/*
        🔑 THE ANSWER TO "WHY IS MY GREEN SHIRT NOT HERE?"

        A silent absence is indistinguishable from a bug for someone who cannot
        check the colours themselves — and twice it genuinely WAS one. Three
        different situations live here and they get three different answers:
        nothing to pair it with, collides with everything, or simply outranked.
      */}
      {unused.length > 0 && (
        <details className="mt-8 rounded-xl border-2 border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">
            <HelpCircle size={15} className="mr-1.5 inline" aria-hidden />
            Why {unused.length === 1 ? 'one garment is' : `${unused.length} garments are`} not in
            any outfit
          </summary>
          <ul className="mt-3 space-y-3" role="list">
            {unused.map((u) => (
              <li key={u.garment.id} className="flex items-start gap-3">
                <GarmentThumb garment={u.garment} profile={profile} size="sm" />
                <p className="text-sm">
                  <span className="block font-semibold text-slate-900">
                    {u.garment.colorName}
                  </span>
                  <span className="block text-slate-700">{u.explanation}</span>
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ── The outfits the user assembled themselves ─────────────────── */}
      <section aria-labelledby="yours" className="mt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="yours" className="text-lg font-bold text-slate-900">
              Your own outfits
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Already have a combination that works — one someone put together for you?
              Save it here and we will tell you what we see in it.
            </p>
          </div>
          {!building && (
            <button
              type="button"
              onClick={() => setBuilding(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border-2 border-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-900"
            >
              <Plus size={15} aria-hidden />
              Build one
            </button>
          )}
        </div>

        {building && (
          <div className="mt-4">
            <CustomOutfit
              garments={garments}
              profile={profile}
              portrait={portrait}
              families={families}
              onSaved={() => {
                setBuilding(false);
                load();
              }}
              onCancel={() => setBuilding(false)}
            />
          </div>
        )}

        {saved.length === 0 && !building ? (
          <p className="mt-4 rounded-xl border-2 border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
            Nothing saved yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-4" role="list">
            {saved.map((s) => {
              const pieces = s.garmentIds
                .map((id) => garments.find((g) => g.id === id))
                .filter((g): g is Garment => !!g);
              // A saved outfit whose garments were since deleted cannot be
              // judged, and pretending otherwise would be inventing a verdict.
              if (pieces.length < 2) return null;
              const judged = judgeOutfit({ pieces, profile, portrait, families });
              if (!judged) return null;
              return (
                <li key={s.id} className="rounded-xl border-2 border-slate-300 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <VerdictBadge verdict={judged.verdict} />
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteSavedOutfit(s.id);
                          load();
                        }}
                        aria-label={`Delete ${s.name}`}
                        className="rounded-lg border-2 border-slate-300 p-2 text-slate-700"
                      >
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </div>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-3" role="list">
                    {judged.pieces.map((piece: OutfitPiece) => (
                      <li key={piece.garment.id} className="flex items-center gap-2">
                        <GarmentThumb garment={piece.garment} profile={profile} size="sm" />
                        <span className="text-sm font-medium text-slate-900">
                          {piece.garment.colorName}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <p className="mt-3 text-sm text-slate-700">{judged.certificate}</p>

                  {openTryOn === s.id ? (
                    <OutfitTryOn
                      outfit={{ ...judged, id: s.id }}
                      profile={profile}
                      onClose={() => setOpenTryOn(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenTryOn(s.id)}
                      className="mt-4 inline-flex items-center rounded-lg border-2 border-slate-900 px-4 py-3 font-semibold text-slate-900"
                    >
                      See this outfit on you
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
