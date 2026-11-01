'use client';
/**
 * F2 · Colour portrait — capture, measure, show, save.
 *
 * 🔤 Every colour on screen is shown with its NAME and its HEX, never as a
 *    swatch alone. A swatch is exactly the thing our user cannot read.
 *
 * 🔑 The confidence is displayed with the result, not hidden behind a tooltip.
 *    A measurement without its reliability is a claim we cannot back.
 */
import { useEffect, useState } from 'react';
import { ScanFace, Loader, TriangleAlert, Check } from 'lucide-react';
import { CameraInput, ConfidenceBanner, DualSwatch, readApiError, PoweredByYouCam } from '@/core/ui';
import { MakeupAdvice } from './MakeupAdvice';
import { getPortrait, savePortrait, getProfile, saveImage, getImageUrl } from '@/core/db';

import type { ColorPortrait, CVDProfile, MeasurementConfidence } from '@/core/contracts/types';

/**
 * ⚠️ The selfie is now KEPT, which it never was before. F16 needs a face to
 *    apply the corrector to, and asking for a second selfie one screen later is
 *    friction for no gain — it would have to be re-uploaded either way, so
 *    storing it saves the gesture, not an API call. Local only, and
 *    `resetAll()` already clears the image store, so "Start over" wipes it.
 */
export const SELFIE_PHOTO = 'me-selfie';

type Phase = 'idle' | 'measuring' | 'done' | 'refused' | 'error';

interface ApiResponse {
  portrait?: ColorPortrait;
  confidence?: MeasurementConfidence;
  hints?: string[];
  error?: string;
}

/** What the phototype means, in words rather than a roman numeral. */
const PHOTOTYPE: Record<number, string> = {
  1: 'always burns, never tans',
  2: 'burns easily, tans a little',
  3: 'sometimes burns, tans gradually',
  4: 'rarely burns, tans easily',
  5: 'very rarely burns, tans deeply',
  6: 'never burns',
};

