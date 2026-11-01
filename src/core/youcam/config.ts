/** ⛔ OWNER: core. Verified API configuration and constants. */

export const YOUCAM_BASE_URL =
  process.env.YOUCAM_BASE_URL ?? 'https://yce-api-01.makeupar.com';

export const IS_MOCK = process.env.YOUCAM_MOCK !== 'false';

/**
 * ⚠️ EVERY PATH HERE WAS CHECKED AGAINST THE LIVE API, not only the docs.
 *    Re-verified 31 Oct 2026 against the paginated `/credit/feature-cost`
 *    list, whose `run_task_url` field names the real endpoint of every SKU —
 *    the most reliable route map the platform publishes.
 *
 * ⚠️ `cloth-v4`, NOT `cloth`. The three generations live side by side and the
 *    old one answers too, so the mistake is silent:
 *      /task/cloth     → V2.0 engine (old)
 *      /task/cloth-v3  → V3.0 engine
 *      /task/cloth-v4  → V4.0 engine  ← THIS ONE (`auto`, `outer`, multi-person filter)
 */
export const ENDPOINTS = {
  file: '/s2s/v2.0/file',
  featureCost: '/s2s/v2.0/credit/feature-cost',
  /**
   * ⚠️ A DIFFERENT VERSION PREFIX FROM EVERYTHING ELSE. The balance lives under
   *    `/s2s/v1.0/client/credit`; `/s2s/v2.0/credit/balance` and its variants
   *    are 404s.
   */
  credits: '/s2s/v1.0/client/credit',
  deleteTask: '/s2s/v2.0/task/delete',

  fitzpatrick: '/s2s/v2.0/task/fitzpatrick-scale-analyzer',
  skinTone: '/s2s/v2.0/task/skin-tone-analysis',
  skinAnalysis: '/s2s/v2.1/task/skin-analysis',
  cloth: '/s2s/v2.0/task/cloth-v4',
  scarf: '/s2s/v2.0/task/scarf',
  hat: '/s2s/v2.0/task/hat',
  /**
   * F16. The path is `makeup-vto`; `/task/makeup` is a 404. Same `effects`
   * payload as the MCP tool, 1 unit per render.
   */
  makeupVto: '/s2s/v2.0/task/makeup-vto',

  /**
   * The short names are the real ones. `lighting` normalises the light BEFORE a
   * face is measured — the basis of the confidence layer (F4) — so a wrong path
   * here would silently disable the product's central check.
   */
  lighting: '/s2s/v2.0/task/lighting',
  bgRemoval: '/s2s/v2.0/task/sod',
} as const;

export type FeatureKey = keyof typeof ENDPOINTS;

/**
 * Polling policy per endpoint.
 *
 * ⚠️ `max` STAYS AT 10 s. The reference recommends polling "every 10 seconds"
 *    when webhooks are not in use, and the rate limit is shared by every user
 *    of the deployment (see `RATE_LIMIT`), so a tight loop on one request eats
 *    into everyone else's budget. The first interval is short because most
 *    face tasks finish in a few seconds.
 *
 * ⚠️ `deadlineMs` IS A CEILING, NOT THE DEADLINE. The real one is the request's
 *    remaining time budget (`budget.ts`), which is always shorter on Vercel:
 *    a poll that outlives the function is killed without logging its taskId,
 *    and the unit may already be spent.
 */
export const POLL_POLICY: Record<string, { first: number; factor: number; max: number; deadlineMs: number }> = {
  default:        { first: 2000, factor: 1.6, max: 10000, deadlineMs: 180_000 },
  skinAnalysis:   { first: 3000, factor: 1.5, max: 10000, deadlineMs: 120_000 },
  cloth:          { first: 2000, factor: 1.6, max: 10000, deadlineMs: 240_000 },
};

/**
 * ⚠️ 250 requests / 300 s PER IP **and** PER TOKEN, both at once.
 *
 * The token limit is the one that bites in production: every visitor of the
 * deployment shares the same server-side key, so this budget is global, not
 * per user. Every poll is a request. A 429 is retried with backoff in
 * `client.ts`/`poll.ts` and surfaces as `RateLimited` if it persists.
 */
export const RATE_LIMIT = { requests: 250, windowSeconds: 300, recommendedQps: 5 } as const;

/** ⚠️ The result download URL EXPIRES AFTER 2 HOURS. Download, never store the link. */
export const RESULT_URL_TTL_MS = 2 * 60 * 60 * 1000;
