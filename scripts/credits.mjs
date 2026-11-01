/**
 * How many API units are left on the key in .env.local.
 *
 *     node --env-file=.env.local scripts/credits.mjs   (npm run credits)
 *
 * Free: reading the balance spends nothing. Run it before a demo or a test
 * session — running dry mid-demo is the most likely way this app fails in front
 * of someone, and every measurement then stops at once.
 *
 * ⚠️ The balance lives under `/s2s/v1.0/client/credit`, a different version
 *    prefix from every task endpoint (`/s2s/v2.0/…`). `/credit/balance` and its
 *    variants do not exist.
 *
 * Prints amounts and expiry only. The key itself is never printed.
 */
const key = process.env.YOUCAM_API_KEY;
if (!key) {
  console.error('YOUCAM_API_KEY is not set. Put it in .env.local and pass --env-file.');
  process.exit(1);
}

const res = await fetch('https://yce-api-01.makeupar.com/s2s/v1.0/client/credit', {
  headers: { Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`credit check failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const json = await res.json();
const rows = json?.results ?? [];
let total = 0;
for (const r of rows) {
  const amount = typeof r.amount_dec === 'number' ? r.amount_dec : r.amount;
  total += amount ?? 0;
  const expiry = r.expiry ? new Date(r.expiry).toISOString().slice(0, 10) : 'no expiry';
  console.log(`${String(amount).padStart(10)}  ${r.type}  expires ${expiry}`);
}
console.log(`${'─'.repeat(10)}\n${String(Math.round(total * 100) / 100).padStart(10)}  units available`);
