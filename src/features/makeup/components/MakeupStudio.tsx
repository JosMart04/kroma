'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F16 · DID IT WORK? — the loop F15 could not close on its own
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  F15 hands the user a corrector colour and asks them to trust it. This screen
 *  is the check. Three things they cannot do by eye become measurements: see
 *  their own redness, judge a corrector colour, and tell afterwards whether it
 *  helped.
 *
 *  ⚠️ WHAT WE MEASURED BUILDING THIS, AND IT SHAPES THE WHOLE SCREEN.
 *
 *     On the same face, same photo, corrector computed from that face:
 *
 *       already-calm skin (redness 72.5)  →  68.9 · WORSE
 *       skin with real redness   (57.0)   →  58.4 · better
 *
 *     A corrector helps when there is something to correct and gets in the way
 *     when there is not. That is what a corrector is supposed to do, and it is
 *     an argument against putting on makeup you do not need — which is worth
 *     more to this user than a flattering demo. So the screen reports the
 *     direction honestly, including when the answer is "this did not help".
 *
 *  ⚠️ THE PREVIEW IS GENERATED. Same discipline as the scarf try-on: the
 *     warning goes ABOVE the image, never in a caption underneath. And the
 *     redness of a render measures what the ENGINE did, not what a product in a
 *     shop will do — only the second, real photo answers that.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader, TriangleAlert, Palette, Camera, Info } from 'lucide-react';
import { CameraInput, DualView, NextStepPrompt, readApiError, PoweredByYouCam } from '@/core/ui';
import { getPortrait, getProfile, getImage, saveImage } from '@/core/db';
import { recommendCorrector, hexToLab } from '@/core/color';
import { SELFIE_PHOTO } from '@/features/face/components/PortraitCapture';
import type { ColorPortrait, CVDProfile } from '@/core/contracts/types';

interface Preview {
  preview: string;
  redness: { before: number | null; after: number | null };
  corrector: string;
}

type Phase = 'loading' | 'ready' | 'rendering' | 'done' | 'error';

/** Says which way a redness change went, in words rather than a sign. */
function direction(before: number | null, after: number | null) {
  if (before === null || after === null) return null;
  const delta = after - before;
  return {
    delta,
    // ⚠️ Inverted scale: HIGHER is calmer. A positive delta is an improvement.
    calmer: delta > 0,
    size: Math.abs(delta).toFixed(1),
  };
}

