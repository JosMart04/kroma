# KROMA — functional specification and scope

**Source of truth for what the product does.** Every feature below has acceptance criteria;
the README describes them for a reader, this file for whoever changes them.

---

## Decisions (not reopened)

| Decision | Value |
|---|---|
| Product shape | **"One decision"**: the measured face is an input to every garment verdict |
| Hackathon topics | **Skin AI and eCommerce VTO**, as one product |
| MCP | **Hybrid**: REST owns every measurement; MCP renders garments in production and runs an audited measurement flow |
| Wardrobe | **Persistent**, on the device (IndexedDB), no account |
| Accessory with try-on | **Scarf and hat** (they frame the face) |
| Makeup | **Full loop**: corrector computed, rendered, and its effect on redness measured |
| Language models | **None** decide anything (see `04-LLM-POLICY.md`) |
| Starting state | **Empty.** Every colour on screen is measured from the user's own photos |

---

## 1. Product thesis

**In one sentence:** a person with colour vision deficiency cannot see the colour of their own
face, and therefore cannot make any decision that depends on it. YouCam returns that colour as
a number. There, the API is irreplaceable.

**The corollary that shapes the design:** our user is the one person who **cannot audit our
product**. If we name a colour wrong, they have no way to detect it. Honesty is a structural
requirement, not a promise.

**The value ladder:**

| Level | The user's question | Who answers it today |
|---|---|---|
| 0 | What colour is this garment? | Free colour-picker apps |
| 1 | How will I see it? | Web simulators |
| 2 | How does it look on me? | Generic try-on |
| 3 | **Does it go with what I already own?** | **Nobody, for this user** |
| 4 | **What colour is my own face?** | **YouCam Skin AI** |
| 5 | **Did the correction work?** | **Nobody** |

### 1.1 The anti-wrapper balance

Measuring a garment's colour is not an API function — it happens on our own pixels. The API's
contribution to the wardrobe is background removal. So the **measured face (Skin AI)** and the
**try-on (eCommerce VTO)** stay at the centre of the story. Always open with the measured face,
never with the wardrobe.

---

## 2. The user

### 2.1 Mechanism

Normal vision is trichromatic: L, M and S cones. A deficiency appears when one is missing
(**dichromacy**) or its peak is shifted (**anomalous trichromacy**). After the cones, the brain
organises the signals into two opponent channels (red–green, blue–yellow). A fault in L or M
destabilises the whole channel — and with it purples, pinks, browns, oranges, olives and many
greys.

> **Design consequence 1.** No feature may assume "only red and green are confused". The
> evaluator computes perceptual distance in the user's simulated space, whatever the pair.

### 2.2 Profiles

| Profile | Cone | Prevalence (♂) | Trait relevant to the product |
|---|---|---|---|
| Protanomaly | L shifted | ~1% | Reds dull and dark |
| Protanopia | L absent | ~1% | **Loss of lightness on the red axis.** Red confusable with black |
| **Deuteranomaly** | M shifted | **~5%** | **The majority profile.** No darkening → often undiagnosed for decades |
| Deuteranopia | M absent | ~1% | Like protanopia without the lightness loss |
| Tritanomaly / tritanopia | S shifted / absent | rare | Blue/green, yellow/pink |

> **Design consequence 2.** Asking the user to pick their type is asking for the answer they
> came for. **Calibration is a functional requirement**, and it produces the severity factor
> everything else depends on.

### 2.3 Two counter-intuitive findings the product exploits

- **The pair most confused in a wardrobe is blue/purple, not red/green** — navy and dark purple
  are both formal garment colours.
- **Lightness is the channel that survives.** Two colours can collide in hue and still be
  separable by lightness. The verdict must account for it, or it produces constant false alarms.

### 2.4 The problem is cumulative, and the wardrobe answers it

| Documented coping strategy | What it reveals | Feature that answers it |
|---|---|---|
| Shrinking the wardrobe to "safe colours" | Voluntary impoverishment of consumption | **F8 colour families** |
| Asking someone else — a parent, a partner | A dependency many describe with discomfort | **F11 traffic light, F19 outfits** |
| Rigid systems: each shirt with one suit | Variety sacrificed to remove risk | **F8 families, F19 outfits** |

