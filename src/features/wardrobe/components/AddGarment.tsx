'use client';
/**
 * F6 + F10 · Photograph a garment, measure it, name it, keep it.
 *
 * 🔤 The measured colour is shown as NAME + HEX + distance-to-that-name, never
 *    as a swatch on its own. A swatch is the one thing our user cannot read.
 */
import { useEffect, useState } from 'react';
import { Loader, TriangleAlert, Check, Shirt, Copy } from 'lucide-react';
import { CameraInput, ConfidenceBanner, readApiError, PoweredByYouCam } from '@/core/ui';
import { saveGarment, saveImage, getProfile, listGarments } from '@/core/db';
import { detectDuplicates } from '@/core/color';
import type {
  DuplicateAlert,
  Garment,
  GarmentCategory,
  Lab,
  MeasurementConfidence,
} from '@/core/contracts/types';

type Phase = 'idle' | 'measuring' | 'measured' | 'saved' | 'error';

interface Measured {
  colorHex: string;
  colorLab: Lab;
  colorName: string;
  closestStandard: { keyword: string; deltaE: number } | null;
  achromatic: boolean;
  confidence: MeasurementConfidence;
  dominantShare: number;
  looksPatterned: boolean;
  coverage: number;
}

const CATEGORIES: { value: GarmentCategory; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'outerwear', label: 'Outerwear' },
  { value: 'dress', label: 'Dress' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'scarf', label: 'Scarf' },
  { value: 'hat', label: 'Hat' },
  { value: 'bag', label: 'Bag' },
  { value: 'belt', label: 'Belt' },
  { value: 'tie', label: 'Tie' },
  { value: 'socks', label: 'Socks' },
  { value: 'other', label: 'Other' },
];

