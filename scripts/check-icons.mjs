/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ARE THE APP ICONS SHIPPABLE?
 * ══════════════════════════════════════════════════════════════════════════
 *
 *      npm run check:icons
 *
 *  WHY THIS EXISTS
 *
 *  Icons are handed over by someone who is not looking at the manifest, and
 *  every failure mode here is invisible in an image viewer:
 *
 *    · TRANSPARENCY rasterises against whatever the OS puts behind it — often
 *      black — so a logo drawn on white disappears on install;
 *    · a MASKABLE icon is cropped by Android to the central 80%, so its own
 *      rounded corners get cut and a wordmark near the edge is guillotined.
 *
 *  Both already happened here. The first icon delivered had its own badge and
 *  a name along the bottom, and 30.5% of it fell outside the safe zone while
 *  the manifest declared it maskable — the one place the icon is most visible
 *  was the one place it would have been cut.
 *
 *  So the check runs on the files themselves and reads the manifest to see what
 *  is being CLAIMED about them, because the mismatch is the actual bug.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8'));

/** Android keeps a centred circle of this fraction of the icon's width. */
const SAFE_ZONE = 0.8;
/** Below this, a stray antialiased pixel is not worth failing the build over. */
const CROP_TOLERANCE = 0.02;

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

/** How much of the artwork a launcher would cut, as a fraction. */
async function croppedShare(file, size) {
  const { data } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const brightness = (i) => data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2];
  // The corner is background by definition on a full-bleed icon.
  const background = brightness(0);
  const radius = (size * SAFE_ZONE) / 2;

  let content = 0;
  let outside = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (brightness(y * size + x) <= background + 60) continue;
      content++;
      if (Math.hypot(x - size / 2, y - size / 2) > radius) outside++;
    }
  }
  return content === 0 ? 0 : outside / content;
}

console.log('\nAPP ICONS\n');

for (const declared of manifest.icons) {
  const file = join(ROOT, 'public', declared.src);
  const meta = await sharp(file).metadata();
  const [wantW, wantH] = declared.sizes.split('x').map(Number);

  const label = `${declared.src} (${declared.purpose})`;
  if (meta.width !== wantW || meta.height !== wantH) {
    fail(`${label}: manifest claims ${declared.sizes}, file is ${meta.width}x${meta.height}`);
  }
  if (meta.width !== meta.height) fail(`${label}: not square`);

  // Opacity, measured rather than trusted: an alpha channel that happens to be
  // fully opaque is fine, an actually transparent icon is not.
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] < 250) clear++;
  const transparent = clear / (info.width * info.height);
  if (transparent > 0.01) {
    fail(`${label}: ${(transparent * 100).toFixed(1)}% transparent — flatten it onto an opaque background`);
  }

  const cropped = await croppedShare(file, meta.width);
  console.log(
    `  ${declared.src.padEnd(18)} ${String(meta.width + 'x' + meta.height).padEnd(9)} ` +
      `${declared.purpose.padEnd(9)} outside safe zone ${(cropped * 100).toFixed(1)}%`,
  );

  if (declared.purpose === 'maskable' && cropped > CROP_TOLERANCE) {
    fail(
      `${label}: ${(cropped * 100).toFixed(1)}% of the artwork would be CROPPED by Android. ` +
        `Either redraw it full-bleed with everything inside the centred circle of radius ` +
        `${Math.round((meta.width * SAFE_ZONE) / 2)}px, or remove the maskable entry from the manifest.`,
    );
  }
}

console.log(
  failures === 0
    ? '\n✅ Icons match what the manifest claims about them.\n'
    : `\n❌ ${failures} problem(s). See public/ICONS.md.\n`,
);
process.exit(failures === 0 ? 0 : 1);