### 2.5 Where the API is irreplaceable: the face

- **Choosing foundation is pure colour matching**, the task this person cannot do — and the
  mistake is visible to everyone else.
- **Redness is invisible to the person who has it.** It sits on the red–green axis, impaired in
  nearly every case. Skin Analysis returns it as a number.
- **Hair colour also sits on the impaired axis** — though the engine returns it as one of seven
  categories, which the product says.

---

## 3. Scope

### 3.1 In scope

| Block | ID | Feature | API |
|---|---|---|---|
| A · Perceptual basis | **F1** | Calibration → profile + severity | — |
| | **F2** | Colour portrait: skin, eyes, brows, lips, hair, Fitzpatrick, redness | Skin AI |
| | **F3** | Colour simulation engine with severity | — |
| | **F4** | Confidence layer and the right to refuse | Lighting (faces) |
| | **F5** | Dual view | — |
| B · Wardrobe | **F6** | Garment ingestion: photo → cut-out mask → measurement → name → confidence | Background removal |
| | **F7** | Persistent wardrobe, accessories included | — |
| | **F8** | Colour families — mutually distinguishable groups | — |
| | **F9** | Duplicate alert — same colour, or indistinguishable to you | — |
| | **F10** | Honest naming with the collision note | — |
| | **F11** | Outfit traffic light (hue + lightness + palette) | — |
| C · Purchase decision | **F12** | "Should I buy this?" | — (+ F13) |
| | **F13** | Clothes try-on with verdict | eCommerce VTO |
| | **F14** | Scarf and hat try-on | eCommerce VTO |
| D · Skin and makeup | **F15** | Corrector and foundation from measurement | — (on Skin AI data) |
| | **F16** | Corrector rendered and its effect on redness measured | Makeup VTO + Skin AI |
| E · Infrastructure | **F17** | MCP: audited run + production try-on | MCP servers |
| F · Presentation | **F18** | Assisted contrast (daltonisation) | — |
| G · Dressing | **F19** | Whole outfits, generated and user-assembled, and rendered | eCommerce VTO |

### 3.2 Out of scope — declared

- Retail catalogue integration (Shopify, WooCommerce).
- Shoe, bag and jewellery try-on. *(They are in the wardrobe and every verdict — just not rendered.)*
- Translating commercial colour names ("moonlight" → a real colour).
- Hair type, density, frizz and length — not colour properties.
- Achromatopsia in the calibration.
- HD skin concerns (they need a 1080 px short side; SD answers the redness question).

---

## 4. Feature catalogue and acceptance criteria

### F1 · Calibration

Estimates the profile (protan / deutan / tritan / normal) and a **severity `s ∈ [0,1]`** without
asking.

- **Stage A:** a Farnsworth D-15-style arrangement of 16 caps at constant L* and chroma
  (generated in CIELAB, not the commercial caps). The predicted arrangement of each hypothesis
  comes from the Machado 2009 model itself.
- **Stage B (primary):** three interleaved 2-down/1-up staircases against neutral grey, one per
  axis. Severity is the Machado step at which the measured threshold equals one JND.
- **Refuses** when the staircases do not converge or saturate, and names the axis that failed.
- Fallback: "I already know my diagnosis" (`source: 'self_reported'`, confidence 0.6).
- Disclaimer on screen: not a medical diagnosis.
- 🚫 **No Ishihara plates** (copyrighted, and unreliable on uncalibrated screens).
- ✅ `npm run harness:calibration` recovers seven synthetic observers and refuses a random
  guesser and an always-wrong responder.

### F2 · Colour portrait

| Data | Endpoint | Output |
|---|---|---|
| Face colours | `/task/skin-tone-analysis` | skin, eye (+ name), brow, lip, hair (+ name), `face_quality` |
| Phototype | `/task/fitzpatrick-scale-analyzer` | I–VI |
| Redness | `/v2.1/task/skin-analysis` | `redness.raw_score` (SD) |

