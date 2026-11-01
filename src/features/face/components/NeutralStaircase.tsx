'use client';

/**
 * STAGE B — threshold against neutral grey.
 *
 * Four patches: three identical greys and one shifted along a confusion axis.
 * The user points at the odd one out.
 *
 * 🔑 Four-alternative forced choice, not "can you see a difference?". A yes/no
 *    answer depends on how bold each person is about saying yes, and that
 *    contaminates the threshold. With four options, someone who sees nothing is
 *    right 25% of the time by chance and the staircase detects it: you cannot
 *    look good by guessing.
 *
 * ⚠️ "I can't tell them apart" MUST be offered as an explicit answer. Without
 *    that button, a person who sees nothing has to pretend to choose, and blind
 *    guessing injects noise exactly at the bottom of the staircase, which is
 *    where severity is decided. It counts as a miss, same as a wrong pick.
 *
 * 🔤 The patches are numbered and labelled. This screen is taken by people who
 *    may not be able to distinguish the swatches at all — "the third one" has
 *    to be sayable, and reachable by keyboard.
 */
import { HelpCircle } from 'lucide-react';
import { setProgress, type StaircaseSet, type Trial } from '../lib/threshold';

interface Props {
  set: StaircaseSet;
  trial: Trial;
  onAnswer: (correct: boolean) => void;
}

export function NeutralStaircase({ set, trial, onAnswer }: Props) {
  const { done, total } = setProgress(set);
  const pct = Math.round((done / total) * 100);

  return (
    <section aria-labelledby="step-b">
      <h2 id="step-b" className="text-xl font-bold text-slate-900">
        Step 2 of 2 · Find the odd one out
      </h2>

      <div className="mt-3">
        <p className="text-sm font-medium text-slate-700">
          {pct}% complete
          <span className="text-slate-500"> · {done} of {total} adjustments</span>
        </p>
        <div
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Threshold measurement progress"
          className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full bg-slate-900 transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="mt-6 text-slate-700">
        Three of these four squares are <strong>exactly the same</strong>. Tap the one
        that is different.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        If you cannot tell, say so. That is a real answer and it tells us more than a
        guess would.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3" role="list">
        {trial.patches.map((hex, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onAnswer(i === trial.oddIndex)}
              className="group block w-full rounded-xl border-2 border-slate-300 p-2 transition hover:border-slate-900 focus-visible:border-slate-900"
            >
              <span
                className="block aspect-square w-full rounded-lg"
                style={{ backgroundColor: hex }}
                aria-hidden
              />
              {/* The number is visible, not just an aria-label: someone who
                  cannot separate the swatches still needs to name their choice. */}
              <span className="mt-2 block text-center text-sm font-bold text-slate-700">
                {i + 1}
              </span>
              <span className="sr-only">Choose square {i + 1} as the different one</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onAnswer(false)}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-4 py-3 font-semibold text-slate-800"
      >
        <HelpCircle size={16} aria-hidden />
        They all look the same to me
      </button>
    </section>
  );
}
