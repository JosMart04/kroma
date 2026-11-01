/**
 * ══════════════════════════════════════════════════════════════════════════
 *  MEASUREMENT HARNESS FOR THE GARMENT COLOUR READING (F6 · F10)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *      node --experimental-strip-types scripts/garment-harness.mjs
 *      (npm run harness:garment)
 *
 *  WHY THIS EXISTS
 *
 *  Three of the bugs a user caught in this product were wrong colours, and none
 *  of them looked wrong to whoever wrote the code. Looking at the output proves
 *  nothing: a swatch on screen is exactly what our user cannot check, and it is
 *  what the developer stops checking after the tenth time.
 *
 *  So every garment here is SYNTHESISED FROM A KNOWN COLOUR. The truth is not a
 *  judgement about the photo, it is the number the photo was built from, and the
 *  harness asserts the distance to it. Shading is deliberately harsher than any
 *  real photograph — a 3× range from highlight to fold — because that is the
 *  variation that broke the two previous implementations.
 *
 *  WHAT IT ASSERTS, AND WHY BOTH DIRECTIONS MATTER
 *
 *   · a known colour comes back within a visible-difference margin;
 *   · a SOLID garment is not called patterned — the false alarm a user reported,
 *     where a plain orange t-shirt was "37% dominant, patterned" because its own
 *     folds fragmented it;
 *   · a PATTERNED garment is not called solid — the failure that would hide a
 *     print from the one person who cannot see it.
 *
 *  It is trivial to pass either one alone. Calling everything solid silences the
 *  false alarm and blinds the product; calling everything patterned is a warning
 *  nobody reads. Only both together mean anything.
 *
 *  ⚠️ Node cannot resolve the `@/core/*` alias (it is a bundler convention), so
 *     the sources are copied to a scratch folder with rewritten specifiers and
 *     run with native type stripping. Nothing else about them is touched.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// ⚠️ The scratch folder must live INSIDE the project: Node resolves bare
// imports (culori) by walking up to node_modules, and the OS temp dir has none.
const dir = mkdtempSync(join(ROOT, '.harness-'));

function stage(name) {
  const src = readFileSync(join(ROOT, 'src/core/color', name), 'utf8')
    .replace(/@\/core\/contracts\/types/g, './types.ts')
    .replace(/from '\.\/([a-zA-Z0-9_-]+)'/g, "from './$1.ts'");
  writeFileSync(join(dir, name), src);
}

let measureDominantColor;
let ciede2000;
let hexToLab;
try {
  writeFileSync(join(dir, 'types.ts'), 'export type Lab = [number, number, number];\n');
  for (const f of ['measure.ts', 'deltae.ts', 'srgb.ts']) stage(f);
  ({ measureDominantColor } = await import(pathToFileURL(join(dir, 'measure.ts')).href));
  ({ hexToLab } = await import(pathToFileURL(join(dir, 'deltae.ts')).href));
  ({ differenceCiede2000: ciede2000 } = await import('culori'));
} catch (e) {
  rmSync(dir, { recursive: true, force: true });
  throw e;
}
const deltaE = ciede2000();
const lab = (hex) => {
  const [l, a, b] = hexToLab(hex);
  return { mode: 'lab', l, a, b };
};

// ── The garments ──────────────────────────────────────────────────────────
const W = 700;
const H = 700;
const MEASURE_EDGE = 256;
const rgb = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));

/**
 * Fabric shading: a smooth fold field, a shadow down one side and a fold
 * catching the light. Runs from 0.42× to 1.28× — harsher than reality, on
 * purpose. This is the variation that must NOT be mistaken for a second colour.
 */
function shade(x, y) {
  const u = x / W;
  const v = y / H;
  let f = 0.86 + 0.22 * Math.sin(u * 9.1 + 0.4) * Math.cos(v * 4.3) + 0.1 * Math.sin(v * 13.7 + 1.1);
  f -= 0.3 * Math.max(0, u - 0.55);
  f += 0.16 * Math.exp(-(((u - 0.28) * 6) ** 2));
  return Math.max(0.42, Math.min(1.28, f));
}

/** A body with two sleeves, so the silhouette is not a rectangle. */
const inGarment = (x, y) =>
  (x > 175 && x < 525 && y > 130 && y < 620) ||
  (x > 80 && x <= 175 && y > 150 && y < 320) ||
  (x >= 525 && x < 620 && y > 150 && y < 320);

const inEllipse = (x, y, cx, cy, r) => ((x - cx) / r) ** 2 + ((y - cy) / r) ** 2 <= 1;

