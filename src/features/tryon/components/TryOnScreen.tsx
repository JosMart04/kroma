'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F13 · SEE IT ON ME — try-on, with the verdict that makes it mean something
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ A TRY-ON PICTURE IS THE ONE OUTPUT OUR USER CANNOT EVALUATE. Handing a
 *     person with colour vision deficiency an image and asking "does that work
 *     on you?" is the question they came here unable to answer. So the picture
 *     is never the answer on this screen:
 *
 *       · the ANSWER is text, computed from the colour we MEASURED off their
 *         garment photo and the colour we MEASURED off their face;
 *       · the PICTURE shows fit and shape, which is a real thing to want and a
 *         thing they can judge perfectly well;
 *       · the DUAL VIEW turns the picture into evidence they can hand to
 *         someone who does see colour.
 *
 *  ⚠️ NO VERDICT IS COMPUTED FROM THE RENDERED PIXELS. The engine generated
 *     that image — it chose the lighting and the drape. Measuring it would be
 *     measuring the engine's opinion and presenting it as their garment. Every
 *     number on this screen comes from the wardrobe entry and the portrait.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader, TriangleAlert, Shirt, Sparkles, Info } from 'lucide-react';
import { CameraInput, VerdictBadge, DualView, NextStepPrompt, readApiError, PoweredByYouCam } from '@/core/ui';
import { getProfile, getPortrait, getGarment, getImage, saveImage, BODY_PHOTO_KEY } from '@/core/db';
import { judgePair } from '@/core/color';
import { toAccessoryKind, isRenderable } from '@/core/youcam/tryOnCategory';
import type { CVDProfile, ColorPortrait, Garment, PairVerdict } from '@/core/contracts/types';

/** The stored full-body photo. One per user, reused for every garment. */
// One owner for this key: see BODY_PHOTO_KEY in core/db.
const BODY_PHOTO = BODY_PHOTO_KEY;

type Phase = 'loading' | 'ready' | 'rendering' | 'done' | 'error';

interface Judgement {
  label: string;
  verdict: PairVerdict;
}

