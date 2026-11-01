'use client';

/**
 * F1 · Calibration state machine.
 *
 * intro → arrangement → threshold → result.  Secondary path: self-report.
 */
import { useEffect, useState } from 'react';
import { Eye, ClipboardCheck } from 'lucide-react';
import type { CVDProfile, CVDType } from '@/core/contracts/types';
import { saveProfile } from '@/core/db';
import { CAPS } from '../lib/caps';
import { scoreArrangement, type ArrangementResult } from '../lib/arrangement';
import {
  advanceSet,
  buildTrial,
  createStaircaseSet,
  readSet,
  type StaircaseSet,
  type Trial,
} from '../lib/threshold';
import {
  buildProfile,
  selfReportedProfile,
  type CalibrationOutcome,
} from '../lib/calibration';
import { CapChain } from './CapChain';
import { NeutralStaircase } from './NeutralStaircase';
import { CalibrationResult } from './CalibrationResult';
import { SelfReportDialog } from './SelfReportDialog';

type Stage = 'intro' | 'arrange' | 'threshold' | 'result' | 'selfreport';

export function CalibrationFlow() {
  const [stage, setStage] = useState<Stage>('intro');
  const [chain, setChain] = useState<number[]>([0]);
  const [arrangement, setArrangement] = useState<ArrangementResult | null>(null);
  const [staircases, setStaircases] = useState<StaircaseSet | null>(null);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [outcome, setOutcome] = useState<CalibrationOutcome | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Development-only test hook: exposes the current trial so the test can be
   * driven from the browser without depending on the painted colours.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __cbfTrial?: Trial | null }).__cbfTrial = trial;
  }, [trial]);

  function restart() {
    setChain([0]);
    setArrangement(null);
    setStaircases(null);
    setTrial(null);
    setOutcome(null);
    setSaved(false);
    setError(null);
    setStage('arrange');
  }

  function pick(capIndex: number) {
    const next = [...chain, capIndex];
    setChain(next);
    if (next.length < CAPS.length) return;

    // Arrangement complete. Score it and move on to measuring all three axes:
    // stage A does not choose where to measure, because below severity 0.9 it
    // sees nothing and would send us to the wrong axis.
    const result = scoreArrangement(next);
    const initial = createStaircaseSet();
    setArrangement(result);
    setStaircases(initial);
    setTrial(buildTrial(initial));
    setStage('threshold');
  }

  function answer(correct: boolean) {
    if (!staircases || !arrangement) return;
    const next = advanceSet(staircases, correct);
    setStaircases(next);


    if (!next.done) {
      setTrial(buildTrial(next));
      return;
    }
    setOutcome(buildProfile({ arrangement, thresholds: readSet(next) }));
    setStage('result');
  }

  async function save(profile: CVDProfile) {
    setSaving(true);
    setError(null);
    try {
      await saveProfile(profile);
      setSaved(true);
    } catch (e) {
      setError(
        `Could not save your profile: ${
          e instanceof Error ? e.message : 'unknown error'
        }. If you are in private browsing, your browser may be blocking storage.`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveSelfReport(type: CVDType, severity: number) {
    await save(selfReportedProfile(type, severity));
    setStage('result');
    setOutcome({
      profile: selfReportedProfile(type, severity),
      // A self-report is not a measurement, but it IS valid information the
      // user supplied about themselves, so the result screen shows it.
      measurable: true,
      detail: {
        typeFromArrangement: type,
        severityFromArrangement: severity,
        typeFromThresholds: type,
        severityFromThresholds: severity,
        ratio: 1,
        boundary: 1,
        agreement: 1,
        evidence: 1,
        consistency: 1,
        // Nothing stalled because nothing was measured: the user told us.
        axes: [],
        errorIndex: 1,
      },
    });
  }

  if (saved && outcome) {
    return (
      <div className="rounded-xl border-2 border-slate-900 p-6">
        <ClipboardCheck className="mb-3 text-slate-900" size={28} aria-hidden />
        <h2 className="text-xl font-bold">Profile saved</h2>
        <p className="mt-2 text-slate-700">
          From now on everything this app tells you — the colours of your face, what
          goes with what — is computed against this profile.
        </p>
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          This is not a medical diagnosis and does not replace an eye examination.
        </p>
        <button
          type="button"
          onClick={restart}
          className="mt-5 rounded-lg border-2 border-slate-300 px-5 py-2.5 font-semibold text-slate-800"
        >
          Calibrate again
        </button>
      </div>
    );
  }

  return (
    <div>
      {stage === 'intro' && (
        <section aria-labelledby="intro">
          <Eye className="mb-3 text-slate-900" size={28} aria-hidden />
          <h2 id="intro" className="text-xl font-bold">
            Let us measure how you see colour
          </h2>
          <p className="mt-3 text-slate-700">
            We are not going to ask which kind of colour blindness you have. We measure
            it: two steps, about two minutes.
          </p>
          <ol className="mt-4 space-y-2 text-slate-700">
            <li className="flex gap-2">
              <span className="font-bold">1.</span>
              <span>You put some colour swatches in order of similarity.</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold">2.</span>
              <span>You find the odd square out of four, several times over.</span>
            </li>
          </ol>
          <p className="mt-4 text-sm text-slate-600">
            Do it in the light you normally use, without rushing. There are no right
            answers — what we want to know is how you see.
          </p>
          <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
            This is not a medical diagnosis and does not replace an eye examination.
          </p>

          <button
            type="button"
            onClick={() => setStage('arrange')}
            className="mt-6 w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            Start the test
          </button>
          <button
            type="button"
            onClick={() => setStage('selfreport')}
            className="mt-3 w-full rounded-lg border-2 border-slate-300 px-5 py-3 font-semibold text-slate-800"
          >
            I already know my diagnosis
          </button>
        </section>
      )}

      {stage === 'arrange' && (
        <CapChain
          chain={chain}
          onPick={pick}
          onUndo={() => setChain((c) => (c.length > 1 ? c.slice(0, -1) : c))}
        />
      )}

      {stage === 'threshold' && staircases && trial && (
        <NeutralStaircase set={staircases} trial={trial} onAnswer={answer} />
      )}

      {stage === 'result' && outcome && (
        <CalibrationResult
          outcome={outcome}
          saving={saving}
          error={error}
          onSave={save}
          onRestart={restart}
        />
      )}

      {stage === 'selfreport' && (
        <SelfReportDialog
          onConfirm={saveSelfReport}
          onCancel={() => setStage('intro')}
        />
      )}

    </div>
  );
}
