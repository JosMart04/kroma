'use client';
/**
 * Local data status and "start over".
 *
 * Everything KROMA knows lives in this browser: the profile, the colour
 * portrait and the wardrobe. There is no account and no server copy, so this is
 * the only way to wipe it — and the only way to run the experience a second
 * time from scratch.
 *
 * 🔤 ACCESSIBILITY: meaning travels in ICON + TEXT. Colour is decoration. We
 *    build for people who do not perceive it well; a state that can only be
 *    told apart by green/amber/red is a state our own user never receives.
 */
import { useCallback, useEffect, useState } from 'react';
import { Database, RotateCcw, Check, TriangleAlert, Loader } from 'lucide-react';
import { getProfile, getPortrait, listGarments, resetAll } from '@/core/db';

interface Snapshot {
  hasProfile: boolean;
  hasPortrait: boolean;
  garments: number;
}

type Phase = 'loading' | 'ready' | 'confirming' | 'working' | 'done' | 'error';

export function ResetButton() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');

  const read = useCallback(async () => {
    const [profile, portrait, garments] = await Promise.all([
      getProfile(),
      getPortrait(),
      listGarments(),
    ]);
    setSnapshot({
      hasProfile: profile !== null,
      hasPortrait: portrait !== null,
      garments: garments.length,
    });
  }, []);

  useEffect(() => {
    let alive = true;
    read()
      .then(() => alive && setPhase('ready'))
      .catch((e) => {
        console.error('[core/db] Could not read local storage:', e);
        if (alive) setPhase('error');
      });
    return () => {
      alive = false;
    };
  }, [read]);

  async function handleReset() {
    setPhase('working');
    try {
      await resetAll();
      await read();
      setPhase('done');
    } catch (e) {
      console.error('[core/db] Reset failed:', e);
      setPhase('error');
    }
  }

  const nothingStored =
    snapshot && !snapshot.hasProfile && !snapshot.hasPortrait && snapshot.garments === 0;

  return (
    <section
      aria-labelledby="local-data"
      className="rounded-xl border-2 border-dashed border-slate-400 p-4"
    >
      <h2
        id="local-data"
        className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"
      >
        <Database size={16} aria-hidden />
        Your data, on this device
      </h2>

      <p className="mt-2 text-sm text-slate-700" aria-live="polite">
        {phase === 'loading' && 'Checking local storage…'}
        {phase === 'error' && 'This browser is blocking local storage, so nothing can be saved.'}
        {phase !== 'loading' && phase !== 'error' && snapshot && (
          <>
            {snapshot.hasProfile ? 'Vision profile measured' : 'No vision profile yet'}
            {' · '}
            {snapshot.hasPortrait ? 'colour portrait measured' : 'no colour portrait yet'}
            {' · '}
            <strong>
              {snapshot.garments} {snapshot.garments === 1 ? 'garment' : 'garments'}
            </strong>
          </>
        )}
      </p>

      <p className="mt-1 text-xs text-slate-600">
        Nothing leaves this device and there is no account. Clearing your browser data
        clears KROMA too.
      </p>

      {phase === 'confirming' ? (
        <div className="mt-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-slate-900">
            <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              This erases your profile, your colour portrait and every garment you have
              measured. It cannot be undone. Continue?
            </span>
          </p>
          <div className="mt-3 flex gap-2">
            {/* min-h-11 = 44px, the minimum touch target. Used phone in hand. */}
            <button
              onClick={handleReset}
              className="min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Yes, erase everything
            </button>
            <button
              onClick={() => setPhase('ready')}
              className="min-h-11 rounded-lg border-2 border-slate-400 px-4 py-2 text-sm font-semibold text-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setPhase('confirming')}
          disabled={phase === 'loading' || phase === 'working' || !!nothingStored}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-slate-900 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-40"
        >
          {phase === 'working' ? (
            <>
              <Loader size={16} className="animate-spin" aria-hidden />
              Erasing…
            </>
          ) : phase === 'done' ? (
            <>
              <Check size={16} aria-hidden />
              Erased — start over
            </>
          ) : (
            <>
              <RotateCcw size={16} aria-hidden />
              Start over
            </>
          )}
        </button>
      )}

      {phase === 'done' && (
        <p
          role="status"
          className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900"
        >
          <Check size={16} aria-hidden />
          Done. KROMA knows nothing about you again.
        </p>
      )}
    </section>
  );
}
