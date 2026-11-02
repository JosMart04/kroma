# Known limitations

> Submission material, and not filler. Declaring the limits is the same argument
> the product makes: our user cannot audit what we tell them, so we audit
> ourselves in public. The judges can check every claim below against the code.

---

## 1. Tritanopia is simulated with Machado 2009, which is not the right model

**What we do.** All three deficiencies — protan, deutan and tritan — use the
Machado 2009 matrices in `src/core/color/matrices.generated.ts`.

**The limit.** The source we transcribed the matrices from warns that this model
does not work well for tritanopia, and its own automatic selector uses Brettel
1997 for that case. Brettel 1997 is not a 3×3 matrix: it is a projection onto
two half-planes, with a different branch depending on which side a colour falls.

**Why we accept it, knowingly.**

1. Tritan is by far the rarest deficiency. Protan and deutan cover almost the
   whole target population, and the majority user of this product is a **mild
   deuteranomal**.
2. Implementing Brettel's two-half-plane projection does not fit the calendar
   without cutting something the user actually sees.
3. The alternative — simulating tritan with a quietly worse model and not saying
   so — is exactly the failure this product exists to prevent.

**What is not affected.** Protan and deutan, where the product is decided, use
Machado 2009 as its authors published it.

**How it would be fixed.** Port `brettel_*_params` from libDaltonLens (C, public
domain, which does implement it) and branch in `simulate.ts` when
`type === 'tritan'`.

---

## 2. Severity snaps to the nearest published step; it is not interpolated

Machado 2009 publishes matrices in steps of 0.1. `simulate.ts` picks the nearest
step (`nearestStep`) rather than interpolating between the two adjacent ones,
which is what the reference implementation does.

**Real effect:** the maximum error is half a severity step (0.05). For any
severity that lands on a published step the result is identical.

**Why:** it is deterministic and trivial to audit. It can be changed to
interpolation without touching the public shape of `MACHADO_2009`.

---

## 3. Provenance of the matrices

The two DaltonLens projects are easy to confuse, and only one of them contains the
Machado 2009 table — **verified:**

| Project | Licence | What it actually contains |
|---|---|---|
| **libDaltonLens** (C) | Public domain | Brettel 1997 and Viénot 1999. The string `machado` appears **0 times** |
| **DaltonLens-Python** | MIT © 2021 Nicolas Burrus / DaltonLens | `machado_2009_matrices` — the table we use |

The numbers originate in the paper: Machado, Oliveira & Fernandes (2009),
*A Physiologically-based Model for Simulation of Color Vision Deficiency*,
IEEE TVCG 15(6), Table 1.

The transcription is **mechanical and auditable**: `scripts/gen-matrices.mjs`
downloads the file, checks that exactly 297 values come out and that severity 0
is the identity, and seals the **SHA256 of the source** into the header of the
generated file. No number was typed by hand.

---

## 4. We cannot detect a colour cast on a garment photo

**The limit.** Given a photograph of a garment and nothing else, the colour of
the light and the colour of the fabric cannot be separated. A white shirt under
a warm bulb and a cream shirt under neutral light produce the same pixels. This
is not a gap in our effort — recovering the illuminant needs a surface of known
colour in the frame, and a user photographing their own wardrobe has none.

**What we do about it.** We do not claim otherwise. The garment confidence
reports only what we can defend from the pixels themselves: clipping, the
8-bit encoding floor at that lightness, exposure and framing
(`src/core/color/confidence.ts`). The hue family is robust; the exact shade is
as honest as the light was.

**What we tried, and dropped on evidence.** The colour portrait measures its own
confidence by comparing a raw reading against a light-normalised one from
`/task/lighting`, and on a face that works — observed gap ΔE 0.5–0.7, a real
cast removed. We ran the same mechanism on garments, one garment under five
lights, against the real endpoint:

| photo | raw→normalised ΔE | verdict it would have produced |
|---|---|---|
| even daylight, true colour | 16.9 | **refuse** ← the best photo in the set |
| strong folds, true colour | 1.2 | measured |
| warm bulb, colour really shifted | 5.9 | low_light |
| cold cast, colour really shifted | 14.9 | refuse |
| underexposed | 22.6 | refuse |

The signal is not weak, it is unrelated: it refuses the good photos and passes
one of the bad ones. On that daylight shot the normalisation moved the garment
from **ΔE 1.8 to ΔE 20.2** away from its known true colour — the engine relights
scenes and faces, and pointed at flat fabric it corrects what was not broken. So
the pass stays in the portrait path, where it was validated, and the garment
path does not use it.

---

## 5. We do not say how much redness is "a lot"

**The limit.** F15 recommends a colour corrector. The specification also called
for per-phototype redness thresholds, "calibrated empirically with real
captures, never copied from an invented table". Those captures were never taken,
so there is no calibrated cutoff, and the app does not pretend there is one.

**What we do instead.** The vendor's measured `redness.raw_score` is shown on
its own scale, with the direction stated (higher is calmer), and the app
explicitly declines to grade it. What it does answer is the question the user
genuinely cannot: **which colour**. That part is arithmetic on a measured face —
the skin's own colour with its red component mirrored, at the same lightness and
warmth — and it is auditable down to the Lab coordinates shown on screen.

Worth noting that the rule reproduces the conventional advice without being
given it. Run it across the Fitzpatrick range and phototype I lands on mint
green, III on pale sage, IV–V on olive. The published table is a shadow of one
rule, and a face with no red asks for a corrector identical to itself — that is,
none — which falls out of the arithmetic rather than a special case.

**Where we knowingly diverge.** Conventional practice reaches for peach and
orange correctors on deep skin. That advice targets blue-toned
hyperpigmentation, which is a different concern from redness and one we do not
measure, so we do not give it. The app says so on screen.

