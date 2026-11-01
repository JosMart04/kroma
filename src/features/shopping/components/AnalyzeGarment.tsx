'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F12 · "SHOULD I BUY THIS?" — the screen the product exists for
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Standing in a shop holding something. Three questions, in this order:
 *
 *    1. What colour IS it? — because they cannot tell, and the label lies as
 *       often as not ("stone", "sage", "petrol").
 *    2. Will I be able to tell it apart from what I already own? — the
 *       question nobody else answers, and the reason the wardrobe exists.
 *    3. Does it work against my own face? — the palette they wear every day
 *       and never see.
 *
 *  🔑 "Works with 62% of your wardrobe" is the retail argument of this whole
 *     project, and it is computed here, locally, from measured colours. No
 *     model produces that number.
 *
 *  ⚠️ The measurement itself reuses /api/garment. Photographing a garment in a
 *     shop and photographing one at home are the same operation, and having two
 *     code paths that could drift apart would be a way to lie by accident.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader, TriangleAlert, ShoppingBag, Check } from 'lucide-react';
import { CameraInput, ConfidenceBanner, VerdictBadge, DualSwatch, NextStepPrompt, GarmentThumb, readApiError, PoweredByYouCam } from '@/core/ui';
import { getProfile, getPortrait, listGarments } from '@/core/db';
import { judgePair } from '@/core/color';
import type {
  CVDProfile,
  ColorPortrait,
  Garment,
  Lab,
  MeasurementConfidence,
  PairVerdict,
} from '@/core/contracts/types';

type Phase = 'idle' | 'measuring' | 'done' | 'error';

interface Measured {
  colorHex: string;
  colorLab: Lab;
  colorName: string;
  closestStandard: { keyword: string; deltaE: number } | null;
  confidence: MeasurementConfidence;
  dominantShare: number;
  looksPatterned: boolean;
  coverage: number;
}

interface Analysis {
  compatibilityPercent: number;
  worksWith: Array<{ garment: Garment; verdict: PairVerdict }>;
  clashesWith: Array<{ garment: Garment; verdict: PairVerdict }>;
  vsSkin: PairVerdict | null;
}

