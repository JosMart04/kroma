/**
 * ══════════════════════════════════════════════════════════════════════════
 *  TRANSCRIPTOR DE LAS MATRICES DE MACHADO 2009
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⛔ PROPIETARIO: P1.
 *
 *  POR QUÉ EXISTE ESTE SCRIPT Y NO SE COPIARON LOS NÚMEROS A MANO:
 *
 *  Son 297 flotantes. Copiarlos a mano —o peor, dictarlos desde la memoria de
 *  un modelo de lenguaje— es exactamente el error que este proyecto existe para
 *  no cometer: nuestro usuario no puede detectar una simulación falsa. Aquí los
 *  números se descargan, se transcriben mecánicamente y queda el SHA256 del
 *  fichero de origen para que cualquiera pueda auditar la cadena entera.
 *
 *  ── DOS MODOS ───────────────────────────────────────────────────────────
 *
 *    node scripts/gen-matrices.mjs           genera (npm run gen:matrices)
 *    node scripts/gen-matrices.mjs --check   verifica, SIN RED
 *
 *  ⚠️ NO SE EJECUTA EN BUILD. Se ejecutó una vez, su salida está commiteada, y
 *     vive aquí solo para poder auditar y regenerar. El día de la entrega no
 *     puede haber una dependencia de red en el camino crítico.
 *
 *  El modo `--check` es el que cierra el agujero de la auditoría: el SHA256 del
 *  origen NO detecta que alguien edite a mano el fichero generado. Por eso se
 *  sella además un checksum de los 297 valores emitidos, que `--check`
 *  recalcula leyendo solo el fichero local. Sin red, apto para CI.
 *
 *  ⚠️ OJO CON LA TRAMPA: cinco líneas por debajo de la tabla correcta, el mismo
 *     fichero de origen define `coblis_v1_matrices`, que es la aproximación web
 *     de los años 2000 que la propia literatura de DaltonLens desaconseja. El
 *     parseo se acota ANTES de ese símbolo y aborta si no encuentra el límite.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/DaltonLens/DaltonLens-Python/master/daltonlens/simulate.py';
const PRIMARY_SOURCE =
  'https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html';

// Anclado al propio script, no al directorio de trabajo: así funciona igual
// tanto con `npm run` desde la raíz como ejecutándolo desde cualquier sitio.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/core/color/matrices.generated.ts');

const EXPECTED_STEPS = 11;
const EXPECTED_FLOATS = 297; // 11 pasos × 3 deficiencias × 9 valores

/** El ÚNICO formato numérico aceptado. Cualquier otro aborta: ver checkTokens. */
const FLOAT_TOKEN = /^-?\d+\.\d+$/;

const DEFICIENCIES = [
  ['protan', 'Deficiency.PROTAN'],
  ['deutan', 'Deficiency.DEUTAN'],
  ['tritan', 'Deficiency.TRITAN'],
];

/** Aborta ruidosamente: más vale no generar nada que generar algo dudoso. */
function abort(msg) {
  console.error(`\n❌ ABORTADO — no se ha escrito nada.\n   ${msg}\n`);
  process.exit(1);
}

/** Checksum canónico de los valores. Es lo que permite verificar sin red. */
function dataChecksum(values) {
  return createHash('sha256').update(values.join(','), 'utf8').digest('hex');
}

/** Extrae los 297 literales del fichero generado, en orden. */
function valuesFromGenerated(ts) {
  const body = ts
    .slice(ts.indexOf('= {'), ts.indexOf('\n};'))
    .replace(/\/\/.*$/gm, ''); // fuera los comentarios "// severidad 0.4"
  return body.match(/-?\d+\.\d+/g) ?? [];
}

// ══════════════════════════════════════════════════════════════════════════
//  MODO --check · sin red, solo lee el fichero local
// ══════════════════════════════════════════════════════════════════════════
if (process.argv.includes('--check')) {
  let ts;
  try {
    ts = readFileSync(OUT, 'utf8');
  } catch {
    abort(`No existe ${OUT}. Genéralo con: npm run gen:matrices`);
  }

  const declared = ts.match(/MACHADO_2009_DATA_SHA256 = '([a-f0-9]{64})'/)?.[1];
  if (!declared) {
    abort(
      'El fichero generado no declara MACHADO_2009_DATA_SHA256. ' +
        'Es de una versión anterior: regenéralo con npm run gen:matrices',
    );
  }

  const values = valuesFromGenerated(ts);
  if (values.length !== EXPECTED_FLOATS) {
    abort(`El fichero generado tiene ${values.length} valores y debería tener ${EXPECTED_FLOATS}.`);
  }

  const actual = dataChecksum(values);
  if (actual !== declared) {
    abort(
      `Los valores de ${OUT} NO cuadran con su propio checksum.\n` +
        `   declarado: ${declared}\n` +
        `   real:      ${actual}\n` +
        `   Alguien ha editado las matrices a mano. Regenera con: npm run gen:matrices`,
    );
  }

  console.log(`✅ Matrices íntegras · ${values.length} valores · ${actual.slice(0, 16)}…`);
  process.exit(0);
}

