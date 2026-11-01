/**
 * Confidence notice, and THE REFUSAL SCREEN.
 *
 * 🎬 `refuse` is not an error. It is the hardest feature in the product and the
 *    one no competitor will have. A person with colour vision deficiency cannot
 *    check whether the system is lying to them, so the honesty has to be built
 *    in rather than promised in a README — which means being able to say "I
 *    cannot tell in this light" and stop.
 *
 *    This screen deserves its own moment in the demo.
 */
import { Info, EyeOff } from 'lucide-react';
import type { MeasurementConfidence } from '@/core/contracts/types';

export function ConfidenceBanner({
  confidence,
  onRetry,
  /**
   * Not every refusal is about light. A garment we could not separate from the
   * surface it is lying on is a framing problem, and heading it "I can't tell in
   * this light" would send the user off to fix the wrong thing.
   */
  refusalTitle,
}: {
  confidence: MeasurementConfidence;
  onRetry?: () => void;
  refusalTitle?: string;
}) {
  if (confidence.level === 'measured') return null;

  if (confidence.level === 'refuse') {
    return (
      <div
        role="alert"
        className="rounded-xl border-2 border-slate-800 bg-slate-50 p-6 text-center"
      >
        <EyeOff className="mx-auto mb-3 text-slate-800" size={32} aria-hidden />
        <h2 className="text-lg font-bold text-slate-900">
          {refusalTitle ?? 'I can’t tell in this light'}
        </h2>
        <p className="mt-2 text-slate-700">
          {confidence.reason ??
            'The lighting will not let me measure this colour reliably, and I would rather give you nothing than a number I do not trust.'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 min-h-11 rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white"
          >
            Try again with better light
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3"
    >
      <Info size={18} className="mt-0.5 shrink-0 text-slate-700" aria-hidden />
      <p className="text-sm text-slate-800">
        {confidence.reason ?? 'The light was not ideal, so treat this colour as approximate.'}
      </p>
    </div>
  );
}
