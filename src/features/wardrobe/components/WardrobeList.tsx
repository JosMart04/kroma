'use client';
/**
 * F7 + F11 · The wardrobe, and what clashes with what.
 *
 * Every verdict here is computed locally against the user's own measured
 * profile. Nothing is fetched, nothing is guessed, and the same wardrobe always
 * produces the same answers.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shirt, Trash2, Layers, Sparkles, ChevronDown } from 'lucide-react';
import {
  VerdictBadge,
  NextStepPrompt,
  AssistedImage,
  GarmentThumb,
  useViewPreferences,
} from '@/core/ui';
import { getProfile, getPortrait, listGarments, deleteGarment, getImageUrl } from '@/core/db';
import { judgePair, computeFamilies } from '@/core/color';
import type {
  CVDProfile,
  ColorFamily,
  ColorPortrait,
  Garment,
  PairVerdict,
} from '@/core/contracts/types';

interface Row {
  garment: Garment;
  thumb: string | null;
  /** Against the user's own skin — the palette they always wear. */
  vsSkin: PairVerdict | null;
  /** Other garments that genuinely clash for this user. */
  clashesWith: Array<{ garment: Garment; verdict: PairVerdict }>;
}

export function WardrobeList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profile, setProfile] = useState<CVDProfile | null>(null);
  const [portrait, setPortrait] = useState<ColorPortrait | null>(null);
  /** F8 · groups of items this person cannot separate from each other. */
  const [families, setFamilies] = useState<ColorFamily[]>([]);
  const [allGarments, setAllGarments] = useState<Garment[]>([]);
  const { assistedContrast } = useViewPreferences();

  const load = useCallback(async () => {
    const [p, pt, garments] = await Promise.all([getProfile(), getPortrait(), listGarments()]);
    setProfile(p);
    setPortrait(pt);
    setAllGarments(garments);
    // Computed on the fly, never persisted: it depends on the profile, and a
    // stored answer would go stale the moment someone re-calibrates.
    setFamilies(p && garments.length > 1 ? computeFamilies(garments, p) : []);

    const built: Row[] = [];
    for (const g of garments) {
      const thumb = await getImageUrl(g.id).catch(() => null);

      // Without a measured profile there is nothing honest to say about how
      // THIS person sees these colours, so we say nothing rather than assume
      // normal vision.
      let vsSkin: Row['vsSkin'] = null;
      let clashesWith: Row['clashesWith'] = [];
      if (p) {
        if (pt) {
          vsSkin = judgePair({
            aHex: g.colorHex,
            bHex: pt.skinHex,
            aName: g.colorName,
            bName: 'your skin',
            profile: p,
            aConfidence: g.confidence,
            bConfidence: pt.confidence,
          });
        }
        clashesWith = garments
          .filter((o) => o.id !== g.id)
          .map((o) => ({
            garment: o,
            verdict: judgePair({
              aHex: g.colorHex,
              bHex: o.colorHex,
              aName: g.colorName,
              bName: o.colorName,
              profile: p,
              aConfidence: g.confidence,
              bConfidence: o.confidence,
            }),
          }))
          .filter((x) => x.verdict.verdict === 'clash');
      }
      built.push({ garment: g, thumb, vsSkin, clashesWith });
    }
    setRows(built);
  }, []);

  useEffect(() => {
    load().catch(() => setRows([]));
  }, [load, refreshKey]);

  async function remove(id: string) {
    await deleteGarment(id);
    await load();
  }

  /** True only when the thumbnails on screen have actually been altered. */
  const filtered =
    assistedContrast && profile !== null && profile.type !== 'normal' && profile.severity > 0;

  if (rows === null) {
    return <p className="mt-6 text-slate-600">Loading your wardrobe…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="mt-6 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center">
        <Shirt size={26} className="mx-auto text-slate-400" aria-hidden />
        <p className="mt-3 font-semibold text-slate-900">Nothing here yet</p>
        <p className="mt-1 text-sm text-slate-600">
          Photograph one garment above. From two onwards we can start telling you which
          ones you will not be able to tell apart.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {!profile && (
        <NextStepPrompt href="/calibrate" cta="Measure how you see colour">
          These colours are measured, but there are no verdicts yet: they depend on how{' '}
          <em>you</em> see colour, and that has not been measured. It takes two minutes.
        </NextStepPrompt>
      )}

      {/*
        ⚠️ THE ALTERED IMAGE HAS TO SAY IT IS ALTERED, AND HERE IT COULD NOT.
        In the compare panels the label sits right beside the pixels. A wardrobe
        thumbnail stands alone, so with assisted contrast on these photos are
        shifted with nothing on screen admitting it — someone could reasonably
        read them as the real thing.

        The name and the code next to each garment ARE the real measurement, and
        they are the reference this product asks people to trust. This line says
        so out loud.
      */}
      {filtered && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
          <Sparkles size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            These photos are shifted by assisted contrast, so you can tell them apart —
            they are not the real colours. <strong>The name and the code beside each one
            are the real measurement.</strong> You can turn this off on the home screen.
          </span>
        </p>
      )}

      <ul className="space-y-3">
        {rows.map(({ garment: g, thumb, vsSkin, clashesWith }) => (
          <li key={g.id} className="rounded-xl border-2 border-slate-200 p-3">
            <div className="flex gap-3">
              {thumb ? (
                <AssistedImage
                  src={thumb}
                  alt={`${g.colorName} ${g.category}`}
                  profile={profile}
                  className="h-16 w-16 shrink-0 rounded-lg border border-slate-300 object-cover"
                />
              ) : (
                <span
                  className="h-16 w-16 shrink-0 rounded-lg border border-slate-300"
                  style={{ backgroundColor: g.colorHex }}
                  aria-hidden
                />
              )}

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {g.colorName}
                  {g.isPatterned && (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      (patterned — dominant colour)
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-600">
                  {g.category} · <code>{g.colorHex}</code>
                </p>
                {g.confidence.level !== 'measured' && (
                  <p className="mt-1 text-xs text-slate-600">
                    ⚠ measured in poor light — this colour is approximate
                  </p>
                )}
              </div>

              <button
                onClick={() => remove(g.id)}
                aria-label={`Remove ${g.colorName} ${g.category}`}
                className="h-11 w-11 shrink-0 rounded-lg border-2 border-slate-300 text-slate-600"
              >
                <Trash2 size={16} className="mx-auto" aria-hidden />
              </button>
            </div>

            {/*
              F13. The link is offered for everything, including the items the
              engine cannot render: that screen carries the verdict against the
              user's own colouring, which is the part that does not need a
              picture. It explains there why a belt has no render.
            */}
            <Link
              href={`/tryon/${g.id}`}
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800 underline"
            >
              <Sparkles size={15} aria-hidden />
              See it on you
            </Link>

            {vsSkin && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <div className="flex items-center gap-2">
                  <VerdictBadge verdict={vsSkin.verdict} />
                  <span className="text-sm font-semibold text-slate-700">against your skin</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{vsSkin.explanation}</p>
              </div>
            )}

            {clashesWith.length > 0 && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-sm font-semibold text-slate-900">
                  You will not tell this apart from{' '}
                  {clashesWith.length === 1 ? '1 other item' : `${clashesWith.length} other items`}
                </p>
                <ul className="mt-1 space-y-1">
                  {clashesWith.map(({ garment: o, verdict }) => (
                    <li key={o.id} className="text-sm text-slate-700">
                      · {o.colorName} ({o.category}) — {verdict.explanation}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>

      {portrait && profile && rows.length >= 2 && (
        <p className="mt-5 text-sm text-slate-600">
          {rows.filter((r) => r.clashesWith.length === 0).length} of {rows.length} items are
          safely distinguishable from everything else you own.
        </p>
      )}

      {/*
        F8 · COLOUR FAMILIES. Not decoration: this is the number that makes the
        problem concrete. A wardrobe of fifteen pieces that collapses into four
        groups is a wardrobe with four usable colours, and the owner has never
        been able to see that.
      */}
      {families.length > 0 && families.length < allGarments.length && (
        <section className="mt-8" aria-labelledby="families">
          <h2 id="families" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Layers size={18} aria-hidden />
            Your wardrobe has {families.length}{' '}
            {families.length === 1 ? 'colour' : 'colours'}, not {allGarments.length}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            These are the groups you cannot separate from each other. Items inside one
            group are interchangeable to you, whatever their labels say.
          </p>

          <ol className="mt-4 space-y-3">
            {families.map((family) => {
              const members = family.garmentIds
                .map((id) => allGarments.find((g) => g.id === id))
                .filter((g): g is Garment => Boolean(g));
              return (
                <li key={family.id}>
                  {/*
                    ⚠️ A GROUP IS A CLAIM ABOUT GARMENTS, SO IT HAS TO SHOW THEM.
                    This listed names only — "dark vivid blue (top) · dark vivid
                    blue (top)" — which is exactly the sentence a person who
                    cannot separate those two colours has no way to check. The
                    photograph is the part they CAN check.

                    Native <details>: collapsed it stays compact, and the row of
                    small photos is enough to recognise the group without
                    opening anything. No state, keyboard and screen reader
                    support for free.
                  */}
                  <details className="rounded-xl border-2 border-slate-200 p-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-6 w-6 shrink-0 rounded border border-slate-300"
                          style={{ backgroundColor: family.representativeHex }}
                          aria-hidden
                        />
                        <span className="font-semibold text-slate-900">
                          Group {family.id} · {members.length}{' '}
                          {members.length === 1 ? 'item' : 'items'}
                        </span>
                        <ChevronDown
                          size={16}
                          className="ml-auto shrink-0 text-slate-500"
                          aria-hidden
                        />
                      </div>
                      {/*
                        ⚠️ NOT EXPANDABLE INSIDE THE SUMMARY. A `<summary>` is
                        itself a control: the tap-to-enlarge button would open
                        the lightbox AND fold the group shut underneath it. The
                        full-size versions are two lines below, in the list this
                        summary opens, where a tap means one thing.
                      */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {members.map((m) => (
                          <GarmentThumb
                            key={m.id}
                            garment={m}
                            profile={profile}
                            size="sm"
                            expandable={false}
                          />
                        ))}
                      </div>
                    </summary>

                    <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                      {members.map((m) => (
                        <li key={m.id} className="flex items-center gap-3">
                          <GarmentThumb garment={m} profile={profile} size="md" />
                          <span className="min-w-0">
                            <span className="block font-semibold text-slate-900">
                              {m.colorName}
                            </span>
                            <span className="block text-sm text-slate-600">
                              {m.category} · <code>{m.colorHex}</code>
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