**Not medical.** Persistent facial redness has causes that deserve a doctor
rather than a corrector, and the app states this where the recommendation
appears.

---

## 6. A corrector helps only when there is something to correct — measured

F16 applies the computed corrector to the user's face and measures the redness
before and after. Building it produced a result worth publishing, because it
runs against what a demo would prefer to show:

| skin | redness before | after | |
|---|---|---|---|
| already calm | 72.5 | 68.9 | **worse** |
| genuinely red | 57.0 | 58.4 | better |

Same face, same photo, corrector computed from that face's own measured skin.
Higher is calmer. **On skin with nothing to correct, adding a corrector made
the reading worse.** That is what a corrector is supposed to do, and it means
the app can tell someone not to bother — which is worth more to a user who
cannot see their own face than a demo that always flatters. The screen reports
the direction either way, including when the answer is "this did not help".

⚠️ **The engine paints rather than neutralises.** At the intensity the schema
suggests, `concealer` deposits visible green streaks across the cheeks and jaw:
it lays the colour on top instead of cancelling underneath, which is not what a
colour corrector does in life. The app therefore applies it as a wash
(intensity 25, coverage 30), verified by looking at the render. The schema also
says the shade "should typically match or slightly brighten the skin tone" — we
are using the channel off-label on purpose, and say so.

⚠️ **The preview's redness measures what the ENGINE did**, not what a product
will do. Only the second, real photo — taken after physically applying
something — answers that, and the app labels which is which.

---

## 7. Assisted contrast renders colours that are not there — on purpose

F18 moves the information a person is losing into channels they still have. It
is a distortion, deliberately, and the risk is obvious: it puts a colour on
screen that is not the colour of the thing. Three rules contain it.

1. **The original is always on screen**, on the left, and never disappears.
2. **The altered panel says it is altered** — "assisted contrast", never
   "enhanced", which would imply we improved on the truth.
3. **The reference truth is the measured NAME.** If the name says olive and the
   assisted pixel looks blue, the name wins. The pixel is for *telling apart*;
   the name is for *knowing*.

**What we measured.** In the user's own simulated space, across three observer
types and four garment pairs:

- Where a pair genuinely collides, it separates them — signal red against olive
  for a full deutan goes from **2.0 to 25.5** ΔE apart at full strength.
- **The effect is not monotonic.** Some pairs move CLOSER at gentle strength
  before they move apart: forest green against brown reads 6.1, then 4.5 at
  gentle, then 11.5 at full. That dip is why the strength is adjustable.
- **It is a trade.** A single global transform takes range from where there is
  plenty and gives it to where there is none, so well-separated pairs do
  compress. **No pair that was distinguishable becomes indistinguishable** —
  that property is asserted by `npm run harness:daltonize`, and it is the one
  that matters, because losing a distinction to fund another is something this
  user could not detect.

**What would fix the trade:** content-dependent recolouring (Shen et al., IET
Image Processing 2021) adapts the transform to the colours actually present
instead of applying one matrix to everything. Out of scope here; named because
we know it exists rather than having taken the first algorithm we found.

---

## 8. The scarf and hat engines invent the accessory; they do not transfer yours

**What we measured.** `/task/scarf` was given a flat magenta reference,
`#e010a0`, and a photograph of a person. It returned a **crimson patterned scarf
with white motifs and fringing** — `#570c25`, **ΔE 31.4** from the reference —
worn in front of the Colosseum. Neither the pattern, the fringing nor the
backdrop was anywhere in the input. A second run with a plain orange garment
returned a navy bandana.

**Why.** The endpoint's `style` parameter "controls outfit and background style"
and defaults to `random`; no value keeps the original. **Why this matters more
here than anywhere else.** `cloth-v4` behaves the opposite way: a real photograph of a black printed t-shirt came back as a black
printed t-shirt, and its render can be trusted for colour. The accessory
endpoints are generative, and the person looking at the result is the one who
cannot check a colour. A crimson scarf shown to someone whose scarf is magenta,
under a mild "this image is generated" note, is exactly the failure this product
exists to prevent.

**What the app does.** F14 ships, and the accessory render carries an alert
**above** the image rather than a caption below it, stating that the colour shown
is not theirs, quoting the measured ΔE 31.4, and repeating the measured hex of
their actual garment. The picture is offered for how a scarf sits and drapes,
which is a real thing to want and something they can judge perfectly well. Every
verdict on that screen comes from the measured colour, never from the rendered
pixels.

---

## 8b. Hair colour is a category, not a measurement

The colour analyser's documented schema allows exactly seven preset hex values
for `hair_color`, one per hair category, while skin, eyes, brows and lips are
free measured values. The portrait labels hair as *a colour category, not a
measurement*, and when the engine returns none, no hair colour is invented and
none enters an outfit verdict.

## 8c. Trousers and skirts need a photo of them being worn

The try-on engine's reference spec supports the lower body only from worn
outfits, not flat product shots. A flat photo of trousers measures perfectly well
for the wardrobe and every verdict; it just will not render reliably on a body.
The try-on screen says so before the render.

---

## 9. The measurement is of the photograph, not of the fabric

Every colour in the app comes from the user's own pixels, and no measurement is
better than the photo it came from. A garment measured twice under different
lights will give two slightly different answers, and the app says so through the
confidence level rather than picking one and presenting it as the truth.

**Not a limitation of the demo:** the app ships **empty**. Nothing is
pre-loaded, nothing is simulated, and every colour a judge sees was measured
from a photo they took on their own device. That is the point, and it is also
why an evaluator who takes no photos sees nothing.
