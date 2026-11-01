'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  F5 + F18 · THE SAME COLOUR, TWICE — and the right panel changed meaning
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THIS COMPONENT USED TO SHOW "OTHERS SEE" BESIDE "YOU SEE", AND THAT
 *     DEFAULT WAS INCOHERENT. Its own header argued the point and then did the
 *     opposite: it said the simulated panel "transfers them no new information
 *     at all", and left it as one of the two panels on screen by default.
 *
 *     The reason it transfers nothing is worth stating plainly, because the
 *     whole feature follows from it:
 *
 *         FOR A COLOUR-BLIND USER, THE ORIGINAL IS ALREADY THEIR VIEW.
 *         Their eyes do the simulation. Computing it and showing it back is
 *         handing them what they were already looking at.
 *
 *  ── AND BOTH PANELS ARE SIMULATED BY DEFAULT ────────────────────────────
 *
 *    left   AS YOU SEE IT NOW        the real colour, through their eyes
 *    right  WITH ASSISTED CONTRAST   the altered colour, through their eyes
 *
 *  Putting the TRUE colour beside the assisted one — the first attempt —
 *  demonstrates nothing to anybody who can already see colour: they could read
 *  both squares, so all they notice is that a colour moved. Simulating both
 *  makes the gain visible to everyone, and costs the user nothing, because the
 *  left panel is what their eyes were doing to the original anyway.
 *
 *  The button restores the true colours, which is what a sighted person needs
 *  in order to check what the thing actually is.
 *
 *  ⚠️ THE ALTERED PANEL IS LABELLED AS ALTERED, ALWAYS — never "enhanced",
 *     which would imply we improved on the truth. And the reference truth here
 *     is the HEX beneath, which is always the measurement: the pixel is for
 *     telling colours apart, the code and the name are for knowing what they
 *     are.
 *
 *  🔤 Panels are told apart by LABEL and BORDER STYLE — dashed versus solid —
 *     never by colour. A legend that needs colour vision would be a joke here.
 */
import { useMemo, useState } from 'react';
import { Eye, Sparkles } from 'lucide-react';
import { simulateHex, daltonizeHex } from '@/core/color';
import type { CVDProfile } from '@/core/contracts/types';
import { useViewPreferences } from './ViewPreferences';

interface Props {
  hex: string;
  /** What this colour is, in words. Carries the real information. */
  label: string;
  profile: CVDProfile | null;
}

export function DualSwatch({ hex, label, profile }: Props) {
  const { strength } = useViewPreferences();
  /** false = both through their eyes (the comparison) · true = the true colours. */
  const [trueColours, setTrueColours] = useState(false);

  const assisted = useMemo(
    () => (profile ? daltonizeHex(hex, profile, { strength }) : hex),
    [hex, profile, strength],
  );

  /**
   * ⚠️ BOTH SIDES ARE SIMULATED BY DEFAULT. See DualView for the full reasoning:
   *    showing the true colour beside the assisted one proves nothing to anyone
   *    who can already see colour, and the person using this app is looking at
   *    the simulated version anyway — their eyes do it.
   */
  const left = useMemo(
    () => (profile && !trueColours ? simulateHex(hex, profile) : hex),
    [hex, profile, trueColours],
  );
  const right = useMemo(
    () => (profile && !trueColours ? simulateHex(assisted, profile) : assisted),
    [assisted, profile, trueColours],
  );

  if (!profile) return null;

  const labels = trueColours
    ? { left: 'As it is', right: 'Assisted contrast' }
    : { left: 'As you see it now', right: 'With assisted contrast' };

  return (
    <figure className="mt-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border-2 border-dashed border-slate-400 p-2">
          <div className="mb-2 flex items-center gap-1.5">
            <Eye size={13} className="shrink-0 text-slate-600" aria-hidden />
            <span
              translate="no"
              key={labels.left}
              className="text-[11px] font-bold uppercase tracking-wide text-slate-600"
            >
              {labels.left}
            </span>
          </div>
          <div
            className="h-16 w-full rounded-lg border border-slate-300"
            style={{ backgroundColor: left }}
            aria-hidden
          />
          <code className="mt-1 block text-center text-[11px] text-slate-600">{hex}</code>
        </div>

        <div className="rounded-xl border-2 border-solid border-slate-900 p-2">
          <div className="mb-2 flex items-center gap-1.5">
            <Sparkles size={13} className="shrink-0 text-slate-900" aria-hidden />
            <span
              translate="no"
              key={labels.right}
              className="text-[11px] font-bold uppercase tracking-wide text-slate-900"
            >
              {labels.right}
            </span>
          </div>
          <div
            className="h-16 w-full rounded-lg border border-slate-300"
            style={{ backgroundColor: right }}
            aria-hidden
          />
          <code className="mt-1 block text-center text-[11px] text-slate-600">{assisted}</code>
        </div>
      </div>

      <figcaption translate="no" className="mt-2 text-xs text-slate-600">
        {trueColours ? (
          <span key="true">
            {label}: the real colour, and beside it the same colour altered so you can tell
            it apart. The code underneath is the measurement — that is what to trust.
          </span>
        ) : (
          <span key="seen">
            {label}: both squares are shown the way you see colour. The difference between
            them is what assisted contrast adds.
          </span>
        )}
      </figcaption>

      <button
        type="button"
        translate="no"
        onClick={() => setTrueColours((v) => !v)}
        className="mt-2 min-h-11 text-xs font-semibold text-slate-700 underline"
      >
        {trueColours ? (
          <span key="back">Back to how I see it</span>
        ) : (
          <span key="real">Show the true colours</span>
        )}
      </button>
    </figure>
  );
}
