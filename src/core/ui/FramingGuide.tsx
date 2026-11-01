'use client';
/**
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT A USABLE PHOTO LOOKS LIKE — shown BEFORE the camera opens
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  Testers could not get photos the engine would accept, and the reason was
 *  that "fill more than half the width" is a sentence, not a picture. A person
 *  holding a phone needs to see the target, not read a specification.
 *
 *  ⚠️ THE GUIDE IS A DIAGRAM, NOT A LIVE OVERLAY, and that is a deliberate
 *     limit rather than an oversight. Drawing a frame ON TOP of the viewfinder
 *     needs `getUserMedia` — our own camera preview instead of the phone's —
 *     which trades the most reliable part of the app for a nicer one. See the
 *     note in `CameraInput`.
 *
 *  🔤 NOTHING HERE IS EXPLAINED BY COLOUR. Every mark is a shape or a label:
 *     the target is a solid outline, the mistakes are dashed and crossed. This
 *     product is built for people who do not receive a green/red distinction,
 *     and a framing guide that used one would be unreadable to exactly the
 *     person holding the phone.
 */

export type GuideKind = 'face' | 'garment' | 'body';

const STROKE = 'currentColor';

function Face() {
  return (
    <svg viewBox="0 0 120 90" className="h-full w-full text-slate-900" role="img" aria-label="">
      <rect x="1" y="1" width="118" height="88" rx="6" fill="none" stroke={STROKE} strokeWidth="1.5" opacity="0.35" />
      {/* Head fills more than half the width — the engine's actual requirement. */}
      <ellipse cx="60" cy="46" rx="26" ry="33" fill="none" stroke={STROKE} strokeWidth="3" />
      <circle cx="51" cy="40" r="2.2" fill={STROKE} />
      <circle cx="69" cy="40" r="2.2" fill={STROKE} />
      <path d="M52 57 Q60 63 68 57" fill="none" stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" />
      {/* The width it has to beat, marked rather than described. */}
      <path d="M34 84 H86" stroke={STROKE} strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M34 81 V87 M86 81 V87" stroke={STROKE} strokeWidth="1.5" />
    </svg>
  );
}

function Garment() {
  return (
    <svg viewBox="0 0 120 90" className="h-full w-full text-slate-900" role="img" aria-label="">
      <rect x="1" y="1" width="118" height="88" rx="6" fill="none" stroke={STROKE} strokeWidth="1.5" opacity="0.35" />
      {/* The garment flat, filling the frame, whole and uncropped. */}
      <path
        d="M40 22 L52 16 Q60 22 68 16 L80 22 L88 34 L79 40 L79 74 L41 74 L41 40 L32 34 Z"
        fill="none"
        stroke={STROKE}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M8 12 H16 M12 8 V16" stroke={STROKE} strokeWidth="1.5" opacity="0.5" />
      <path d="M104 12 H112 M108 8 V16" stroke={STROKE} strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

function Body() {
  return (
    <svg viewBox="0 0 120 90" className="h-full w-full text-slate-900" role="img" aria-label="">
      <rect x="1" y="1" width="118" height="88" rx="6" fill="none" stroke={STROKE} strokeWidth="1.5" opacity="0.35" />
      {/* Head to knees, facing forward, arms away from the body. */}
      <circle cx="60" cy="18" r="8" fill="none" stroke={STROKE} strokeWidth="2.5" />
      <path d="M60 26 V58" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 32 L44 46 M60 32 L76 46" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M60 58 L50 84 M60 58 L70 84" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const GUIDES: Record<GuideKind, { render: () => React.ReactElement; title: string; rules: string[] }> = {
  face: {
    render: Face,
    title: 'Frame it like this',
    rules: [
      'Your face wider than half the frame',
      'Looking straight at the camera, head level',
      'Daylight from a window, never direct sun',
    ],
  },
  garment: {
    render: Garment,
    title: 'Frame it like this',
    rules: [
      'One garment, laid flat and whole',
      'On a surface of a clearly different shade',
      'Even light, no hard shadow across it',
    ],
  },
  body: {
    render: Body,
    title: 'Frame it like this',
    rules: [
      'Head to about the knees, facing forward',
      'Arms slightly away from your body',
      'A plain wall behind you, just you in the shot',
    ],
  },
};

export function FramingGuide({ kind }: { kind: GuideKind }) {
  const guide = GUIDES[kind];
  const Diagram = guide.render;

  return (
    <div className="mb-3 flex gap-4 rounded-xl border-2 border-slate-200 p-3">
      <div className="h-20 w-28 shrink-0" aria-hidden>
        <Diagram />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{guide.title}</p>
        <ul className="mt-1 space-y-0.5">
          {guide.rules.map((r) => (
            <li key={r} className="text-sm text-slate-600">
              · {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