async function render(paint, backdrop = '#f2f2f0') {
  const buf = Buffer.alloc(W * H * 3);
  const back = rgb(backdrop);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      let px;
      if (inGarment(x, y)) {
        const f = shade(x, y);
        px = paint(x, y).map((c) => Math.max(0, Math.min(255, Math.round(c * f))));
      } else {
        // The backdrop is not perfectly flat either — a real one never is.
        px = back.map((c) => Math.round(c * (1 - 0.06 * (y / H))));
      }
      buf[i] = px[0];
      buf[i + 1] = px[1];
      buf[i + 2] = px[2];
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

const solid = (hex) => {
  const c = rgb(hex);
  return () => c;
};

const CASES = [
  // label, painter, backdrop, true colour, expected to be patterned
  ['solid orange, folds', solid('#e06230'), '#f2f2f0', '#e06230', false],
  ['solid red', solid('#c0303a'), '#f2f2f0', '#c0303a', false],
  ['solid navy', solid('#1f2a44'), '#f2f2f0', '#1f2a44', false],
  ['solid black', solid('#1a1a1c'), '#f2f2f0', '#1a1a1c', false],
  ['solid teal', solid('#1f7d78'), '#f2f2f0', '#1f7d78', false],
  // A chest logo over 3% of the fabric. Nobody calls this shirt patterned, and
  // warning about it is the false alarm that gets the feature ignored.
  [
    'small logo (3%)',
    (x, y) => (inEllipse(x, y, 420, 250, 48) ? rgb('#d8c23a') : rgb('#6f7378')),
    '#f2f2f0',
    '#6f7378',
    false,
  ],
  // A printed graphic over about a fifth of it. This one IS patterned, and the
  // reported colour must still be the shirt rather than a blend with the print.
  [
    'big print (20%)',
    (x, y) => (inEllipse(x, y, 350, 340, 130) ? rgb('#d8c23a') : rgb('#1a1a1c')),
    '#f2f2f0',
    '#1a1a1c',
    true,
  ],
  // Two neutrals differing only in lightness — the case that forbids simply
  // ignoring lightness altogether. Mid-grey is on neither stripe.
  [
    'black/white stripes',
    (x, y) => (Math.floor(y / 45) % 2 ? rgb('#efefef') : rgb('#1c1c1c')),
    '#8a8a88',
    '#1c1c1c',
    true,
  ],
];

/**
 * The case no pixel rule can solve: garment and backdrop one ΔE apart. It is
 * measured twice, with the ring estimate and through a cut-out, because the
 * justification for spending an API call on background removal has to be a
 * number.
 */
const PALE = ['white shirt on a white table', solid('#f0efe9'), '#f2f2f0', '#f0efe9'];

async function raster(jpeg) {
  const { data, info } = await sharp(jpeg)
    .resize({ width: MEASURE_EDGE, height: MEASURE_EDGE, fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Attach a perfect cut-out, which is what a good background removal gives. */
function withMask(r) {
  const n = r.width * r.height;
  const rgba = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = Math.round(((i % r.width) / r.width) * W);
    const y = Math.round((Math.floor(i / r.width) / r.height) * H);
    rgba[i * 4] = r.data[i * 3];
    rgba[i * 4 + 1] = r.data[i * 3 + 1];
    rgba[i * 4 + 2] = r.data[i * 3 + 2];
    rgba[i * 4 + 3] = inGarment(x, y) ? 255 : 0;
  }
  return { data: rgba, width: r.width, height: r.height, channels: 4, alphaIsMask: true };
}

/** A visible difference. Beyond this the answer is a different colour. */
const TOLERANCE = 5;

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

try {
  console.log('\nGARMENT COLOUR — synthetic garments, colour known by construction\n');
  console.log(
    '  ' +
      'garment'.padEnd(24) +
      'measured'.padEnd(10) +
      'ΔE'.padStart(5) +
      'share'.padStart(7) +
      '  reported',
  );
  console.log('  ' + '─'.repeat(68));

  for (const [label, paint, backdrop, truth, wantPatterned] of CASES) {
    const r = await raster(await render(paint, backdrop));
    const m = measureDominantColor({ ...r, channels: 3 });
    const err = deltaE(lab(truth), lab(m.hex));
    console.log(
      '  ' +
        label.padEnd(24) +
        m.hex.padEnd(10) +
        err.toFixed(1).padStart(5) +
        `${m.dominantShare}%`.padStart(7) +
        '  ' +
        (m.looksPatterned ? 'patterned' : 'solid'),
    );
    if (err > TOLERANCE) fail(`${label}: colour off by ΔE ${err.toFixed(1)} (limit ${TOLERANCE})`);
    if (m.looksPatterned !== wantPatterned) {
      fail(
        `${label}: reported ${m.looksPatterned ? 'patterned' : 'solid'}, ` +
          `expected ${wantPatterned ? 'patterned' : 'solid'}`,
      );
    }
  }

  // ── What the cut-out buys, as a number ──────────────────────────────────
  const [label, paint, backdrop, truth] = PALE;
  const r = await raster(await render(paint, backdrop));
  const guess = measureDominantColor({ ...r, channels: 3 });
  const masked = measureDominantColor(withMask(r));
  const gErr = deltaE(lab(truth), lab(guess.hex));
  const mErr = deltaE(lab(truth), lab(masked.hex));

  console.log(`\n  ${label} — garment and backdrop ΔE ${deltaE(lab(truth), lab(backdrop)).toFixed(1)} apart\n`);
  console.log(`    ring estimate     ${guess.hex}   ΔE ${gErr.toFixed(1)}`);
  console.log(`    through a cut-out ${masked.hex}   ΔE ${mErr.toFixed(1)}`);
  if (mErr >= gErr) {
    fail('the cut-out did not improve the pale-on-pale case — the API call is not earning its place');
  }
  if (mErr > TOLERANCE) fail(`even through the cut-out the pale case is off by ΔE ${mErr.toFixed(1)}`);

  console.log(
    failures === 0
      ? '\n✅ Every garment measured within tolerance, and solid and patterned told apart.\n'
      : `\n❌ ${failures} failure(s).\n`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
