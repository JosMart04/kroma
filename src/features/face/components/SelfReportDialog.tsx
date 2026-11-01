'use client';

/**
 * Secondary path: "I already know my diagnosis".
 *
 * ⚠️ NEVER the opening question, and where this button sits on the screen is
 *    part of the design, not a detail. More than half our users are mild
 *    deuteranomals who have never been diagnosed: asking them up front what
 *    they have is asking for the very answer they came here to get.
 *
 *    But someone who DOES have a clinical diagnosis holds better information
 *    than our test, and forcing them through it would be treating them as if
 *    they did not. Hence this path — and hence it is recorded as
 *    `source: 'self_reported'` instead of being mixed in with what we measured.
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import type { CVDType } from '@/core/contracts/types';
import { severityLabel } from '../lib/calibration';

interface Props {
  onConfirm: (type: CVDType, severity: number) => void;
  onCancel: () => void;
}

const OPTIONS: { value: CVDType; label: string; hint: string }[] = [
  { value: 'deutan', label: 'Deutan', hint: 'Deuteranomaly or deuteranopia · green axis' },
  { value: 'protan', label: 'Protan', hint: 'Protanomaly or protanopia · red axis' },
  { value: 'tritan', label: 'Tritan', hint: 'Tritanomaly or tritanopia · blue axis' },
  { value: 'normal', label: 'None', hint: 'Normal colour vision' },
];

export function SelfReportDialog({ onConfirm, onCancel }: Props) {
  const [type, setType] = useState<CVDType>('deutan');
  const [severity, setSeverity] = useState(0.6);

  return (
    <section aria-labelledby="self-report" className="rounded-xl border-2 border-slate-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 id="self-report" className="text-xl font-bold">
          Enter your diagnosis
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close and go back to the test"
          className="rounded-lg border-2 border-slate-300 p-1.5 text-slate-700"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-semibold text-slate-700">Type</legend>
        <div className="mt-2 space-y-2">
          {OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border-2 border-slate-300 p-3 has-[:checked]:border-slate-900"
            >
              <input
                type="radio"
                name="cvd-type"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => setType(opt.value)}
                className="mt-1"
              />
              <span>
                <span className="block font-semibold text-slate-900">{opt.label}</span>
                <span className="block text-sm text-slate-600">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {type !== 'normal' && (
        <div className="mt-5">
          <label htmlFor="severity" className="text-sm font-semibold text-slate-700">
            Severity: <strong>{severityLabel(severity)}</strong> ({severity.toFixed(1)} of 1)
          </label>
          <input
            id="severity"
            type="range"
            min={0.1}
            max={1}
            step={0.1}
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="mt-2 w-full"
          />
          <p className="mt-1 text-sm text-slate-600">
            If you are not sure, leave it in the middle and take the test when you can.
            Severity changes a great deal of what the app tells you afterwards.
          </p>
        </div>
      )}

      <p className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
        This is not a medical diagnosis and does not replace an eye examination.
      </p>

      <button
        type="button"
        onClick={() => onConfirm(type, severity)}
        className="mt-5 w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white"
      >
        Save my profile
      </button>
    </section>
  );
}
