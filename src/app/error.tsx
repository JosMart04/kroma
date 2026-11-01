'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THE USER SEES WHEN SOMETHING THROWS
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THIS EXISTS BECAUSE OF WHAT WAS THERE INSTEAD: Next's own fallback,
 *     "Application error: a client-side exception has occurred (see the browser
 *     console for more information)". It appeared intermittently on entering
 *     the app and on reaching the first calibration step, and reloading always
 *     fixed it — which is the signature of a STALE CHUNK. Every deploy
 *     rewrites the hashed filenames of the JavaScript, and a browser holding
 *     the previous HTML asks for a file that no longer exists. We deployed
 *     about fifteen times in one day.
 *
 *     It will subside on its own once the deploys stop, and that is not good
 *     enough: a judge opening the link mid-deploy would see a console
 *     instruction and a white page.
 *
 *  ── WHY A CHUNK ERROR RELOADS ITSELF, ONCE ──────────────────────────────
 *
 *  A missing chunk is not a bug in the app, it is a version skew, and the cure
 *  is exactly what the user was doing manually. So we do it for them — but only
 *  ONCE per session. A reload loop on a genuinely broken build would be far
 *  worse than an error screen: it would burn battery, hammer the server, and
 *  never let anyone read what went wrong.
 */
import { useEffect } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

const RELOADED_FLAG = 'kroma:reloaded-after-chunk-error';
const RETRIED_FLAG = 'kroma:retried-render';

/** Version skew, rather than anything wrong with the code that is running. */
function isStaleChunk(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\w-]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /error loading dynamically imported module/i.test(text)
  );
}

/**
 * ⚠️ `sessionStorage` THROWS, and not rarely. Samsung Internet with site data
 *    restricted, private windows, and some installed-PWA storage partitions all
 *    make a bare read raise a SecurityError. Throwing inside the error screen
 *    is the one place it must not happen: it would replace a recoverable
 *    failure with an unrecoverable one.
 */
function onceFlag(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
    return true;
  } catch {
    // No storage means no memory of having retried, so we do not retry. An
    // error screen with a working button beats an unbreakable reload loop.
    return false;
  }
}

export default function ErrorScreen({
  error,
  reset,
}: {
  /** Next attaches a `digest` in production — the handle for a server error. */
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = error.digest;
  useEffect(() => {
    console.error('[kroma] render error', error);

    /**
     * ⚠️ RECOVER BEFORE COMPLAINING. This screen is now appearing on entry for
     *    real testers, and an error screen is a KO in front of a judge even
     *    when a button fixes it. So the first response to ANY error is to
     *    re-render the segment — free, instant, no network — and only if that
     *    fails does anyone see this.
     *
     *    Once per session, guarded by a flag that survives a reload: retrying
     *    forever on a genuinely broken build would spin the phone and never let
     *    anybody read what went wrong.
     */
    if (onceFlag(RETRIED_FLAG)) {
      reset();
      return;
    }
    // A missing chunk is a version skew rather than a bug, and a reload is
    // exactly what the user was doing by hand.
    if (isStaleChunk(error) && onceFlag(RELOADED_FLAG)) window.location.reload();
  }, [error, reset]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-xl border-2 border-slate-800 p-6">
        <TriangleAlert size={28} className="text-slate-800" aria-hidden />
        <h1 className="mt-3 text-xl font-bold text-slate-900">That screen did not load</h1>
        <p className="mt-2 text-slate-700">
          Something went wrong on our side, not on yours. Nothing you have measured is
          lost — your profile, your wardrobe and your colour portrait live on this device
          and are still there.
        </p>
        <button
          onClick={reset}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
        >
          <RefreshCw size={18} aria-hidden />
          Try again
        </button>

        {/*
          ⚠️ COLLAPSED, BUT PRESENT. A phone has no console anyone will open, so
          an error nobody can name is an error nobody can fix — this screen was
          reported three times with no way to say what it said. It stays shut by
          default: someone trying to photograph a shirt does not need a stack
          trace, and someone reporting a bug needs exactly one.
        */}
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Technical detail
          </summary>
          <p className="mt-2 break-words rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-700">
            {error.name}: {error.message}
            {digest && ` · digest ${digest}`}
          </p>
        </details>
      </div>
    </main>
  );
}
