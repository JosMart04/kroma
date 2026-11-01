'use client';
/**
 * F15 · Colour corrector and foundation, derived from the measured face.
 *
 * 🔤 The recommendation is a NAME, a HEX and the coordinates it came from —
 *    never a swatch on its own. A swatch is the one thing this user cannot
 *    read, and a corrector chosen by looking at a square of colour is the
 *    decision they came here unable to make.
 *
 * ⚠️ NO THRESHOLD DECIDES ANYTHING HERE. The measured redness score is shown
 *    on its own scale, and we do not say whether it is "a lot" — the empirical
 *    per-phototype calibration that would license that sentence was never done,
 *    and inventing one would be exactly the uncheckable claim this product
 *    exists to prevent. What we answer is WHICH colour, which is arithmetic.
 */
import Link from 'next/link';
import { Palette, Info, Sparkles } from 'lucide-react';
import { DualSwatch } from '@/core/ui';
import { recommendCorrector, describeFoundation, hexToLab } from '@/core/color';
import type { ColorPortrait, CVDProfile } from '@/core/contracts/types';

export function MakeupAdvice({
  portrait,
  profile,
}: {
  portrait: ColorPortrait;
  profile: CVDProfile | null;
}) {
  const skinLab = hexToLab(portrait.skinHex);
  const corrector = recommendCorrector(skinLab);
  /**
   * ⚠️ The depth half needs the phototype, which can now come back unmeasured
   *    when the engine rejected the relit image. The corrector COLOUR does not
   *    — it is arithmetic on the measured skin — so it is still shown. Losing
   *    one call should cost one answer, not the screen.
   */
  const foundation = portrait.fitzpatrick
    ? describeFoundation(skinLab, portrait.fitzpatrick)
    : null;

  return (
    <section className="mt-6" aria-labelledby="makeup">
      <h2 id="makeup" className="flex items-center gap-2 text-lg font-bold text-slate-900">
        <Palette size={18} aria-hidden />
        What to buy for this face
      </h2>

      <div className="mt-3 rounded-xl border-2 border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">
          Colour corrector: <span className="capitalize">{corrector.family}</span>
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          <code>{corrector.hex}</code> — show this code to whoever sells it to you
        </p>
        <DualSwatch hex={corrector.hex} label="This corrector" profile={profile} />
        <p className="mt-3 text-sm text-slate-700">{corrector.why}</p>

        <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          {portrait.rednessRaw === null ? (
            <>
              How much of it to use depends on how much redness there is, and the engine
              returned no redness reading for your photo — so that part is yours to judge,
              and we will not guess it for you.
            </>
          ) : (
            <>
              Your redness measures <strong>{portrait.rednessRaw.toFixed(0)} out of 100</strong>,
              where higher means calmer skin. We will not tell you whether that counts as
              &ldquo;a lot&rdquo; — we have no honest way to draw that line, and a line we
              invented is one you could not check. The colour above is the part we can prove.
            </>
          )}
        </p>
      </div>

      {foundation ? (
        <div className="mt-3 rounded-xl border-2 border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900">
            Foundation: shade {foundation.phototype} of 6, {foundation.undertone} undertone
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Measured from your own skin, not estimated from your answers.
          </p>
          <p className="mt-3 text-sm text-slate-700">{foundation.why}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm text-slate-600">
          I could not read your phototype from that photo, so I am not going to guess a
          foundation depth. Measuring your face again in even daylight usually fixes it —
          the corrector colour above does not depend on it.
        </p>
      )}

      {/*
        F16 · The colour above is a claim the user has to take on trust, and
        this is where they stop having to. It is the whole point of measuring.
      */}
      <Link
        href="/makeup"
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-900 px-5 py-3 font-semibold text-slate-900"
      >
        <Sparkles size={18} aria-hidden />
        See it on your face, and check whether it works
      </Link>

      <p className="mt-3 text-xs text-slate-500">
        This answers redness only. Correctors are also used for blue-toned pigmentation,
        which we do not measure and therefore do not advise on. Persistent facial redness
        is worth a doctor rather than a corrector — nothing here is a diagnosis.
      </p>
    </section>
  );
}