// ══════════════════════════════════════════════════════════════════════════
//  MODO GENERAR
// ══════════════════════════════════════════════════════════════════════════

// ── 1. Descargar y sellar ────────────────────────────────────────────────
const res = await fetch(SOURCE_URL);
if (!res.ok) abort(`No se pudo descargar el origen (HTTP ${res.status}).`);
const source = await res.text();
const sha256 = createHash('sha256').update(source, 'utf8').digest('hex');

console.log(`· origen  ${SOURCE_URL}`);
console.log(`· bytes   ${Buffer.byteLength(source, 'utf8')}`);
console.log(`· sha256  ${sha256}`);

// ── 2. Acotar el bloque correcto, excluyendo coblis ──────────────────────
const start = source.indexOf('machado_2009_matrices');
if (start < 0) abort('No se encontró `machado_2009_matrices` en el origen.');

const coblis = source.indexOf('coblis_v1_matrices');
if (coblis < 0) {
  abort(
    'No se encontró `coblis_v1_matrices`, que es el límite inferior del corte. ' +
      'El fichero de origen ha cambiado de forma: revísalo a mano antes de seguir.',
  );
}
if (coblis <= start) abort('`coblis_v1_matrices` aparece antes que la tabla de Machado.');

const block = source.slice(start, coblis);

// ── 3. Extraer, deficiencia por deficiencia ──────────────────────────────
/** Posición de cada deficiencia dentro del bloque, para recortar su sección. */
const bounds = DEFICIENCIES.map(([key, marker]) => {
  const at = block.indexOf(marker);
  if (at < 0) abort(`No se encontró la sección \`${marker}\`.`);
  return { key, at };
}).sort((a, b) => a.at - b.at);

const MATRIX_RE = /(\d+)\s*:\s*np\.array\(\s*\[([\s\S]*?)\]\s*\)/g;

/**
 * Tokeniza el interior de una matriz y EXIGE que los 9 valores tengan
 * exactamente la forma esperada.
 *
 * ⚠️ Antes esto se hacía con `.match(/-?\d+\.\d+/g)`, y ahí había un agujero
 *    real: un valor en notación científica (`1.234e-05`) habría casado como
 *    `1.234`, descartando el exponente en silencio. Seguirían saliendo 9
 *    valores y 297 en total, así que TODAS las puertas habrían pasado y
 *    habríamos emitido una matriz falsa con sello de auditoría. Es el único
 *    camino que produce números erróneos con apariencia de verificados.
 */
function checkTokens(inner, key, step) {
  const tokens = inner
    .replace(/[[\]]/g, ' ')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length !== 9) {
    abort(`${key}, paso ${step}: se esperaban 9 valores y se han leído ${tokens.length}.`);
  }
  for (const t of tokens) {
    if (!FLOAT_TOKEN.test(t)) {
      abort(
        `${key}, paso ${step}: el valor "${t}" no tiene el formato decimal esperado. ` +
          `El origen ha cambiado de notación (¿científica?) y transcribirlo así lo corrompería.`,
      );
    }
  }
  return tokens;
}

const parsed = {};
let totalFloats = 0;

for (let i = 0; i < bounds.length; i++) {
  const { key, at } = bounds[i];
  const end = i + 1 < bounds.length ? bounds[i + 1].at : block.length;
  const section = block.slice(at, end);

  const steps = new Map();
  for (const m of section.matchAll(MATRIX_RE)) {
    const step = Number(m[1]);
    if (steps.has(step)) abort(`${key}: el paso ${step} aparece dos veces.`);
    // Se guardan los literales TAL CUAL vienen del origen: la transcripción es
    // textual, no un redondeo nuestro.
    steps.set(step, checkTokens(m[2], key, step));
    totalFloats += 9;
  }

  if (steps.size !== EXPECTED_STEPS) {
    abort(`${key}: se esperaban ${EXPECTED_STEPS} pasos y se han leído ${steps.size}.`);
  }
  for (let s = 0; s < EXPECTED_STEPS; s++) {
    if (!steps.has(s)) abort(`${key}: falta el paso ${s}.`);
  }

  // Severidad 0 tiene que ser la identidad. Si no lo es, el parseo se ha
  // desalineado y todo lo demás sería basura con pinta de dato.
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const zero = steps.get(0).map(Number);
  for (let k = 0; k < 9; k++) {
    if (Math.abs(zero[k] - identity[k]) > 1e-9) {
      abort(`${key}: la severidad 0 no es la identidad (posición ${k} = ${zero[k]}).`);
    }
  }

  parsed[key] = Array.from({ length: EXPECTED_STEPS }, (_, s) => steps.get(s));
  console.log(`· ${key.padEnd(7)} ${steps.size} pasos ✓  identidad en 0 ✓  formato ✓`);
}

