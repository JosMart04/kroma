/**
 * A time budget for one incoming request, visible to every YouCam call it makes.
 *
 * ⚠️ WHY THIS EXISTS: THE POLL USED TO OUTLIVE THE FUNCTION.
 *
 * Vercel's free plan kills a route at 60 s. The polling ceilings in
 * `config.ts` are 120–240 s, so a slow task was cut off by the platform
 * mid-poll — no `PollTimeout`, no taskId in the log, and the unit possibly
 * already spent on a result nobody would ever collect. The poll had no idea how
 * much of the request was left, because nothing told it.
 *
 * Now each route runs inside `withBudget(…)`, and `pollTask` gives up early
 * enough to log the taskId and return a readable error while the function is
 * still alive.
 *
 * `AsyncLocalStorage` rather than an argument threaded through every client
 * method: the budget belongs to the request, and a route that forgets to pass it
 * down should not silently lose it.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage<{ deadline: number }>();

/**
 * The default for a route handler: under Vercel's 60 s ceiling with enough
 * room to log, encode and answer after the last poll gives up.
 */
export const ROUTE_BUDGET_MS = 55_000;

/** How long before the budget ends a poll must stop, to leave time to answer. */
export const ANSWER_MARGIN_MS = 4_000;

/** Run `fn` with a time budget every nested YouCam call can see. */
export function withBudget<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return store.run({ deadline: Date.now() + ms }, fn);
}

/** Milliseconds left in the current request's budget, or `Infinity` outside one. */
export function remainingBudget(): number {
  const ctx = store.getStore();
  return ctx ? ctx.deadline - Date.now() : Infinity;
}