- Only the first skin-tone reading (photo as taken) may fail the request; lighting, the second
  reading, phototype and redness degrade to **null, shown as "not measured"**.
- `face_angle_strictness_level` sent as `high`; on an angle refusal, one retry at `medium` with
  the result marked approximate.
- **`raw_score`, never `ui_score`.** Inverted scale: higher = calmer.
- **Redness is not interpretable without the phototype** — a technical necessity, not a list item.
- Hair is shown as a category; never invented when missing.

### F3 · Colour simulation

sRGB → linearise → Machado 2009 matrix for the severity step → delinearise → sRGB. No LMS round
trip (Machado's matrices are expressed in linear RGB). 297 coefficients transcribed by
`scripts/gen-matrices.mjs`, sealed with SHA256; `npm run verify:matrices` checks them offline.
Tritan uses Machado too — a declared limitation.

### F4 · Confidence and the right to refuse

- **Faces:** measure before and after `/task/lighting`; the ΔE between them is the confidence.
  `measured` / `low_light` / `refuse`. `lightingDeltaE: null` = not verified, never 0.
- **Garments:** the lighting pass is NOT used (it moves fabric up to ΔE 20 from its true colour).
  Confidence comes from clipping, the 8-bit encoding floor, exposure and framing.
- A `low_light` garment degrades every verdict it takes part in.
- `refuse` has its own screen with a concrete instruction.

### F5 · Dual view

Every image and swatch can be compared as others see it and as the user sees it. Panels are told
apart by **label and border style, never colour**. With F18 on, the comparison shows the gain of
assisted contrast through the user's own vision; a button restores the true colours.

### F6 · Garment ingestion

Photo → client downscale → server conversion (EXIF rotation, flatten, 4:4:4 JPEG) →
`/task/sod` cut-out **used as a mask only** (our pixels, the engine's alpha) → dominant colour by
hue band, greys pooled and split only at a real valley in the lightness histogram → CIELAB →
name → confidence → IndexedDB. A patterned garment returns its dominant colour **and** says it is
patterned. ✅ `npm run harness:garment` asserts both directions.

### F7 · Persistent wardrobe

On the device, accessories included. Measurement is a one-off cost; comparisons are local.

### F8 · Colour families

Agglomerative clustering with single linkage in the user's simulated space, cut at ΔE 11.
Deterministic. "Your wardrobe has 4 colours to you, not 9."

### F9 · Duplicate alert

Same category only. Two warnings that must not be merged: `same_colour` (real ΔE < 5 — needs no
profile) and `indistinguishable` (simulated ΔE < 5 — needs a profile).

### F10 · Honest naming

The name is derived from the measured LCh (hue family + lightness/chroma modifiers), plus what
it collides with **for this user**: *"Olive green. To you it is nearly the brown of your
trousers — but 31% lighter, so you will tell them apart by light and dark."*

### F11 · Outfit traffic light

**Safe / Risky / Clashes** — always icon + text + shape.

1. Hue collision: `deltaEHue` (lightness equalised) in the simulated space < 11.
2. Rescue: WCAG contrast ≥ 1.8 → `risky` with `savedByLuminance`; ≥ 4.5 → `safe`.
3. A `low_light` measurement turns `safe` into `risky`.
4. The user's palette (skin and, when present, hair) is judged as part of the outfit.

### F12 · "Should I buy this?"

A garment photographed in a shop → its measured colour and confidence, how the user sees it,
which wardrobe pieces it goes with (a percentage counting only safe pairs), the verdict against
the user's face, the duplicate alert, and the try-on.

### F13 · Clothes try-on with verdict

`/task/cloth-v4` (MCP first, REST underneath). Category mapping: top → `upper_body`, bottom →
`lower_body`, dress → `full_body`, **outerwear → `outer`**. `filter_multi_person: normal`.
Bottoms need a worn photo — said before rendering. The verdict comes from the measurement, never
from the rendered pixels.

### F14 · Scarf and hat

`/task/scarf`, `/task/hat`. `gender` is asked at render time, never inferred or stored. These
engines restyle outfit and background (`style` defaults to `random`), so an alert sits **above**
the image and no colour is read from it.

### F15 · Corrector and foundation from measurement

The corrector colour is the measured skin's redness mirrored on the a* axis at the same lightness
— arithmetic, not a lookup. Foundation depth comes from the phototype, undertone from the
measured skin. **No redness threshold** decides anything: the per-phototype calibration that would
license one has not been done.

### F16 · Did the corrector work?

`/task/makeup-vto` renders the concealer (intensity 25, coverage 30 — a wash) on one image sized
for that endpoint; redness is measured on that same image before and after. The baseline is
optional; the render is not. The real check measures a photo taken after physically applying a
corrector. Measured: helps real redness (57.0 → 58.4), hurts calm skin (72.5 → 68.9) — both
shown.

### F17 · MCP

`/api/mcp` runs lighting (`creators`), face colour and phototype (`beauty`) over MCP with a
REST fallback per step, and shows the trace: server, tool, transport, time, fallback reason.
Production try-on runs MCP first on `fashion`. Tool names are resolved against `tools/list`; a
failure described inside a successful payload counts as a failure.

### F18 · Assisted contrast

LMS error redistribution (Fidaner, Lin & Ozgüven 2005), `k = strength × severity`, default
strength 0.55, a full-strength "read a label" preset. **A presentation filter only**: never
measured, never sent to YouCam, never used to name a colour — enforced by
`scripts/check-boundaries.mjs`. ✅ `npm run harness:daltonize`: no distinguishable pair becomes
indistinguishable.

### F19 · Whole outfits

Generated outfits contain **no clashing pair** (one collision discards the candidate), judged
against the user's palette, at zero API cost. User-assembled outfits are judged and never refused.
The outfit render chains `cloth-v4` passes, two pieces at most, and is kept so it is not paid for
twice.

---

## 5. Data model

The contracts live in `src/core/contracts/types.ts` (`CVDProfile`, `ColorPortrait`,
`MeasurementConfidence`, `Garment`, `PairVerdict`, `DuplicateAlert`, …). Everything is stored in
IndexedDB (`src/core/db/local.ts`): profile and portrait, garments, images as blobs, and small
internal flags. Only originals are stored; simulated and assisted views are derived at render.

---

## 6. The API surface

Endpoints, parameters, size windows, costs and traps are in `CLAUDE.md` §4 and
`docs/submission/api-findings.md`. All calls go through `src/core/youcam/` — never reimplemented.

---

## 7. The measurable experiment

**Repeatability under varied light** plus the **correct-refusal rate**: the same face and the same
garments photographed under several lights; publish the spread of the measured colours and how
often the app refused when it should have, and answered when it could.

---

## 8. The video (1–3 minutes)

See `docs/submission/video-script.md`. It must name the YouCam APIs used and show the app running
on a phone.

---

## 9. Risks and honesty

- **Integrity:** never present a number we did not measure. Figures not yet measured are left out.
- **Credits:** a run dry during judging breaks every measurement — `npm run credits` before
  demos; the error table tells the user plainly when it happens.
- **Rate limit:** one key serves every visitor; 429s are retried with backoff.
- **The platform's 60 s ceiling:** every route runs on a time budget below it.

---

## 10. References

- YouCam API documentation: https://docs.perfectcorp.com/develop/introduction
- Machado, Oliveira & Fernandes (2009), *A Physiologically-based Model for Simulation of Color
  Vision Deficiency*, IEEE TVCG 15(6).
- DaltonLens-Python (MIT © 2021 Nicolas Burrus): https://github.com/DaltonLens/DaltonLens-Python
- Fidaner, Lin & Ozgüven (2005), LMS daltonisation, Stanford Psych 221.
- Vingrys & King-Smith (1988), quantitative scoring of D-15 arrangement tests.
- WCAG 2.x contrast ratio.