export function MakeupStudio() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [portrait, setPortrait] = useState<ColorPortrait | null>(null);
  const [profile, setProfile] = useState<CVDProfile | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The real check: redness measured on a photo taken after applying it. */
  const [afterReal, setAfterReal] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getPortrait(), getProfile(), getImage(SELFIE_PHOTO)])
      .then(([p, prof, selfie]) => {
        if (!alive) return;
        setPortrait(p);
        setProfile(prof);
        if (selfie) setSelfieUrl(URL.createObjectURL(selfie));
        setPhase('ready');
      })
      .catch(() => alive && setPhase('error'));
    return () => {
      alive = false;
    };
  }, []);

  const useNewSelfie = useCallback(async (file: File) => {
    await saveImage(SELFIE_PHOTO, file);
    setSelfieUrl(URL.createObjectURL(file));
    setResult(null);
    setAfterReal(null);
  }, []);

  const corrector = portrait ? recommendCorrector(hexToLab(portrait.skinHex)) : null;

  async function render() {
    const selfie = await getImage(SELFIE_PHOTO);
    if (!selfie || !corrector) return;
    setPhase('rendering');
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', selfie, 'face.jpg');
      fd.append('mode', 'preview');
      fd.append('corrector', corrector.hex);
      const res = await fetch('/api/makeup', { method: 'POST', body: fd });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        setPhase('error');
        return;
      }
      setResult((await res.json()) as Preview);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The preview did not come back.');
      setPhase('error');
    }
  }

  /** The only half of this that answers "did it work?" on a real face. */
  async function checkForReal(file: File) {
    setChecking(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('mode', 'measure');
      const res = await fetch('/api/makeup', { method: 'POST', body: fd });
      if (!res.ok) {
        setError((await readApiError(res)).message);
        return;
      }
      const d = (await res.json()) as { redness: number | null };
      setAfterReal(d.redness);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That measurement failed.');
    } finally {
      setChecking(false);
    }
  }

  if (phase === 'loading') {
    return (
      <p role="status" className="mt-6 text-slate-600">
        Loading…
      </p>
    );
  }

  if (!portrait || !corrector) {
    return (
      <NextStepPrompt href="/portrait" cta="Measure your face">
        This needs your colour portrait first: the corrector is computed from your own
        measured skin, so there is nothing to apply until we have measured it.
      </NextStepPrompt>
    );
  }

  const simulated = result ? direction(result.redness.before, result.redness.after) : null;
  const real = direction(result?.redness.before ?? portrait.rednessRaw, afterReal);

  return (
    <div className="mt-4">
      <section className="rounded-xl border-2 border-slate-200 p-4" aria-labelledby="what">
        <h2 id="what" className="flex items-center gap-2 font-semibold text-slate-900">
          <Palette size={18} aria-hidden />
          The colour we worked out for you
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <span
            className="h-12 w-12 shrink-0 rounded-md border border-slate-300"
            style={{ backgroundColor: corrector.hex }}
            aria-hidden
          />
          <p className="text-sm text-slate-700">
            <span className="font-semibold capitalize text-slate-900">{corrector.family}</span>
            {' · '}
            <code>{corrector.hex}</code>
          </p>
        </div>
      </section>

      {/* ── The face it goes on ────────────────────────────────────────── */}
      <section className="mt-6" aria-labelledby="face">
        <h2 id="face" className="text-lg font-bold text-slate-900">
          Your face
        </h2>
        {selfieUrl ? (
          <>
            <p className="mt-1 text-sm text-slate-600">
              The selfie from your colour portrait, kept on this device. &ldquo;Start
              over&rdquo; erases it.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selfieUrl}
              alt="Your stored selfie"
              className="mt-3 w-full rounded-xl border-2 border-slate-300"
            />
            <div className="mt-3">
              <CameraInput
                facing="user"
                guide="face"
                label="Use a different photo"
                hint="Replaces the one stored on this device. Closer than the portrait shot: this screen's measurement needs your face to fill more than 60% of the width."
                onSelect={useNewSelfie}
              />
            </div>
          </>
        ) : (
          <div className="mt-3">
            <CameraInput
              facing="user"
              guide="face"
              label="Take a selfie"
              hint="Kept on this device so you do not have to take it again. Close in — your face should fill more than 60% of the width."
              onSelect={useNewSelfie}
            />
          </div>
        )}
      </section>

      {selfieUrl && phase !== 'rendering' && (
        <button
          onClick={render}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          <Palette size={18} aria-hidden />
          {result ? 'Try it again' : 'Put the corrector on and measure'}
        </button>
      )}

      {phase === 'rendering' && (
        <div role="status" className="mt-5 rounded-xl border-2 border-slate-300 p-5">
          <div className="flex items-center gap-3">
            <Loader size={20} className="animate-spin text-slate-700" aria-hidden />
            <div>
              <p className="font-semibold text-slate-900">Applying it…</p>
              <p className="text-sm text-slate-600">
                Measuring your redness, applying the colour, then measuring again.
              </p>
            </div>
          </div>
          {/* The API is doing the work right now, so the credit moves. */}
          <PoweredByYouCam />
        </div>
      )}

      {error && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border-2 border-slate-800 p-4">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-slate-800" aria-hidden />
          <p className="text-sm text-slate-800">{error}</p>
        </div>
      )}

      {result && (
        <section className="mt-6" aria-labelledby="outcome">
          <h2 id="outcome" className="text-lg font-bold text-slate-900">
            What it did
          </h2>

          {/*
            ⚠️ ABOVE THE IMAGE, AS AN ALERT. The picture is the loudest thing on
            this screen and it is the one part that was invented.
          */}
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg border-2 border-slate-800 p-3 text-sm text-slate-800"
          >
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>This picture is generated, not photographed.</strong> The numbers
              below describe what the engine did to it — not what a product from a shop
              will do to your face. For that, use the real check underneath.
            </span>
          </div>

          {profile ? (
            <DualView src={result.preview} profile={profile} alt="Your face with the corrector applied" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.preview} alt="Your face with the corrector applied" className="mt-3 w-full rounded-xl" />
          )}

          <div className="mt-4 rounded-xl border-2 border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900">Redness, on this photo</p>
            <p className="mt-1 text-sm text-slate-700">
              Before <strong>{result.redness.before?.toFixed(0) ?? '—'}</strong> · after{' '}
              <strong>{result.redness.after?.toFixed(0) ?? '—'}</strong> out of 100, where
              higher means calmer skin.
            </p>
            {/*
              ⚠️ A DASH ON ITS OWN IS NOT AN ANSWER. Either reading can now be
              missing without taking the picture down with it — the skin
              analyser wants the face over 60% of the frame, which is stricter
              than the portrait's own framing — so when one is absent the screen
              says what is absent and how to get it, rather than showing a
              punctuation mark and letting the user guess.
            */}
            {(result.redness.before === null || result.redness.after === null) && (
              <p className="mt-2 text-sm text-slate-700">
                One of those readings did not come back: this measurement needs your face to
                fill more than 60% of the picture&rsquo;s width, which is closer in than the
                photo for your colour portrait needs. The picture above is unaffected — it
                is rendered, not measured. Retaking the selfie closer usually restores the
                comparison.
              </p>
            )}
            {simulated && (
              <p className="mt-2 text-sm text-slate-800">
                {simulated.calmer
                  ? `Calmer by ${simulated.size}. On this photo, that colour did what it is meant to do.`
                  : `Redder by ${simulated.size}. On this photo the corrector did not help — which usually means there was not much redness to correct in the first place.`}
              </p>
            )}
            {/*
              The measured finding, stated rather than hidden. It is the reason
              this screen can tell someone NOT to use a corrector, which is more
              useful than a demo that always flatters.
            */}
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
              We measured this both ways while building it: on skin that was already calm,
              adding a corrector made the reading worse; on skin with real redness, it made
              it better. A corrector is worth using when there is something to correct, and
              not otherwise.
            </p>
          </div>
        </section>
      )}

      {/* ── The half that actually answers the question ─────────────────── */}
      {result && (
        <section className="mt-6 rounded-xl border-2 border-slate-900 p-4" aria-labelledby="real">
          <h2 id="real" className="flex items-center gap-2 font-semibold text-slate-900">
            <Camera size={18} aria-hidden />
            Now the real check
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Put the corrector on for real, then photograph yourself in the same light. This
            measures your actual face, and it is the only part of this screen that answers
            whether it worked.
          </p>

          {!checking && (
            <div className="mt-3">
              <CameraInput
                facing="user"
                guide="face"
                label="I have applied it — measure me"
                hint="Same light as before, or the comparison is between two different lamps rather than two faces. Close in — your face needs to fill more than 60% of the width."
                onSelect={checkForReal}
              />
            </div>
          )}

          {checking && (
            <p role="status" className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <Loader size={16} className="animate-spin" aria-hidden />
              Measuring your face…
            </p>
          )}

          {afterReal !== null && (
            <div className="mt-4 rounded-lg border-2 border-slate-300 p-3">
              <p className="text-sm text-slate-700">
                Your redness now measures <strong>{afterReal.toFixed(0)} out of 100</strong>,
                against <strong>{(result.redness.before ?? portrait.rednessRaw)?.toFixed(0) ?? '—'}</strong>{' '}
                before.
              </p>
              {real && (
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {real.calmer
                    ? `Calmer by ${real.size}. It worked on your face, not just in a render.`
                    : `Redder by ${real.size}. On your real face this did not help — and that is a measurement, not an opinion.`}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <Link
        href="/portrait"
        className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-slate-800 underline"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to your colour portrait
      </Link>
    </div>
  );
}
