/**
 * Dumps the real unit cost of every feature to docs/submission/feature-cost.json
 *
 *     node --env-file=.env.local scripts/feature-cost.mjs   (npm run cost)
 *
 * 💡 DO NOT ESTIMATE COST: MEASURE IT. It is free — reading the price list
 *    spends no units.
 *
 * ⚠️ THE ENDPOINT IS PAGINATED, 20 SKUs PER PAGE AT MOST. Reading only the first
 *    page returns a plausible, complete-looking list that happens to contain
 *    none of the Skin AI or try-on SKUs, which sort later. Every page is
 *    followed via `next_token` until it comes back null.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.YOUCAM_API_KEY;
if (!key) {
  console.error('YOUCAM_API_KEY is not set. Put it in .env.local and pass --env-file.');
  process.exit(1);
}

const BASE = 'https://yce-api-01.makeupar.com/s2s/v2.0/credit/feature-cost';
const skus = [];
let token = null;
let pages = 0;

do {
  const url = new URL(BASE);
  url.searchParams.set('page_size', '20');
  if (token) url.searchParams.set('starting_token', token);

  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`feature-cost failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const json = await res.json();
  skus.push(...(json?.result?.skus ?? []));
  token = json?.result?.next_token ?? null;
  pages++;
} while (token && pages < 50);

const out = {
  fetchedAt: new Date().toISOString(),
  pages,
  count: skus.length,
  skus,
};

mkdirSync('docs/submission', { recursive: true });
writeFileSync('docs/submission/feature-cost.json', JSON.stringify(out, null, 2) + '\n');

console.log(`→ docs/submission/feature-cost.json · ${skus.length} SKUs over ${pages} page(s)\n`);
for (const s of skus) {
  const path = (s.run_task_url ?? '').replace('https://yce-api-01.makeupar.com', '');
  console.log(`${String(s.amount).padStart(5)} / ${s.proc_unit ?? 1} ${s.unit}  ${s.description}  ${path}`);
}
