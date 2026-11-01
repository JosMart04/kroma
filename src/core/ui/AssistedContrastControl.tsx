'use client';
/**
 * The control for assisted contrast: on/off, how strong, and a preset for the
 * one case where naturalness stops mattering.
 *
 * ⚠️ "READ A LABEL" EXISTS BECAUSE NOT ALL CONTENT HAS THE SAME GOAL. A gentle
 *    filter is right for a wardrobe, where an image that looks wrong gets the
 *    feature switched off. It is the wrong answer for text hidden in a pattern
 *    — a care label, a warning printed in red on black, the Ishihara plate on a
 *    novelty t-shirt. There is no naturalness worth preserving there; there is
 *    only whether you can read it. Measured on the harness, that difference is
 *    real: forest green against brown reads 6.1 apart for a full deutan, 4.5 at
 *    gentle strength and 11.5 at full. Gentle can sit in the dip.
 *
 * 🔤 State travels in text and in the control itself, never in colour.
 */
import { useEffect, useState } from 'react';
import { Sparkles, ScanLine } from 'lucide-react';
import { useViewPreferences, READ_A_LABEL_STRENGTH, DEFAULT_VIEW_PREFERENCES } from './ViewPreferences';

export function AssistedContrastControl() {
  const { assistedContrast, strength, loading, update } = useViewPreferences();
  /** What the thumb is showing right now, which may be ahead of what is saved. */
  const [dragging, setDragging] = useState(strength);

  // Keep up with changes that did not come from this slider — the preset
  // button, or the stored value arriving after first paint.
  useEffect(() => setDragging(strength), [strength]);

  if (loading) return null;

  const atFull = strength >= READ_A_LABEL_STRENGTH;

  return (
    <section
      aria-labelledby="assisted-contrast"
      className="mt-8 rounded-xl border-2 border-slate-300 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="assisted-contrast"
            className="flex items-center gap-2 font-semibold text-slate-900"
          >
            <Sparkles size={18} aria-hidden />
            Assisted contrast
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Shifts colours you cannot separate into ones you can. The real colour is always
            shown beside it, and the name is always measured from the real one.
          </p>
        </div>

        <label className="flex shrink-0 items-center gap-2">
          <span className="sr-only">Turn assisted contrast on or off</span>
          <input
            type="checkbox"
            checked={assistedContrast}
            onChange={(e) => update({ assistedContrast: e.target.checked })}
            className="h-6 w-6"
          />
          <span className="text-sm font-semibold text-slate-800">
            {assistedContrast ? 'On' : 'Off'}
          </span>
        </label>
      </div>

      {assistedContrast && (
        <div className="mt-4">
          {/*
            ⚠️ THE SLIDER KEEPS ITS OWN VALUE WHILE YOU DRAG IT, and that fixes a
            reported bug: the percentage appeared frozen on a phone. Every drag
            event was writing the preference to IndexedDB and re-rendering every
            swatch and thumbnail on the page from it, so the label updated in
            fits. Local state answers the finger immediately; the write happens
            once, when the finger lifts.
          */}
          <label className="block">
            <span translate="no" className="text-sm font-semibold text-slate-800">
              How strong · {Math.round(dragging * 100)}%
            </span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={dragging}
              onChange={(e) => setDragging(Number(e.target.value))}
              onPointerUp={() => update({ strength: dragging })}
              onKeyUp={() => update({ strength: dragging })}
              onBlur={() => update({ strength: dragging })}
              className="mt-2 w-full"
            />
          </label>
          <p className="mt-1 text-xs text-slate-600">
            Gentle by default. Most people with colour vision deficiency prefer a subtle
            filter and switch off an aggressive one — even when the aggressive one separates
            colours better.
          </p>

          <button
            type="button"
            onClick={() =>
              update({
                strength: atFull ? DEFAULT_VIEW_PREFERENCES.strength : READ_A_LABEL_STRENGTH,
              })
            }
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900"
          >
            <ScanLine size={16} aria-hidden />
            {atFull ? 'Back to gentle' : 'Read a label — full strength'}
          </button>
          <p className="mt-1 text-xs text-slate-600">
            For text hidden in a pattern, where looking natural does not matter and reading
            it does.
          </p>
        </div>
      )}
    </section>
  );
}
