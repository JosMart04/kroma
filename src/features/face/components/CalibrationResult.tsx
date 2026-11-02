'use client';

/**
 * Calibration result.
 *
 * 🔑 Confidence is shown ALWAYS, not only when it is poor. It is the central
 *    promise of the product: our user cannot look at a result and see that it
 *    is wrong, so we tell them how much we trust it ourselves.
 *
 * The breakdown is one click away, not buried. "Auditable" is a claim this
 * project makes, and a claim nobody can check is worth nothing.
 */
import { CheckCircle2, AlertTriangle, RotateCcw, Save, EyeOff } from 'lucide-react';
import type { CVDProfile } from '@/core/contracts/types';
import { describeType, severityLabel, typeLabel, type CalibrationOutcome } from '../lib/calibration';

interface Props {
  outcome: CalibrationOutcome;
  saving: boolean;
  error: string | null;
  onSave: (profile: CVDProfile) => void;
  onRestart: () => void;
}

const LOW_CONFIDENCE = 0.5;

/** The three axes, named for someone who has never heard the words. */
const AXIS_NAME: Record<string, string> = {
  protan: 'the red axis',
  deutan: 'the green axis',
  tritan: 'the blue axis',
};

export function CalibrationResult({ outcome, saving, error, onSave, onRestart }: Props) {
  const { profile, detail, measurable } = outcome;
  const failed = detail.axes.filter((a) => !a.converged || a.saturated);
  const lowConfidence = profile.confidence < LOW_CONFIDENCE;
  const pct = Math.round(profile.confidence * 100);
  const meaning = describeType(profile.type);

  /**
   * 🎬 THE REFUSAL. Not an error screen: the hardest feature in the product and
   *    the one no competitor will have. If the staircases did not converge we
   *    measured nothing, and handing over a diagnosis anyway would be exactly
   *    the failure we exist to prevent — the user cannot detect that we made
   *    it up.
   */
  if (!measurable) {
    return (
      <section
        aria-labelledby="no-measurement"
        className="rounded-xl border-2 border-slate-800 bg-slate-50 p-6 text-center"
      >
        <EyeOff className="mx-auto mb-3 text-slate-800" size={32} aria-hidden />
        <h2 id="no-measurement" className="text-lg font-bold text-slate-900">
          I could not measure it
        </h2>
        <p className="mt-2 text-slate-700">
          Your answers never settled, so any result I gave you now would be invented.
          I would rather give you nothing.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          This usually happens when rushing, or with glare on the screen. Take your
          time — and if you genuinely cannot tell them apart, use the &ldquo;they all
          look the same to me&rdquo; button instead of picking at random. That answer
          helps us.
        </p>

        {/*
          ⚠️ A REFUSAL THAT CANNOT BE ACTED ON TEACHES NOBODY ANYTHING. This
          screen said only "I could not measure it", and a tester with normal
          colour vision hit it repeatedly — neither they nor I could say which
          of the three staircases gave up, so neither of us could do anything
          about it. Naming the axis turns a dead end into an instruction.
        */}
        {failed.length > 0 && (
          <div className="mt-4 rounded-lg border-2 border-slate-300 p-3 text-left">
            <p className="text-sm font-semibold text-slate-900">Where it stalled</p>
            <ul className="mt-1.5 space-y-1">
              {failed.map((a) => (
                <li key={a.axis} className="text-sm text-slate-700">
                  · <strong>{AXIS_NAME[a.axis] ?? a.axis}</strong> —{' '}
                  {a.saturated
                    ? 'even the strongest difference this screen can show was not called apart. If that surprises you, the screen brightness or a glare on it is the usual reason.'
                    : `your answers never settled after ${a.trials} comparisons.`}
                </li>
              ))}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={onRestart}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          <RotateCcw size={18} aria-hidden />
          Take the test again
        </button>
      </section>
    );
  }

  return (
    <section aria-labelledby="result">
      <h2 id="result" className="text-xl font-bold">
        Your result
      </h2>

      {/* Verdict: icon + text + border. Colour carries no meaning here. */}
      <div className="mt-4 rounded-xl border-2 border-slate-900 p-5">
        <div className="flex items-start gap-3">
          {profile.type === 'normal' ? (
            <CheckCircle2 className="mt-0.5 shrink-0 text-slate-900" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 shrink-0 text-slate-900" aria-hidden />
          )}
          <div>
            <p className="text-lg font-bold text-slate-900">{typeLabel(profile.type)}</p>
            {profile.type !== 'normal' && (
              <p className="mt-1 text-slate-700">
                Severity <strong>{severityLabel(profile.severity)}</strong> ({profile.severity.toFixed(2)} of 1)
              </p>
            )}
          </div>
        </div>

        {/*
          ⚠️ WHAT IT MEANS, NOT JUST WHAT IT IS CALLED. "Deutan — green axis"
          is precise and says nothing to someone reading it for the first time,
          and for many people this screen IS the first time: over half the
          people this product is for are mild deuteranomals who were never
          diagnosed, because their variant darkens nothing.
        */}
        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
          <p className="text-slate-800">{meaning.what}</p>
          <p className="text-sm text-slate-600">{meaning.everyday}</p>
          <p className="text-sm text-slate-700">
            <strong>Here:</strong> {meaning.inApp}
          </p>
        </div>
      </div>

      {/* Confidence: number + bar + sentence. Three channels. */}
      <div className="mt-4 rounded-xl border-2 border-slate-300 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-700">Test confidence</span>
          <span className="text-sm font-bold text-slate-900">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Test confidence"
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
        >
          <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
        </div>
        {lowConfidence && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-slate-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              The two halves of the test do not quite agree. <strong>It is worth taking
              again</strong> in good light and without rushing: everything the app tells
              you afterwards rests on this number.
            </span>
          </p>
        )}
      </div>

      <details className="mt-4 rounded-xl border-2 border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">
          How we got to this
        </summary>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-600">Thresholds · axis indicated</dt>
          <dd className="font-medium text-slate-900">{typeLabel(detail.typeFromThresholds)}</dd>
          <dt className="text-slate-600">Thresholds · severity</dt>
          <dd className="font-medium text-slate-900">{detail.severityFromThresholds.toFixed(2)}</dd>
          <dt className="text-slate-600">Difference between axes</dt>
          <dd className="font-medium text-slate-900">{detail.ratio.toFixed(2)}×</dd>
          <dt className="text-slate-600">Strength of evidence</dt>
          <dd className="font-medium text-slate-900">{Math.round(detail.evidence * 100)}%</dd>
          <dt className="text-slate-600">Arrangement · axis indicated</dt>
          <dd className="font-medium text-slate-900">{typeLabel(detail.typeFromArrangement)}</dd>
          <dt className="text-slate-600">Agreement between the two halves</dt>
          <dd className="font-medium text-slate-900">{Math.round(detail.agreement * 100)}%</dd>
          <dt className="text-slate-600">Consistency of your answers</dt>
          <dd className="font-medium text-slate-900">{Math.round(detail.consistency * 100)}%</dd>
          <dt className="text-slate-600">Arrangement error index</dt>
          <dd className="font-medium text-slate-900">{detail.errorIndex.toFixed(2)}×</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-600">
          The arrangement only separates marked deficiencies; the thresholds measure at
          any level. The arrangement finding nothing while the thresholds do is what a
          mild deficiency looks like — not a contradiction.
        </p>
      </details>

      {/* Required on screen. Not fine print: it gets its own block. */}
      <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
        This is not a medical diagnosis and does not replace an eye examination.
      </p>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border-2 border-slate-800 p-3 text-sm text-slate-900">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => onSave(profile)}
          disabled={saving}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          <Save size={18} aria-hidden />
          {saving ? 'Saving…' : 'Save my profile'}
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-slate-300 px-5 py-3 font-semibold text-slate-800"
        >
          <RotateCcw size={18} aria-hidden />
          Take the test again
        </button>
      </div>
    </section>
  );
}
