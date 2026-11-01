/**
 * YouCam fixtures. Active while YOUCAM_MOCK !== 'false'. Spends no units.
 *
 * The shapes here mirror real responses captured from the live API, not the
 * documentation — the documentation omits `face_quality` entirely.
 */
import type { FitzpatrickResult, SkinToneFull, SkinAnalysisResult } from './client';

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

export async function fitzpatrick(): Promise<FitzpatrickResult> {
  await delay();
  return { fitzpatrick: 3 };
}

export async function skinTone(): Promise<SkinToneFull> {
  await delay();
  return {
    color: {
      skin_color: '#b9947c',
      eye_color: '#4a6b3f',
      eye_color_name: 'Green',
      eyebrow_color: '#5b2b31',
      lip_color: '#c4707a',
      hair_color: '#7a4a2b',
      hair_color_name: 'Auburn',
    },
    faceQuality: {
      has_face: true,
      area: 'good',
      frontal: 'good',
      lighting: 'good',
      faceangle: 'good',
    },
  };
}

export async function skinAnalysis(concerns: string[]): Promise<SkinAnalysisResult> {
  await delay(600);
  // ⚠️ Inverted scale: LOWER means WORSE condition. 64 in redness is marked
  // redness, not "64% red".
  const base: Record<string, number> = {
    redness: 64.2, oiliness: 71.5, texture: 78.1, acne: 82.4,
    moisture: 66.0, radiance: 74.3,
  };
  const out: SkinAnalysisResult = {};
  for (const c of concerns) {
    const raw = base[c.replace('hd_', '')] ?? 70;
    out[c] = { raw_score: raw, ui_score: Math.min(100, Math.round(raw * 1.1)) };
  }
  return out;
}

/**
 * A 2x2 JPEG in a plausible skin tone.
 *
 * ⚠️ It is deliberately NOT the same colour as `skinTone()` above: in mock mode
 * the lighting-normalisation step returns this, and if it matched exactly the
 * confidence layer would always report a perfect measurement and we would never
 * exercise the low-light path while developing.
 */
export async function tryOnImage(): Promise<Buffer> {
  await delay(600);
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAHwAAAQUBAQEB' +
      'AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh' +
      'ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ' +
      'WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
      'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=',
    'base64',
  );
}