export function PortraitCapture() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [portrait, setPortrait] = useState<ColorPortrait | null>(null);
  const [refusal, setRefusal] = useState<MeasurementConfidence | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** Needed to show each colour the way THIS person sees it (F5). */
  const [profile, setProfile] = useState<CVDProfile | null>(null);
  /** The stored selfie, shown back and reused by the makeup studio. */
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);

  // Show what was measured before, so returning here is not a blank screen.
  useEffect(() => {
    let alive = true;
    Promise.all([getPortrait(), getProfile(), getImageUrl(SELFIE_PHOTO)])
      .then(([p, prof, selfie]) => {
        if (!alive) return;
        setProfile(prof);
        if (selfie) setSelfieUrl(selfie);
        if (p) {
          setPortrait(p);
          setPhase('done');
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function measure(file: File) {
    setPhase('measuring');
    setError(null);
    setRefusal(null);
    try {
      const body = new FormData();
      body.append('photo', file);
      const res = await fetch('/api/portrait', { method: 'POST', body });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        setPhase('error');
        return;
      }
      const data: ApiResponse = await res.json();
      setHints(data.hints ?? []);

      // A refusal is a successful outcome of the product, not a failure.
      if (!data.portrait && data.confidence) {
        setRefusal(data.confidence);
        setPhase('refused');
        return;
      }
      if (data.portrait) {
        await savePortrait(data.portrait);
        await saveImage(SELFIE_PHOTO, file);
        setSelfieUrl(URL.createObjectURL(file));
        setPortrait(data.portrait);
        setPhase('done');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The measurement failed.');
      setPhase('error');
    }
  }

  const swatches = portrait
    ? [
        { label: 'Skin', hex: portrait.skinHex, name: null },
        { label: 'Eyes', hex: portrait.eyeHex, name: portrait.eyeName },
        { label: 'Brows', hex: portrait.eyebrowHex, name: null },
        { label: 'Lips', hex: portrait.lipHex, name: null },
        { label: 'Hair', hex: portrait.hairHex, name: portrait.hairName },
      ]
    : [];

  return (
    <div className="mt-6">
      {phase !== 'measuring' && (
        <CameraInput
          facing="user"
          guide="face"
          label={portrait ? 'Measure again' : 'Take a selfie'}
          /*
            The numbers here are the engine's own documented tolerances, not
            round advice: roughly 60–80% of the width, within ~10° of square on,
            nothing cut off at the edges. Saying them up front is cheaper than
            a refusal, and it is the difference between a second attempt that
            is aimed and one that is a guess.
          */
          hint="Face the camera straight on — within about 10 degrees — and close enough that your face fills two thirds to four fifths of the width, with nothing cut off at the edges. Daylight from a window, not direct sun. Hair back, glasses off."
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
                Reading your face, normalising the light, then reading it again to see how
                much the light was changing it.
              </p>
            </div>
          </div>
          {/* The API is doing the work right now, so the credit moves. */}
          <PoweredByYouCam />
        </div>
      )}

      {phase === 'refused' && refusal && (
        <div className="mt-5">
          <ConfidenceBanner confidence={refusal} />
        </div>
      )}

      {phase === 'error' && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border-2 border-slate-800 p-4">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-slate-800" aria-hidden />
          <p className="text-sm text-slate-800">{error}</p>
        </div>
      )}

      {hints.length > 0 && phase !== 'measuring' && (
        <ul className="mt-4 space-y-1 text-sm text-slate-600">
          {hints.map((h) => (
            <li key={h}>· {h}</li>
          ))}
        </ul>
      )}

      {phase === 'done' && portrait && (
        <section className="mt-6" aria-labelledby="your-palette">
          <ConfidenceBanner confidence={portrait.confidence} />

          {/*
            The photo everything on this screen was measured from. Shown because
            a page full of colours with no sight of their source is a page you
            have to take on faith — and because F16 reuses this exact image, so
            the user should see which one it holds.
          */}
          {selfieUrl && (
            <figure className="mt-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selfieUrl}
                alt="The selfie these colours were measured from"
                className="w-full rounded-xl border-2 border-slate-300"
              />
              <figcaption className="mt-2 text-xs text-slate-500">
                Everything below was measured from this photo. It stays on this device —
                &ldquo;Start over&rdquo; on the home screen erases it.
              </figcaption>
            </figure>
          )}

          <h2 id="your-palette" className="mt-5 flex items-center gap-2 text-xl font-bold">
            <ScanFace size={20} aria-hidden />
            The palette you wear
          </h2>

          <ul className="mt-4 space-y-3">
            {swatches.map((s) => (
              <li key={s.label} className="rounded-lg border-2 border-slate-200 p-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-10 w-10 shrink-0 rounded-md border border-slate-300"
                    style={{ backgroundColor: s.hex }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{s.label}</span>
                    {/* Name and hex, always. The swatch alone says nothing to our user. */}
                    <span className="block text-sm text-slate-600">
                      {s.name ? `${s.name} · ` : ''}
                      <code>{s.hex}</code>
                    </span>
                  </span>
                </div>
                {/* F5 · The same colour as everyone else sees it, and as you do. */}
                <DualSwatch hex={s.hex} label={s.label} profile={profile} />
              </li>
            ))}
          </ul>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border-2 border-slate-200 p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Phototype
              </dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {portrait.fitzpatrick === null ? (
                  <>
                    Not measured
                    <span className="block text-sm font-normal text-slate-600">
                      the engine could not classify it on this photo
                    </span>
                  </>
                ) : (
                  <>
                    {portrait.fitzpatrick} of 6
                    <span className="block text-sm font-normal text-slate-600">
                      {PHOTOTYPE[portrait.fitzpatrick]}
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div className="rounded-lg border-2 border-slate-200 p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Redness
              </dt>
              {/*
                ⚠️ Inverted scale: HIGHER is a BETTER condition. Showing the raw
                number without that sentence would mislead, and the user cannot
                catch it.
              */}
              <dd className="mt-1 font-semibold text-slate-900">
                {portrait.rednessRaw === null ? (
                  <>
                    Not measured
                    <span className="block text-sm font-normal text-slate-600">
                      the engine returned no redness reading for this photo
                    </span>
                  </>
                ) : (
                  <>
                    {portrait.rednessRaw.toFixed(1)} of 100
                    <span className="block text-sm font-normal text-slate-600">
                      higher is calmer skin
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>

          {/*
            F15 · The decision their vision denies them.
            Picking a corrector is done entirely by eye: look at your face,
            judge the cast, choose its opposite. They cannot do the first step,
            so they cannot do any of it. Their face is now measured, and the
            opposite of a measured colour is arithmetic.
          */}
          <MakeupAdvice portrait={portrait} profile={profile} />

          <p className="mt-6 flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
            <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
            Saved on this device. Every verdict from now on is computed against these
            colours.
          </p>
        </section>
      )}
    </div>
  );
}
