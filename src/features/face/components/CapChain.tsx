'use client';

/**
 * STAGE A — arrangement by tapping a chain.
 *
 * Starting from the reference swatch, the user taps whichever of the remaining
 * ones looks closest to the last one placed. Fifteen taps, one thumb.
 *
 * 🔑 WHY TAPPING AND NOT DRAGGING. The original D-15 is physical caps reordered
 *    by hand, but dragging fifteen tiles on a phone screen is fragile and shuts
 *    out anyone using a keyboard or a screen reader. Tapping produces exactly
 *    the same permutation and excludes nobody.
 *
 * ⚠️ ON THE RULE "COLOUR IS NEVER THE ONLY CARRIER OF MEANING": here the
 *    swatches ARE colour of necessity — it is a colour vision test, the stimulus
 *    cannot be anything else. The rule applies to everything around it: progress,
 *    selection, undo and errors carry number, text and shape. Every swatch is
 *    numbered so the user can say out loud what they did.
 */
import { Undo2, ArrowRight } from 'lucide-react';
import { CAPS, MOVABLE_CAPS, REFERENCE_CAP, type Cap } from '../lib/caps';

interface Props {
  /** Swatches already placed, starting with the reference. */
  chain: number[];
  onPick: (capIndex: number) => void;
  onUndo: () => void;
}

function Swatch({
  cap,
  size,
  label,
}: {
  cap: Cap;
  size: 'sm' | 'lg';
  label?: string;
}) {
  return (
    <div
      className={
        size === 'lg'
          ? 'relative h-24 w-24 rounded-xl border-2 border-slate-900'
          : 'relative h-10 w-10 rounded-lg border border-slate-400'
      }
      style={{ backgroundColor: cap.hex }}
    >
      <span
        className={
          size === 'lg'
            ? 'absolute bottom-1 right-1 rounded bg-white/90 px-1.5 text-xs font-bold text-slate-900'
            : 'absolute bottom-0 right-0 rounded bg-white/90 px-1 text-[10px] font-bold text-slate-900'
        }
      >
        {cap.index + 1}
      </span>
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

export function CapChain({ chain, onPick, onUndo }: Props) {
  const placed = chain.length;
  const total = CAPS.length;
  const last = CAPS[chain[chain.length - 1]];
  const remaining = MOVABLE_CAPS.filter((cap) => !chain.includes(cap.index));

  return (
    <section aria-labelledby="step-a">
      <h2 id="step-a" className="text-xl font-bold">
        Step 1 of 2 · Put them in order
      </h2>

      {/* Progress: number + bar. Never colour alone. */}
      <div className="mt-3">
        <p className="text-sm font-medium text-slate-700">
          {placed - 1} of {total - 1} placed
        </p>
        <div
          role="progressbar"
          aria-valuenow={placed - 1}
          aria-valuemin={0}
          aria-valuemax={total - 1}
          aria-label="Arrangement progress"
          className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full bg-slate-900 transition-[width]"
            style={{ width: `${((placed - 1) / (total - 1)) * 100}%` }}
          />
        </div>
      </div>

      <div className="mt-6 rounded-xl border-2 border-slate-300 p-4">
        <p className="text-sm text-slate-700">
          {placed === 1 ? (
            <>
              This is the <strong>starting</strong> swatch. From the ones below, tap the
              one that looks <strong>closest to it</strong>.
            </>
          ) : (
            <>
              Last one placed. From the ones below, tap the one that looks <strong>closest to it</strong>.
            </>
          )}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Swatch
            cap={last}
            size="lg"
            label={
              placed === 1
                ? `Starting swatch, number ${REFERENCE_CAP.index + 1}`
                : `Last placed, swatch number ${last.index + 1}`
            }
          />
          <ArrowRight className="text-slate-400" aria-hidden />
          <span className="text-sm text-slate-500">which comes next?</span>
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-8" role="list">
        {remaining.map((cap) => (
          <li key={cap.index}>
            <button
              type="button"
              onClick={() => onPick(cap.index)}
              aria-label={`Choose swatch number ${cap.index + 1}`}
              className="relative block aspect-square w-full rounded-lg border-2 border-slate-300 transition hover:border-slate-900 hover:shadow-md"
              style={{ backgroundColor: cap.hex }}
            >
              <span className="absolute bottom-0.5 right-0.5 rounded bg-white/90 px-1 text-[10px] font-bold text-slate-900">
                {cap.index + 1}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* The chain so far, so the user can review what they did. */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-slate-700">Your order so far</h3>
        <ol className="mt-2 flex flex-wrap gap-1.5" role="list">
          {chain.map((capIndex, position) => (
            <li key={capIndex}>
              <Swatch
                cap={CAPS[capIndex]}
                size="sm"
                label={`Position ${position + 1}: swatch number ${capIndex + 1}`}
              />
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        onClick={onUndo}
        disabled={placed <= 1}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Undo2 size={16} aria-hidden />
        Undo last
      </button>
    </section>
  );
}