export function AddGarment({ onSaved }: { onSaved?: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [category, setCategory] = useState<GarmentCategory>('top');
  const [patterned, setPatterned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** F9 · what in the wardrobe this new item collides with. */
  const [duplicates, setDuplicates] = useState<DuplicateAlert | null>(null);

  async function measure(file: File) {
    setPhase('measuring');
    setError(null);
    setPhoto(file);
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
      // Detected, not asked. Someone who cannot see the print reliably should
      // not be the one telling us there is one.
      setPatterned(m.looksPatterned);
      setPhase('measured');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The measurement failed.');
      setPhase('error');
    }
  }

  /**
   * F9 · Check the new garment against the wardrobe BEFORE it joins it.
   *
   * The moment matters as much as the comparison. Told afterwards, it is a
   * curiosity; told now, while they are still holding the thing, it is the
   * decision. Costs nothing — every colour involved was measured already.
   */
  function buildGarment(id: string): Garment | null {
    if (!measured) return null;
    return {
      id,
      userId: 'me',
      imageUrl: `idb:${id}`,
      category,
      colorHex: measured.colorHex,
      colorLab: measured.colorLab,
      colorName: measured.colorName,
      isPatterned: patterned,
      confidence: measured.confidence,
      createdAt: new Date().toISOString(),
    };
  }

  // Re-runs when the category changes too: "do I already own this?" is asked
  // within a category, so answering it depends on the one the user just picked.
  useEffect(() => {
    if (phase !== 'measured' || !measured) {
      setDuplicates(null);
      return;
    }
    let alive = true;
    Promise.all([getProfile(), listGarments()])
      .then(([p, wardrobe]) => {
        if (!alive) return;
        // The profile may be null and the check still runs: whether two
        // garments are the SAME COLOUR is a fact about them, not about the eyes
        // looking at them. Only "you cannot separate these" needs the profile,
        // and detectDuplicates leaves that one unanswered rather than guessing.
        const candidate = buildGarment('candidate');
        if (!candidate) return;
        const alert = detectDuplicates(candidate, wardrobe, p);
        setDuplicates(alert.collidesWith.length ? alert : null);
      })
      .catch(() => alive && setDuplicates(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, measured, category]);

  async function save() {
    if (!measured || !photo) return;
    // The photo lives in IndexedDB as a blob, not as a URL. A YouCam result
    // URL would be dead in two hours.
    const garment = buildGarment(`grm-${Date.now().toString(36)}`);
    if (!garment) return;
    await saveImage(garment.id, photo);
    await saveGarment(garment);
    setPhase('saved');
    setMeasured(null);
    setPhoto(null);
    setDuplicates(null);
    onSaved?.();
  }

  return (
    <div>
      {phase !== 'measuring' && (
        <CameraInput
          guide="garment"
          label="Photograph a garment"
          /*
            The advice matches what the measurement actually needs. We isolate
            the garment from what is behind it, so "fill the middle of the frame"
            was leftover guidance from a version that read the centre box — and a
            contrasting surface genuinely helps, while a matching one is the case
            that costs the most accuracy.
          */
          hint="Lay it flat on a surface of a clearly different shade, in even daylight. One garment per photo."
          onSelect={measure}
        />
      )}

      {phase === 'measuring' && (
        <div role="status" className="rounded-xl border-2 border-slate-300 p-5">
          <div className="flex items-center gap-3">
            <Loader size={20} className="animate-spin text-slate-700" aria-hidden />
            <div>
              <p className="font-semibold text-slate-900">Measuring the colour…</p>
              <p className="text-sm text-slate-600">
                Finding where the garment ends and the surface behind it begins, then reading
                the colour of the fabric itself.
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

      {phase === 'saved' && (
        <p role="status" className="mt-5 flex items-center gap-2 rounded-lg bg-slate-100 p-3 text-sm font-semibold text-slate-800">
          <Check size={16} aria-hidden />
          Added to your wardrobe.
        </p>
      )}

      {phase === 'measured' && measured && (
        <section className="mt-6" aria-labelledby="measured-colour">
          <ConfidenceBanner
            confidence={measured.confidence}
            refusalTitle={measured.coverage === 0 ? 'I can’t find the garment' : undefined}
          />

          <h2 id="measured-colour" className="mt-5 flex items-center gap-2 text-lg font-bold">
            <Shirt size={18} aria-hidden />
            What I measured
          </h2>

          <div className="mt-3 flex items-center gap-3 rounded-lg border-2 border-slate-200 p-3">
            <span
              className="h-14 w-14 shrink-0 rounded-md border border-slate-300"
              style={{ backgroundColor: measured.colorHex }}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{measured.colorName}</p>
              <p className="text-sm text-slate-600">
                <code>{measured.colorHex}</code>
              </p>
              {/*
                The name above is DERIVED from the measurement — hue, lightness
                and intensity — so it can never land in the wrong colour family.
                A familiar CSS keyword is offered underneath only when one is
                genuinely close; otherwise we say nothing rather than reach.
              */}
              <p className="mt-1 text-xs text-slate-500">
                {measured.closestStandard
                  ? `Close to the standard colour “${measured.closestStandard.keyword}”.`
                  : 'No standard colour name is close enough to be worth quoting — the description above is measured from the photo.'}
              </p>
            </div>
          </div>

          {measured.looksPatterned && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border-2 border-slate-300 p-3 text-sm text-slate-700">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
              This one has more than one colour on it — {measured.dominantShare}% of it is
              the colour above. We have ticked &ldquo;patterned&rdquo; for you, and every
              verdict about it will say the colour is the dominant one only.
            </p>
          )}
          {/*
            Framing used to get its own warning here. It now arrives through the
            confidence banner above, with the rest of what limited the reading —
            two notices saying the same thing trains people to skip both.
          */}

          {/*
            F9 · THE ALERT NOBODY ELSE GIVES.
            Buying a second copy of something you cannot recognise as a second
            copy is an ordinary, invisible loss. It arrives here, before the
            item joins the wardrobe, because afterwards it is a curiosity and
            now it is a decision.
          */}
          {duplicates && (
            <div className="mt-4 rounded-xl border-2 border-slate-800 p-4">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <Copy size={18} aria-hidden />
                {duplicates.collidesWith.some((d) => d.kind === 'same_colour')
                  ? 'You already own this colour'
                  : 'You will not be able to tell this from what you own'}
              </h3>
              <ul className="mt-2 space-y-2">
                {duplicates.collidesWith.map((d) => (
                  <li key={d.garmentId} className="text-sm text-slate-700">
                    {d.kind === 'same_colour' ? (
                      <>
                        · Your <strong>{d.colorName}</strong> {category} is the same colour.
                        Not similar — the same. Anyone would agree.
                      </>
                    ) : (
                      /*
                        ⚠️ The careful sentence. These are DIFFERENT colours that
                        this person cannot separate. Saying "you already own
                        this" here would be false, and a sighted friend would
                        contradict us in front of them.
                      */
                      <>
                        · Your <strong>{d.colorName}</strong> {category} is genuinely a
                        different colour, but not one you will ever be able to separate from
                        this. To you they are the same.
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {/*
                Only when the wardrobe has not been judged against this person's
                eyes yet. Without a profile we can still prove two colours are
                the same; we cannot say which different ones they confuse.
              */}
              {duplicates.collidesWith.some((d) => d.deltaESimulated === null) && (
                <p className="mt-3 text-sm text-slate-600">
                  This compares the measured colours themselves. Once you have calibrated, I
                  can also tell you which <em>different</em> colours you will not be able to
                  separate — which is the larger problem.
                </p>
              )}
              <p className="mt-3 text-sm text-slate-600">
                Worth knowing before it goes in the wardrobe. You can still add it — it will
                just be a second one of something you already have.
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">What is it?</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as GarmentCategory)}
                className="mt-1 min-h-11 w-full rounded-lg border-2 border-slate-300 px-3"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 self-end pb-1">
              <input
                type="checkbox"
                checked={patterned}
                onChange={(e) => setPatterned(e.target.checked)}
                className="h-5 w-5"
              />
              <span className="text-sm text-slate-800">
                It is patterned
                <span className="block text-xs text-slate-500">
                  then this colour is only the dominant one
                </span>
              </span>
            </label>
          </div>

          <button
            onClick={save}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            <Check size={18} aria-hidden />
            Add to my wardrobe
          </button>
        </section>
      )}
    </div>
  );
}
