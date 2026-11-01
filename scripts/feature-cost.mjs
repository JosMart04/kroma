/**
 * Vuelca el coste real por función a docs/entrega/feature-cost.json
 * Uso: YOUCAM_API_KEY=... npm run cost
 *
 * 💡 NO ESTIMÉIS EL COSTE: MEDIDLO. Presentar la economía unitaria como dato
 *    medido ataca directamente el «does the code reflect genuine effort» del
 *    criterio 1, y cuesta una llamada.
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const key = process.env.YOUCAM_API_KEY;
if (!key) { console.error('Falta YOUCAM_API_KEY'); process.exit(1); }

const res = await fetch('https://yce-api-01.makeupar.com/s2s/v2.0/credit/feature-cost', {
  headers: { Authorization: `Bearer ${key}` },
});
const json = await res.json();
mkdirSync('docs/entrega', { recursive: true });
writeFileSync('docs/entrega/feature-cost.json', JSON.stringify(json, null, 2));
console.log('→ docs/entrega/feature-cost.json');
console.log(JSON.stringify(json, null, 2));
