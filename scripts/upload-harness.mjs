/**
 * ══════════════════════════════════════════════════════════════════════════
 *  HARNESS FOR THE UPLOAD CONVERSION — `toEngineJpeg`
 * ══════════════════════════════════════════════════════════════════════════
 *
 *      node --experimental-strip-types scripts/upload-harness.mjs
 *      (npm run harness:upload)
 *
 *  WHY THIS EXISTS
 *
 *  Perfect Corp's Playground resizes source images for you and says so; the
 *  documentation is explicit that an integration has to do it itself
 *  ("Step 1: Resize your source image"). Everything the engine rejects at this
 *  layer comes back as a bare code from a server two calls away, on an image
 *  the developer never sees, so it is the cheapest possible thing to get wrong
 *  and among the most expensive to diagnose.
 *
 *  So the limits are asserted here, on synthetic images of the shapes that
 *  break them, before a unit is ever spent.
 *
 *  THE DOCUMENTED SPEC — read 31 Oct 2026, for the endpoints this app uses
 *
 *  | endpoint                    | short side | long side                    |
 *  |-----------------------------|------------|------------------------------|
 *  | Facial Color Tones Analyzer | ≥ 320      | ≤ 4096, downsized above 1080 |
 *  | Fitzpatrick Skin Type       | ≥ 320      | ≤ 4096                       |
 *  | Skin Analysis · SD concerns | ≥ 480      | ≤ 2560 (resized above it)    |
 *  | Skin Analysis · HD concerns | ≥ 1080     | ≤ 2560 (resized above it)    |
 *  | Photo Lighting              | —          | ≤ 4096                       |
 *  | Makeup Virtual Try-On       | face ≥ 100 | < 1920, height < 1080        |
 *
 *  All of them: under 10 MB. Fitzpatrick accepts jpg only.
 *
 *  ⚠️ HD SKINCARE IS THE ONE LINE WE DO NOT CLEAR, and that is deliberate: we
 *     request SD concerns only, so its 1080 floor never applies. The harness
 *     states it rather than quietly asserting the weaker bound — the day an
 *     `hd_` concern is added, this comment is the warning.
 *
 *  ⚠️ Node cannot resolve the `@/core/*` alias, so the source is copied to a
 *     scratch folder with rewritten specifiers and run with native type
 *     stripping. Nothing else about it is touched.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(ROOT, '.harness-'));

/** The strictest floor and ceiling any endpoint in the portrait path imposes. */
const SPEC = { minShort: 480, maxLong: 4096, maxBytes: 10 * 1024 * 1024 };

let toEngineJpeg;
try {
  for (const name of ['config.ts', 'upload.ts']) {
    const src = readFileSync(join(ROOT, 'src/core/youcam', name), 'utf8').replace(
      /from '\.\/([a-zA-Z0-9_-]+)'/g,
      "from './$1.ts'",
    );
    writeFileSync(join(dir, name), src);
  }
  ({ toEngineJpeg } = await import(pathToFileURL(join(dir, 'upload.ts')).href));
} catch (e) {
  rmSync(dir, { recursive: true, force: true });
  throw e;
}

/** A flat colour at a given size. Content is irrelevant here; shape is not. */
async function image(width, height, format = 'jpeg') {
  return sharp({
    create: { width, height, channels: 3, background: { r: 190, g: 90, b: 70 } },
  })[format]()
    .toBuffer();
}

const CASES = [
  // ── The ordinary ones. These must survive untouched in shape. ──────────
  { name: 'phone selfie, 3:4 portrait', w: 3024, h: 4032 },
  { name: 'phone selfie, 9:16 portrait', w: 1080, h: 1920 },
  { name: 'landscape snapshot', w: 4032, h: 3024 },
  { name: 'square crop', w: 1200, h: 1200 },

  // ── Small. The engine floor is 320–480; these are under it and must GROW,
  //    because refusing them means telling a user their own photo is wrong.
  { name: 'small square, under every floor', w: 300, h: 300 },
  { name: 'thumbnail-sized portrait', w: 240, h: 320 },

  // ── The shapes that broke the arithmetic. ─────────────────────────────
  //    A wide crop shrunk to fit the long edge lands under the short floor;
  //    grown to clear the floor it shoots past the 4096 ceiling. Both limits
  //    are real and only one of them is ours to bend.
  { name: 'wide crop, 5:1', w: 3000, h: 600 },
  { name: 'panorama, 20:1', w: 8000, h: 400 },
  { name: 'extreme strip, 40:1', w: 8000, h: 200 },
  { name: 'tall strip, 1:20', w: 400, h: 8000 },

  // ── A PNG with the alpha the background remover returns. ──────────────
  { name: 'PNG source', w: 1000, h: 1400, format: 'png' },
];

let failures = 0;
const rows = [];