export function TryOnScreen({ id }: { id: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [garment, setGarment] = useState<Garment | null>(null);
  const [profile, setProfile] = useState<CVDProfile | null>(null);
  const [portrait, setPortrait] = useState<ColorPortrait | null>(null);
  const [bodyUrl, setBodyUrl] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  /** F14 · which fit the scarf/hat engine should render. Never persisted. */
  const [fit, setFit] = useState<'male' | 'female' | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getGarment(id), getProfile(), getPortrait(), getImage(BODY_PHOTO)])
      .then(([g, p, pt, body]) => {
        if (!alive) return;
        setGarment(g);
        setProfile(p);
        setPortrait(pt);
        if (body) setBodyUrl(URL.createObjectURL(body));
        setPhase('ready');
      })
      .catch(() => alive && setPhase('error'));
    return () => {
      alive = false;
    };
  }, [id]);

  const saveBody = useCallback(async (file: File) => {
    await saveImage(BODY_PHOTO, file);
    setBodyUrl(URL.createObjectURL(file));
  }, []);

  async function render() {
    if (!garment) return;
    setPhase('rendering');
    setError(null);
    setAction(null);
    try {
      const [body, garmentPhoto] = await Promise.all([getImage(BODY_PHOTO), getImage(garment.id)]);
      if (!body || !garmentPhoto) {
        setError('I no longer have both photos on this device. Take the photo of yourself again.');
        setPhase('error');
        return;
      }
      const fd = new FormData();
      fd.append('person', body, 'person.jpg');
      fd.append('garment', garmentPhoto, 'garment.jpg');
      fd.append('category', garment.category);
      // F14 · Required by the scarf and hat engines, sent only for them, and
      // never written to storage.
      if (accessory && fit) fd.append('gender', fit);

      const res = await fetch('/api/tryon', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await readApiError(res);
        setError(d.message);
        setAction(d.action ?? null);
        setPhase('error');
        return;
      }
      setResult(URL.createObjectURL(await res.blob()));
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The try-on did not come back.');
      setPhase('error');
    }
  }

  const accessory = garment ? toAccessoryKind(garment.category) : null;
  const renderable = garment ? isRenderable(garment.category) : false;

  /**
   * The judgements. Both come from measurements the user can trace: the colour
   * we read off their garment photo, and the colours we read off their face.
   * A garment is worn against a whole fixed palette, not just against skin.
   */
  const judgements: Judgement[] =
    garment && profile && portrait
      ? [
          { hex: portrait.skinHex, label: 'your skin' },
          { hex: portrait.hairHex, label: 'your hair' },
        ]
          .filter((x): x is { hex: string; label: string } => Boolean(x.hex))
          .map(({ hex, label }) => ({
            label,
            verdict: judgePair({
              aHex: garment.colorHex,
              bHex: hex,
              aName: garment.colorName,
              bName: label,
              profile,
              aConfidence: garment.confidence,
              bConfidence: portrait.confidence,
            }),
          }))
      : [];

  if (phase === 'loading') {
    return (
      <p role="status" className="mt-6 text-slate-600">
        Loading…
      </p>
    );
  }

  if (!garment) {
    return (
      <div className="mt-6">
        <p className="text-slate-700">
          That garment is not in your wardrobe on this device.
        </p>
        <Link href="/wardrobe" className="mt-4 inline-flex items-center gap-2 font-semibold underline">
          <ArrowLeft size={16} aria-hidden />
          Back to your wardrobe
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 rounded-xl border-2 border-slate-200 p-3">
        <span
          className="h-12 w-12 shrink-0 rounded-md border border-slate-300"
          style={{ backgroundColor: garment.colorHex }}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{garment.colorName}</p>
          <p className="text-sm text-slate-600">
            {garment.category}
            {garment.isPatterned && ' · patterned'} · <code>{garment.colorHex}</code>
          </p>
        </div>
      </div>

      {/* ── The answer, before the picture. It does not need the render. ── */}
      {judgements.length > 0 ? (
        <section className="mt-5" aria-labelledby="against-you">
          <h2 id="against-you" className="flex items-center gap-2 text-lg font-bold">
            <Sparkles size={18} aria-hidden />
            Against your own colouring
          </h2>
          <ul className="mt-3 space-y-2">
            {judgements.map((j) => (
              <li key={j.label} className="rounded-xl border-2 border-slate-200 p-4">
                <div className="flex items-center gap-2">
                  <VerdictBadge verdict={j.verdict.verdict} />
                  <span className="text-sm font-semibold text-slate-700">against {j.label}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{j.verdict.explanation}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            Computed from the colour measured off your own photos
            {renderable && ' — not from the picture below'}.
          </p>
        </section>
      ) : !profile ? (
        <NextStepPrompt href="/calibrate" cta="Measure how you see colour">
          Once I know how you see colour, I can tell you whether this works against your
          own colouring. It takes two minutes.
        </NextStepPrompt>
      ) : (
        <NextStepPrompt href="/portrait" cta="Measure your face">
          Measure your face and I can tell you whether this works against your own skin and
          hair — the palette you wear every day.
        </NextStepPrompt>
      )}

      {/* ── The picture: fit and shape, which they can judge themselves ── */}
      <section className="mt-8" aria-labelledby="on-you">
        <h2 id="on-you" className="flex items-center gap-2 text-lg font-bold">
          <Shirt size={18} aria-hidden />
          See it on you
        </h2>

        {!renderable && (
          <p className="mt-3 flex items-start gap-2 rounded-lg border-2 border-slate-300 p-3 text-sm text-slate-700">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
            A {garment.category} cannot be rendered on a body by the engine we use. It stays
            in your wardrobe and in every verdict above — there is just no picture of it
            being worn.
          </p>
        )}

        {renderable && (
          <>
            {garment.category === 'bottom' && (
              <p className="mt-3 flex items-start gap-2 rounded-lg border-2 border-slate-300 p-3 text-sm text-slate-700">
                <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                For trousers and skirts the engine needs a photo of them being worn — a flat product shot is not supported for the lower body, and usually comes back wrong.
              </p>
            )}
            {!bodyUrl && (
              <div className="mt-3">
                <p className="mb-3 text-sm text-slate-600">
                  I need one photo of you first — standing, facing the camera, from head to
                  about the knees. It is kept on this device and reused for everything you
                  try on.
                </p>
                <CameraInput
                  guide="body"
                  label="Take a photo of yourself"
                  hint="Stand against a plain wall, arms slightly away from your body."
                  onSelect={saveBody}
                />
              </div>
            )}

            {/*
              F14 · The scarf and hat engines require `gender`, and it appears
              in none of the documentation's generic examples. We ASK rather
              than infer it: guessing someone's gender from their photograph to
              satisfy an API field is not a shortcut this product takes, and a
              wrong guess is one more thing our user could not catch. It is sent
              with the render and never stored.
            */}
            {bodyUrl && accessory && phase !== 'rendering' && (
              <fieldset className="mt-4 rounded-xl border-2 border-slate-200 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-800">
                  Which fit should the {accessory} engine render?
                </legend>
                <div className="mt-2 flex gap-3">
                  {(['female', 'male'] as const).map((v) => (
                    <label
                      key={v}
                      className={
                        fit === v
                          ? 'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-slate-900 px-3 font-semibold text-slate-900'
                          : 'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 text-slate-700'
                      }
                    >
                      <input
                        type="radio"
                        name="fit"
                        value={v}
                        checked={fit === v}
                        onChange={() => setFit(v)}
                        className="h-4 w-4"
                      />
                      <span className="capitalize">{v}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  This is the try-on engine&rsquo;s own parameter, not a profile we keep. It
                  is sent with this render and stored nowhere.
                </p>
              </fieldset>
            )}

            {bodyUrl && phase !== 'rendering' && (
              <div className="mt-3">
                <button
                  onClick={render}
                  disabled={Boolean(accessory) && !fit}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-40"
                >
                  <Shirt size={18} aria-hidden />
                  {accessory && !fit
                    ? 'Choose a fit above first'
                    : result
                      ? 'Render it again'
                      : 'Put it on me'}
                </button>
                <CameraInput
                  label="Use a different photo of me"
                  hint="Replaces the one stored on this device."
                  onSelect={saveBody}
                />
              </div>
            )}

            {phase === 'rendering' && (
              <div
                role="status"
                className="mt-3 rounded-xl border-2 border-slate-300 p-5"
              >
                <div className="flex items-center gap-3">
                  <Loader size={20} className="animate-spin text-slate-700" aria-hidden />
                  <div>
                    <p className="font-semibold text-slate-900">Putting it on you…</p>
                    <p className="text-sm text-slate-600">
                      This is the slowest thing the app does — around half a minute.
                    </p>
                  </div>
                </div>
                {/* The API is doing the work right now, so the credit moves. */}
                <PoweredByYouCam />
              </div>
            )}

            {phase === 'error' && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl border-2 border-slate-800 p-4"
              >
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-slate-800" aria-hidden />
                <div>
                  <p className="text-sm text-slate-800">{error}</p>
                  {action && <p className="mt-1 text-sm text-slate-600">{action}</p>}
                </div>
              </div>
            )}

            {phase === 'done' && result && (
              <div className="mt-4">
                {/*
                  ⚠️ Labelled as generated, every time. It is the only image in
                  this app that was not measured off the user's own pixels, and
                  the person looking at it is the one who cannot tell.
                */}
                {/*
                  ⚠️ TWO DIFFERENT ENGINES, TWO DIFFERENT HONESTY PROBLEMS, and
                  they must not share a caption.

                  `cloth-v4` TRANSFERS the garment: a real photo of a black
                  printed tee came back as a black printed tee. Its picture can
                  be trusted for colour.

                  `/task/scarf` and `/task/hat` GENERATE one. Measured: a flat
                  magenta reference (#e010a0) came back as a crimson patterned
                  scarf (#570c25) in front of the Colosseum — ΔE 31.4, an
                  entirely different colour, with a pattern and a backdrop that
                  were never in the input. Showing that to someone who cannot
                  check a colour, under a mild "this is generated" note, is the
                  failure this product exists to prevent. So the warning goes
                  ABOVE the image, carries the number, and says plainly that the
                  colour in it is not theirs.
                */}
                {accessory ? (
                  <div
                    role="alert"
                    className="mb-3 flex items-start gap-2 rounded-lg border-2 border-slate-800 p-3 text-sm text-slate-800"
                  >
                    <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                    <span>
                      <strong>The colour in this picture is not your {accessory}&rsquo;s.</strong>{' '}
                      This engine invents a {accessory} rather than showing yours — we gave
                      it a bright pink one and it drew a dark red one instead. Use the
                      picture for how a {accessory} sits and drapes, nothing more. Your real
                      colour is <code>{garment.colorHex}</code>, and the verdict above comes
                      from that.
                    </span>
                  </div>
                ) : (
                  <p className="mb-3 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
                    <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
                    This picture is generated by the try-on engine, not photographed. Judge
                    the fit and the shape from it — the colour verdict above comes from the
                    measurement, which is the part you can trust.
                  </p>
                )}
                {profile ? (
                  <DualView src={result} profile={profile} alt="You wearing this garment" />
                ) : (
                  // `next/image` cannot optimise an object URL for a blob that
                  // exists only in this tab, and it never leaves the device.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result} alt="You wearing this garment" className="w-full rounded-xl" />
                )}
              </div>
            )}
          </>
        )}
      </section>

      <Link
        href="/wardrobe"
        className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-slate-800 underline"
      >
        <ArrowLeft size={16} aria-hidden />
        Back to your wardrobe
      </Link>
    </div>
  );
}