if (totalFloats !== EXPECTED_FLOATS) {
  abort(`Se esperaban ${EXPECTED_FLOATS} flotantes en total y se han leído ${totalFloats}.`);
}
console.log(`· total   ${totalFloats} flotantes ✓`);

// Checksum de los valores en el mismo orden en que se van a emitir.
const orderedValues = DEFICIENCIES.flatMap(([key]) => parsed[key].flat());
const dataSha = dataChecksum(orderedValues);
console.log(`· datos   ${dataSha}`);

// ── 4. Emitir TypeScript ─────────────────────────────────────────────────
const generatedAt = new Date().toISOString().slice(0, 10);

const body = DEFICIENCIES.map(([key]) => {
  const rows = parsed[key]
    .map((f, step) => {
      const sev = (step / 10).toFixed(1);
      return (
        `    // severidad ${sev}\n` +
        `    [[${f[0]}, ${f[1]}, ${f[2]}], ` +
        `[${f[3]}, ${f[4]}, ${f[5]}], ` +
        `[${f[6]}, ${f[7]}, ${f[8]}]],`
      );
    })
    .join('\n');
  return `  ${key}: [\n${rows}\n  ],`;
}).join('\n\n');

const out = `/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ FICHERO GENERADO — NO EDITAR A MANO ⚠️
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Matrices de Machado 2009 en RGB LINEAL, 11 pasos de severidad (0.0–1.0).
 *  Regenerar con:  npm run gen:matrices
 *  Verificar sin red con:  npm run verify:matrices
 *
 *  ── Procedencia ─────────────────────────────────────────────────────────
 *
 *  Transcrito mecánicamente por scripts/gen-matrices.mjs desde:
 *    ${SOURCE_URL}
 *    sha256 del origen: ${sha256}
 *    fecha de generación: ${generatedAt}
 *
 *  Licencia del fichero de origen: MIT
 *    Copyright (c) 2021 Nicolas Burrus / DaltonLens
 *
 *  ── Fuente primaria ─────────────────────────────────────────────────────
 *
 *  Los números son del paper original, no de DaltonLens:
 *    Machado, Oliveira & Fernandes (2009),
 *    "A Physiologically-based Model for Simulation of Color Vision Deficiency",
 *    IEEE TVCG 15(6). Tabla 1.
 *    ${PRIMARY_SOURCE}
 *
 *  ⚠️ OJO: libDaltonLens (el proyecto en C, dominio público) NO contiene estas
 *     matrices — solo Brettel 1997 y Viénot 1999. Machado vive en el proyecto
 *     hermano DaltonLens-Python. Si alguien te manda a libDaltonLens a buscar
 *     Machado, no está ahí.
 */

import type { Matrix3 } from './matrices';

export const MACHADO_2009_GENERATED: Record<'protan' | 'deutan' | 'tritan', Matrix3[]> = {
${body}
};

// Congelado en profundidad: las tres rebanadas comparten esta tabla POR
// REFERENCIA. Un sort(), push() o reverse() accidental de cualquier consumidor
// la corrompería para todo el proceso — y además rompería isReady(), que
// comprueba la longitud. El coste es una pasada única al cargar el módulo.
for (const steps of Object.values(MACHADO_2009_GENERATED)) {
  for (const matrix of steps) {
    matrix.forEach(Object.freeze);
    Object.freeze(matrix);
  }
  Object.freeze(steps);
}
Object.freeze(MACHADO_2009_GENERATED);

/** SHA256 del fichero de origen del que salió esta tabla. Para auditoría. */
export const MACHADO_2009_SOURCE_SHA256 = '${sha256}';
export const MACHADO_2009_SOURCE_URL = '${SOURCE_URL}';

/**
 * SHA256 de los ${EXPECTED_FLOATS} valores de arriba, en orden.
 * A diferencia del hash del origen, este se puede verificar SIN RED:
 *   npm run verify:matrices
 * Es lo que detecta que alguien haya editado las matrices a mano.
 */
export const MACHADO_2009_DATA_SHA256 = '${dataSha}';
`;

writeFileSync(OUT, out, 'utf8');
console.log(`\n✅ Escrito ${OUT}`);