for (const c of CASES) {
  const input = await image(c.w, c.h, c.format ?? 'jpeg');
  const out = await toEngineJpeg(input);
  const meta = await sharp(out).metadata();

  const short = Math.min(meta.width, meta.height);
  const long = Math.max(meta.width, meta.height);
  const problems = [];

  if (short < SPEC.minShort) problems.push(`short side ${short} < ${SPEC.minShort}`);
  if (long > SPEC.maxLong) problems.push(`long side ${long} > ${SPEC.maxLong}`);
  if (out.byteLength > SPEC.maxBytes) problems.push(`${(out.byteLength / 1e6).toFixed(1)} MB > 10 MB`);
  if (meta.format !== 'jpeg') problems.push(`format ${meta.format}, and two endpoints take jpg only`);
  // 4:4:4 is the whole reason this function exists: the default 4:2:0 averages
  // chroma over 2×2 blocks, which is noise injected into the measured variable.
  if (meta.chromaSubsampling !== '4:4:4') problems.push(`chroma ${meta.chromaSubsampling}`);

  if (problems.length) failures++;
  rows.push({
    case: c.name,
    in: `${c.w}×${c.h}`,
    out: `${meta.width}×${meta.height}`,
    kb: Math.round(out.byteLength / 1024),
    verdict: problems.length ? `✗ ${problems.join('; ')}` : '✓',
  });
}

/**
 * ── Makeup has its own, tighter window ───────────────────────────────────
 *
 * `makeup-vto` wants the long side under 1920 px and the height under 1080 px.
 * The default 1600 px window breaks the height cap on any portrait photo, so
 * the makeup route asks for `MAKEUP_LONG_EDGE`. Both orientations must fit,
 * and the short side must still clear the skin analyser's 480 px floor,
 * because the same file is measured before and after the render.
 */
const MAKEUP_LONG_EDGE = 1072;
for (const [w, h, label] of [
  [3024, 4032, "makeup · 3:4 portrait"],
  [4032, 3024, "makeup · landscape"],
  [1080, 1920, "makeup · 9:16 portrait"],
]) {
  const out = await toEngineJpeg(await image(w, h), MAKEUP_LONG_EDGE);
  const meta = await sharp(out).metadata();
  const problems = [];
  if (meta.width >= 1920) problems.push(`width ${meta.width} >= 1920`);
  if (meta.height >= 1080 && meta.width >= 1080) problems.push(`both sides >= 1080`);
  if (Math.max(meta.width, meta.height) >= 1080) problems.push(`long side ${Math.max(meta.width, meta.height)} >= 1080`);
  if (Math.min(meta.width, meta.height) < SPEC.minShort) problems.push(`short side below ${SPEC.minShort}`);
  if (problems.length) failures++;
  rows.push({
    case: label,
    in: `${w}×${h}`,
    out: `${meta.width}×${meta.height}`,
    kb: Math.round(out.byteLength / 1024),
    verdict: problems.length ? `✗ ${problems.join("; ")}` : "✓",
  });
}

/**
 * ── The claim that is not about limits ────────────────────────────────────
 *
 * Conversion must not move the colour. Every number this product reports comes
 * off pixels that went through here, and a colour cast introduced at this step
 * would be invisible to the one person who cannot check it.
 */
const KNOWN = { r: 190, g: 90, b: 70 };
const probe = await sharp({
  create: { width: 1400, height: 1900, channels: 3, background: KNOWN },
})
  .jpeg()
  .toBuffer();
const converted = await toEngineJpeg(probe);
const { data } = await sharp(converted)
  .extract({ left: 600, top: 800, width: 100, height: 100 })
  .raw()
  .toBuffer({ resolveWithObject: true });

let r = 0;
let g = 0;
let b = 0;
for (let i = 0; i < data.length; i += 3) {
  r += data[i];
  g += data[i + 1];
  b += data[i + 2];
}
const n = data.length / 3;
const drift = Math.max(
  Math.abs(r / n - KNOWN.r),
  Math.abs(g / n - KNOWN.g),
  Math.abs(b / n - KNOWN.b),
);

rmSync(dir, { recursive: true, force: true });

console.log('\n  UPLOAD CONVERSION · against the documented spec\n');
console.table(rows);
console.log(`\n  Colour drift through the conversion: ${drift.toFixed(2)} / 255 per channel`);

/** One JPEG level of noise is expected; a shift is not. */
if (drift > 2) {
  failures++;
  console.error('  ✗ The conversion moved the colour. Every measurement downstream is built on it.');
} else {
  console.log('  ✓ The colour survives the conversion.');
}

if (failures) {
  console.error(`\n  ✗ ${failures} case(s) would be rejected by the engine.\n`);
  process.exit(1);
}
console.log('\n  ✓ Every shape lands inside the documented window.\n');
