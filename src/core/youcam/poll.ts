/**
 * Polling of asynchronous tasks.
 * ⛔ OWNER: core. Everyone consumes it. Nobody reimplements it.
 */
import { YOUCAM_BASE_URL, POLL_POLICY } from './config';
import { YouCamError, PollTimeout } from './errors';
import { remainingBudget, ANSWER_MARGIN_MS } from './budget';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * How long to wait after a 429, honouring `Retry-After` when the server sends
 * one (seconds or an HTTP date), with a sane fallback when it does not.
 */
export function retryAfterMs(res: Response, fallback: number): number {
  const header = res.headers.get('retry-after');
  if (!header) return fallback;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallback;
}

/**
 * ⚠️ TRAP 2: POLLING IS MANDATORY, AND ABANDONING IT IS STILL BILLED.
 *
 * A task expires if it is not polled within its retention window, EVEN when
 * the engine finished it successfully. A later query returns `InvalidTaskId`
 * and **the units are consumed anyway**.
 *
 * ⚠️ THE DOCS DISAGREE ON THAT WINDOW: the retention page says a task_id
 *    stays valid for 30 days, the task API says 24 hours. We assume the
 *    shorter one.
 *
 * Practical consequence: never abandon a poll silently. When it gives up, log
 * the taskId — the unit is already committed and the result may still be
 * retrievable for a while.
 *
 * While a task is `running` nothing is consumed, and a task that ends in
 * `error` is not charged either.
 *
 * ⚠️ IT STOPS AT THE REQUEST'S BUDGET, NOT ONLY AT THE POLICY CEILING. See
 *    `budget.ts`: on Vercel the platform kills the function first otherwise.
 */
export async function pollTask<T = unknown>(
  endpointPath: string,
  taskId: string,
  policyKey: keyof typeof POLL_POLICY | string = 'default',
  apiKey = process.env.YOUCAM_API_KEY,
): Promise<T> {
  const p = POLL_POLICY[policyKey] ?? POLL_POLICY.default;
  let wait = p.first;
  const started = Date.now();
  const deadline = started + Math.min(p.deadlineMs, remainingBudget() - ANSWER_MARGIN_MS);

  while (Date.now() < deadline) {
    const res = await fetch(`${YOUCAM_BASE_URL}${endpointPath}/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });

    /**
     * A 429 on a poll is not a task failure: the task keeps running on their
     * side. Back off and ask again rather than reporting an error for work that
     * may already have succeeded (and been billed).
     */
    if (res.status === 429) {
      await sleep(Math.min(retryAfterMs(res, wait), Math.max(0, deadline - Date.now())));
      wait = Math.min(wait * p.factor, p.max);
      continue;
    }

    const json = await res.json().catch(() => null);
    const status = json?.data?.task_status;

    if (status === 'success') return json.data as T;
    if (status === 'error') {
      throw new YouCamError(
        json?.data?.error ?? 'unknown_internal_error',
        endpointPath,
        taskId,
        typeof json?.data?.error_message === 'string'
          ? json.data.error_message
          : JSON.stringify(json?.data)?.slice(0, 300),
      );
    }
    // A task the server no longer knows about will never finish. Stop polling.
    if (json?.error_code === 'InvalidTaskId') {
      throw new YouCamError('InvalidTaskId', endpointPath, taskId, json?.error);
    }

    await sleep(Math.min(wait, Math.max(0, deadline - Date.now())));
    wait = Math.min(wait * p.factor, p.max);
  }

  // Never fail silently: the unit is already committed.
  throw new PollTimeout(endpointPath, taskId);
}

/**
 * ⚠️ TRAP 3: THE RESULT URL LIVES TWO HOURS.
 *
 * Storing the URL is storing a link that will be dead before anyone opens it.
 * The docs allow fetching a fresh link from the task_id, but only within the
 * task's retention window — so it is not a safety net either.
 *
 * RULE: the moment a task returns `success`, download the binary and keep it in
 * OUR storage. Not later.
 */
export async function downloadResult(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Could not download the result (${res.status}). ` +
        `Remember: the URL expires after 2 hours. Download as soon as the task succeeds.`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}
