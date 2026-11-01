/**
 * ══════════════════════════════════════════════════════════════════════════
 *  READING A FAILED RESPONSE WITHOUT MAKING THE FAILURE WORSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THIS EXISTS BECAUSE `await res.json()` TURNED A CLEAR FAILURE INTO A
 *     MYSTERY. Every screen read errors that way, which is fine while the
 *     failure comes from our own route handlers — they answer JSON. It is not
 *     fine when the request never reaches them:
 *
 *       · Vercel rejects a body over ~4.5 MB with `text/plain`
 *         "Request Entity Too Large";
 *       · a function that runs past its limit returns an HTML gateway page;
 *       · a network drop mid-response gives an empty body.
 *
 *     In all three, `res.json()` throws a SyntaxError, the catch block shows
 *     its message, and the user reads something like `Unexpected token 'R'`.
 *     A tester reported this as "you take the photo and nothing happens" — the
 *     app HAD failed, loudly, in a language nobody could act on.
 *
 *  ⚠️ THE STATUS IS READ BEFORE THE BODY. A 413 means the same thing whatever
 *     the body says, and it is the one failure a user can actually fix.
 */

export interface ApiError {
  message: string;
  /** Extra sentence about what to do, when there is one worth adding. */
  action?: string;
}

const FALLBACK = 'Something went wrong. Please try again.';

export async function readApiError(res: Response): Promise<ApiError> {
  // Infrastructure failures never carry a useful body, so answer them first.
  if (res.status === 413) {
    return {
      message: 'That photo was too large to send.',
      action:
        'This should not happen — the app shrinks photos before sending them. If it keeps happening, try one taken at a lower resolution.',
    };
  }
  if (res.status === 504 || res.status === 408) {
    return {
      message: 'The measurement took too long and was cut off.',
      action: 'The engine is slow right now rather than broken. Try again in a moment.',
    };
  }
  if (res.status === 502 || res.status === 503) {
    return {
      message: 'The measurement service did not answer.',
      action: 'Try again in a moment.',
    };
  }

  const body = await res.text().catch(() => '');
  if (!body) return { message: FALLBACK };

  try {
    const parsed = JSON.parse(body) as { error?: string; action?: string; detail?: string };
    return {
      message: parsed.error ?? parsed.detail ?? FALLBACK,
      action: parsed.action,
    };
  } catch {
    /**
     * Not JSON. Whatever it is, it was written for a developer — a stack
     * trace, an HTML page, a proxy's plain-text complaint. Showing it to
     * someone trying to photograph a shirt helps nobody, so it goes to the
     * console and they get a sentence.
     */
    console.error('[api] non-JSON error response', res.status, body.slice(0, 300));
    return { message: FALLBACK };
  }
}