export function AnalyzeGarment() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<CVDProfile | null>(null);
  const [portrait, setPortrait] = useState<ColorPortrait | null>(null);
  const [wardrobe, setWardrobe] = useState<Garment[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([getProfile(), getPortrait(), listGarments()])
      .then(([p, pt, g]) => {
        if (!alive) return;
        setProfile(p);
        setPortrait(pt);
        setWardrobe(g);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const analyse = useCallback(
    (m: Measured, p: CVDProfile, pt: ColorPortrait | null, items: Garment[]): Analysis => {
      const judged = items.map((g) => ({
        garment: g,
        verdict: judgePair({
          aHex: m.colorHex,
          bHex: g.colorHex,
          aName: m.colorName,
          bName: g.colorName,
          profile: p,
          aConfidence: m.confidence,
          bConfidence: g.confidence,
        }),
      }));

      const worksWith = judged.filter((x) => x.verdict.verdict === 'safe');
      const clashesWith = judged.filter((x) => x.verdict.verdict === 'clash');

      return {
        // The headline number. Deliberately counts only 'safe': a 'risky' pair
        // is one the user has to think about, and counting it as compatible
        // would inflate the figure in exactly the direction that flatters us.
        compatibilityPercent: items.length
          ? Math.round((worksWith.length / items.length) * 100)
          : 0,
        worksWith,
        clashesWith,
        vsSkin: pt
          ? judgePair({
              aHex: m.colorHex,
              bHex: pt.skinHex,
              aName: m.colorName,
              bName: 'your skin',
              profile: p,
              aConfidence: m.confidence,
              bConfidence: pt.confidence,
            })
          : null,
      };
    },
    [],
  );

  async function measure(file: File) {
    setPhase('measuring');
    setError(null);
    try {
      const body = new FormData();
      body.append('photo', file);
      const res = await fetch('/api/garment', { method: 'POST', body });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        setPhase('error');
        return;
      }
      const m = (await res.json()) as Measured;
      setMeasured(m);
      setAnalysis(profile ? analyse(m, profile, portrait, wardrobe) : null);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The measurement failed.');
      setPhase('error');
    }
  }

  return (
    <div className="mt-6">
      {phase !== 'measuring' && (
        <CameraInput
          guide="garment"
          label={measured ? 'Try another one' : 'Photograph it'}
          hint="Hold it up against something of a clearly different shade. Shop lighting is usually poor — we will tell you if it was too poor to trust."
          onSelect={measure}
        />
      )}

      {phase === 'measuring' && (
        <div role="status" className="rounded-xl border-2 border-slate-300 p-5">
          <div className="flex items-center gap-3">
            <Loader size={20} className="animate-spin text-slate-700" aria-hidden />
            <div>
              <p className="font-semibold text-slate-900">Measuring…</p>
              <p className="text-sm text-slate-600">
                Separating the garment from everything behind it, reading its colour, then
                comparing it against everything you own.
              </p>
            </div>
          </div>
          {/* The API is doing the work right now, so the credit moves. */}
          <PoweredByYouCam />
        </div>
      )}

      {phase === 'error' && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border-2 border-slate-800 p-4">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-slate-800" aria-hidden />
          <p className="text-sm text-slate-800">{error}</p>
        </div>
      )}

      {phase === 'done' && measured && (
        <section className="mt-6" aria-labelledby="verdict">
          <ConfidenceBanner
            confidence={measured.confidence}
            refusalTitle={measured.coverage === 0 ? 'I can’t find the garment' : undefined}
          />

          <h2 id="verdict" className="mt-5 flex items-center gap-2 text-xl font-bold">
            <ShoppingBag size={20} aria-hidden />
            What it is
          </h2>

          <div className="mt-3 flex items-center gap-3 rounded-xl border-2 border-slate-200 p-3">
            <span
              className="h-14 w-14 shrink-0 rounded-md border border-slate-300"
              style={{ backgroundColor: measured.colorHex }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900">{measured.colorName}</p>
              <p className="text-sm text-slate-600">
                <code>{measured.colorHex}</code>
                {measured.closestStandard && ` · close to ${measured.closestStandard.keyword}`}
              </p>
            </div>
          </div>

          <DualSwatch hex={measured.colorHex} label="This garment" profile={profile} />

          {!profile && (
            <NextStepPrompt href="/calibrate" cta="Measure how you see colour">
              The colour above is measured, but nothing else here can be answered until we
              know how you see colour. It takes two minutes.
            </NextStepPrompt>
          )}

          {analysis && wardrobe.length === 0 && (
            <p className="mt-5 rounded-lg border-2 border-dashed border-slate-300 p-4 text-sm text-slate-600">
              Your wardrobe is empty, so there is nothing to compare this against yet.
              Photograph a few things you already own and come back — that comparison is
              the part nobody else can do for you.
            </p>
          )}

          {analysis && wardrobe.length > 0 && (
            <>
              <div className="mt-6 rounded-xl border-2 border-slate-900 p-5">
                <p className="text-4xl font-black text-slate-900">
                  {analysis.compatibilityPercent}%
                </p>
                <p className="mt-1 font-semibold text-slate-900">
                  of your wardrobe you can safely wear this with
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {analysis.worksWith.length} of {wardrobe.length} items are clearly
                  distinguishable from it for you.
                  {analysis.clashesWith.length > 0 &&
                    ` ${analysis.clashesWith.length} will look like the same colour.`}
                </p>
              </div>

              {analysis.vsSkin && (
                <div className="mt-4 rounded-xl border-2 border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <VerdictBadge verdict={analysis.vsSkin.verdict} />
                    <span className="text-sm font-semibold text-slate-700">
                      against your own face
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{analysis.vsSkin.explanation}</p>
                </div>
              )}

              {analysis.clashesWith.length > 0 && (
                <div className="mt-4 rounded-xl border-2 border-slate-800 p-4">
                  <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                    <TriangleAlert size={18} aria-hidden />
                    You already own something you cannot tell this apart from
                  </h3>
                  {/*
                    ⚠️ THE PHOTOGRAPH IS THE POINT OF THIS LIST. "You already own
                    something you cannot tell this apart from" is only useful if
                    the reader can work out WHICH thing — and a colour name is
                    the one identifier this person cannot verify.
                  */}
                  <ul className="mt-3 space-y-3">
                    {analysis.clashesWith.map(({ garment, verdict }) => (
                      <li key={garment.id} className="flex items-start gap-3">
                        <GarmentThumb garment={garment} profile={profile} size="md" />
                        <span className="min-w-0 text-sm text-slate-700">
                          <strong className="text-slate-900">{garment.colorName}</strong>{' '}
                          ({garment.category})
                          <span className="mt-0.5 block">{verdict.explanation}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-slate-600">
                    That is worth knowing before you pay for it: to you, this is a second
                    copy of something in your wardrobe.
                  </p>
                </div>
              )}

              {analysis.worksWith.length > 0 && (
                <details className="mt-4 rounded-xl border-2 border-slate-200 p-4">
                  <summary className="cursor-pointer font-semibold text-slate-800">
                    <Check size={16} className="mr-1 inline" aria-hidden />
                    Goes with {analysis.worksWith.length}{' '}
                    {analysis.worksWith.length === 1 ? 'item' : 'items'} you own
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {analysis.worksWith.map(({ garment }) => (
                      <li key={garment.id} className="flex items-center gap-3">
                        <GarmentThumb garment={garment} profile={profile} size="md" />
                        <span className="min-w-0 text-sm text-slate-700">
                          <span className="block font-semibold text-slate-900">
                            {garment.colorName}
                          </span>
                          {garment.category}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
