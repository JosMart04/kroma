# KROMA — project context

> **Read this before writing code.** It is loaded automatically by any Claude
> agent working in this repo.

---

## 1. What this is, and why

An app for people with **colour vision deficiency** that tells them what colour
*they* are, and what goes with it.

**The thesis, in one sentence:** a person with CVD cannot see the colour of their
own face, and therefore cannot make any decision that depends on it — not
correcting redness, not knowing what suits them. The YouCam API returns that
colour as a number. There, and only there, the API is irreplaceable.

**The corollary that shapes every decision:** our user is the one person who
**cannot audit our product**. If we name a colour wrong, they have no way to
catch it. That makes honesty a structural requirement, not a promise. Three
non-negotiable rules follow:

1. **Know how good the conditions were before trusting a measurement** — and
   verify that per input type. For the face that means normalising the lighting;
   for garments it does not (see §3, measured).
2. **State a confidence level with every measurement.**
3. **Refuse explicitly when the conditions do not allow a measurement.** The
   `refuse` state is not an error: it is a product feature.
4. **Never claim a check we did not run.** `lightingDeltaE: null` means "not
   verified" and must never be rendered as `0`, which means "verified, perfect".

Built for the **YouCam API Skin AI & eCommerce VTO Hackathon** (Perfect Corp ·
Devpost), covering both of its topics. Submissions close **2 November 2026,
11:45 ET**; judging runs 3–20 November, and the live app must stay free and usable
for judges until judging ends.

### The app starts empty, on purpose

Nothing is pre-loaded and nothing is simulated. The user calibrates, takes a
selfie and photographs their own garments. **Every colour on screen was measured
from their photo, on their device.** Showing pre-baked data as if it were
measured is exactly the failure this product exists to prevent.

The cost is that someone who does not know what to do sees nothing. That is paid
for by the guided three-step onboarding on the home screen — it is not a menu,
it is a path.

---

## 2. Language

**Everything in English**: UI copy, identifiers, comments and docs. A judge who
does not read Spanish cannot evaluate the interface, and Design is 25% of the
score.

---

## 3. Domain rules that apply everywhere

These are corrections to real mistakes already made, or research findings that
change the product.

### Colour is never the only carrier of meaning

We are building **for people who do not perceive colour well**. If a state
depends on green/amber/red, our own user does not receive it. Meaning travels in
**icon + text + shape**; colour is decoration. This applies to the dual view too:
panels are told apart by label and border style, never by colour.

### `raw_score`, never `ui_score`

Perfect Corp's own documentation admits `ui_score` is adjusted upwards as a
"psychological motivator". For a product whose whole argument is that the user
cannot detect us lying, using the raw value is not optional.

⚠️ **Inverted scale:** in `skin-analysis`, **higher = better condition**. A
`redness.raw_score` of 72 is **not** "72% redness".

### Lightness is the channel that survives

Two colours can be indistinguishable in **hue** for the user and still be
perfectly separable by **lightness**. The verdict must account for it
(`savedByLuminance` in `PairVerdict`). Flagging those cases as a collision
produces constant false alarms, and a product that over-warns stops being used.

⚠️ Collision is measured on **hue with lightness equalised** (`deltaEHue`), not
on full CIEDE2000. Using the full distance made the two conditions mutually
exclusive and `savedByLuminance` was unreachable — verified over 130,816 pairs.

### Shading is not a second colour

A photograph of fabric is mostly shadow. Grouping garment pixels by anything
that varies with lightness splits one solid colour into several groups, and a
plain orange t-shirt gets reported as *"37% dominant — patterned"*. Both naive
readings shipped bugs a user caught: the centre of the frame (a printed tee came
back as the colour of its print) and Lab cells by area.

Group by **hue**; put pixels too grey to have one into a single neutral pool and
split that pool **only at a real valley** in the lightness histogram. Shading is
a continuous ramp and has no valley; a print or a stripe does. `looksPatterned`
is then decided by whether a **second** group is large — never by the dominant
group's share, which shading drags down on perfectly plain garments.

⚠️ Verify against `scripts/garment-harness.mjs`, which builds garments whose colour is known by
construction under shading harsher than any real photo, and asserts both
directions. Solid-called-patterned is the failure users notice.

### The lighting pass normalises faces. It damages garments.

The confidence layer compares a raw reading against a light-normalised one, and
on a **face** that works — observed gap ΔE 0.5–0.7, a real cast removed. On
**garments** it is worse than uninformative. Measured on the real endpoint, one
garment under five lights:

| photo | raw→normalised ΔE | what the layer would have said |
|---|---|---|
| even daylight, true colour | 16.9 | **refuse** ← the best photo in the set |
| strong folds, true colour | 1.2 | measured |
| warm bulb, colour really shifted | 5.9 | low_light |
| cold cast, colour really shifted | 14.9 | refuse |
| underexposed | 22.6 | refuse |

And on that daylight shot the normalisation did not correct the colour, it
destroyed it: **ΔE 1.8 from truth as taken, ΔE 20.2 after normalising.** The
engine relights scenes and faces; pointed at flat fabric it "fixes" what was not
broken. So the gap measures what the engine did, not what the light did.

`/task/lighting` therefore runs in the **portrait** path only. Garment
confidence comes from what we can defend on our own pixels: clipping, the 8-bit
encoding floor at that lightness, exposure, and framing — see
`src/core/color/confidence.ts`.

⚠️ **Without a surface of known colour in the frame, the illuminant is not
recoverable.** That is physics. We do not claim to detect a colour cast on a
garment photo, and no future "smart white balance" may claim it either.

### Measurement and presentation are opposite operations

`/task/lighting` moves a photo **towards** the true colour so it can be
measured. Daltonisation (F18, `src/core/color/daltonize.ts`) moves colours
**away** from the truth on purpose, so a person who cannot separate them can.
Opposite intentions; they must never share a pipeline.

> **Assisted contrast is never measured, never sent to YouCam and never used to
> name a colour.** `scripts/check-boundaries.mjs` fails the build if anything
> under `src/app/api/` imports it.

⚠️ **For a colour-blind user the ORIGINAL is already their view** — their eyes
do the simulation. Showing them a computed simulation returns what they were
already looking at. So the default right-hand panel is the DALTONISED one, and
the simulation moved behind "show someone", where it is a communication tool
for a sighted person.

⚠️ **The reference truth is the measured NAME, not the pixel.** The pixel is for
telling colours apart; the name is for knowing what they are.

### The pair that actually gets confused is blue/purple, not red/green

In red-green CVD a blue reads as purple and vice versa. It matters far more in
clothing, because navy and dark purple are both **formal** garment colours, while
signal red and forest green rarely coexist in a real wardrobe.

### Most users do not know what they have

More than half the target population are **mild deuteranomals**, undiagnosed for
decades because their variant causes no darkening. So we **never ask the user to
pick their CVD type**: we measure it. Asking is asking for the answer they came
for.

### Never invent colour simulation matrices

The 297 values live in `src/core/color/matrices.generated.ts`, produced by
`scripts/gen-matrices.mjs`. They are not hand-edited: regenerate with
`npm run gen:matrices`, which revalidates and re-seals the source SHA256.
`npm run verify:matrices` checks integrity **offline**.

| Project | Licence | What it actually contains |
|---|---|---|
| [libDaltonLens](https://github.com/DaltonLens/libDaltonLens) (C) | Public domain | Brettel 1997 and Viénot 1999. `machado` appears **0 times** |
| [DaltonLens-Python](https://github.com/DaltonLens/DaltonLens-Python) | MIT © 2021 Nicolas Burrus / DaltonLens | `machado_2009_matrices` ← **ours come from here** |

Primary source of the numbers: Machado, Oliveira & Fernandes (2009), IEEE TVCG
15(6), Table 1.

⚠️ **Tritan uses Machado too**, which is not the right model for that case. It is
a conscious, declared decision — see `docs/submission/limitations.md`.

### Never invent numbers

If you need an impact figure and have not measured it, **leave it out**. Three
invented figures already nearly shipped in a draft.

---

## 4. YouCam API traps

All verified against the real API with a live key. **They are encapsulated in
`src/core/youcam/`: use it, do not reimplement any of this.**

| Trap | Consequence if ignored |
|---|---|
| **The File API does not upload the file.** It returns a pre-signed URL; you must `PUT` to it | `500 unknown_internal_error` or a bare `404`. The first hour every team loses |
| **Polling is mandatory and abandoning it still bills you.** The task expires if you do not poll | `InvalidTaskId`, **and the units are consumed anyway** |
| **The result URL lives 2 hours** | Download the binary the moment the task succeeds. Never store the link |
| **`cloth-v4`, not `cloth`.** `/task/cloth` is the old V2.0 engine | You silently lose `auto` mode and fabric realism |
| ⚠️ **The outerwear value is `outer`, not `outerwear`.** Accepted: `full_body`, `upper_body`, `lower_body`, `shoes`, `auto`, `outer`. `outerwear` returns 400 | Our wardrobe keeps `outerwear` as a category; `core/youcam/tryOnCategory.ts` maps it to `outer` |
| ⚠️ **`filter_multi_person` defaults to `off`** in `cloth-v4` — the engine then dresses the largest person in frame. We send `normal`, which rejects with **`error_multi_person`** (not `error_multiple_people`) | A friend beside you gets dressed instead of you |
| ⚠️ **Lower-body try-on needs a worn photo.** The documented reference spec supports trousers and skirts only as worn outfits, not flat product shots | A plausible but wrong render; the UI warns before rendering a bottom |
| ⚠️ **`fitzpatrick` requires `version: "1.0"`**, which appears in no example | 400 `version is required`. And the phototype comes back as a **Roman numeral string** (`"III"`) in `fitzpatrick_scale`, not a number in `skin_type` |
| ⚠️ **Use the short paths.** `/task/lighting` (not `photo-lighting`), `/task/sod` (not `background-removal`), `/task/makeup-vto` (not `makeup`, which is 404). The paginated price list names every real endpoint in `run_task_url` | `lighting` is what normalises light *before* measuring — the basis of the confidence layer |
| ⚠️ **`/credit/feature-cost` is paginated, 20 SKUs per page.** Follow `next_token` (6 pages, 103 SKUs). The balance is `/s2s/v1.0/client/credit` — a different version prefix | Page 1 alone lists none of the Skin AI or try-on SKUs, and every cost conclusion drawn from it is wrong |
| ⚠️ **`face_angle_strictness_level`** on the colour analyser: `strict` · `high` (10°, default) · `medium` (15°) · `low` · `flexible`. Send it explicitly on REST and MCP | The MCP schema declares its default as `null`; an implicit level is one more way two transports can disagree |
| ⚠️ **`hair_color` is an enum of seven preset hex values** — a category swatch, not a measurement like skin, eyes, brows and lips | Presenting a category as a reading to the one user who cannot tell |
| **PNG with alpha → JPG:** flatten onto white | Alpha rasterises to **black** and the try-on is a disaster |
| **`chromaSubsampling: '4:4:4'`** | The default 4:2:0 averages chroma in 2×2 blocks: noise injected into the one variable we sell |
| **Apply EXIF rotation** (`sharp().rotate()`) before resizing | Every portrait phone photo arrives rotated 90°, and you get `error_no_face` on an image that looks fine in your viewer |
| **SD and HD concerns do not mix** in `skin-analysis` | Guaranteed `invalid_parameter` |
| ⚠️ **`skin-analysis` has its own framing vocabulary AND the strictest rule in the API:** `error_src_face_too_small` / `error_src_face_out_of_bound`, and the face must exceed **60% of the image width** | A selfie the colour portrait accepted is refused one screen later. Neither code resembles the colour analyser's `error_face_position_*`, so both hit the generic fallback |
| **Rate limit is doubled:** 250/300s per IP **and** per token — and the token is shared by every visitor of the deployment. `client.ts`/`poll.ts` retry a 429 with backoff, then raise `RateLimited` | The 429 looks random |
| ⚠️ **Polling must stop before Vercel's 60 s kill.** Routes run inside `withBudget()` (`core/youcam/budget.ts`); `pollTask` gives up early enough to log the taskId | The function dies mid-poll, no taskId is logged, and the unit may already be spent |
| ⚠️ **The Playground resizes your image for you. Your app does not.** The docs say so in step 1 and the size window differs per endpoint | An image that measures fine in the Playground is rejected from your code, and the reason is a bare code two servers away |
| ⚠️ **`error_face_angle_invalid`** — the phototype and makeup engines' single code for every head angle, where the colour analyser names a direction. Tolerance: **10° of straight on** | It hits the generic fallback, the user retries the same pose, and gets the same refusal |
| ⚠️ **MCP tool names: the servers use hyphens, the docs use underscores** (`AI-Clothes-Virtual-Try-On` vs `AI_Clothes_Virtual_Try_On`). `core/mcp/client.ts` resolves names against `tools/list`, ignoring separators | A hardcoded spelling breaks the day the other one ships |
| **`gender` is required** for shoes/scarf/hat/bag | Unclear error, absent from the generic examples |

**Mock mode:** with `YOUCAM_MOCK=true` (the default) no API call is made and no
units are spent. Develop that way unless validating a real integration.

⚠️ **`YOUCAM_API_KEY` never gets a `NEXT_PUBLIC_` prefix**, and never goes in
`.env.example` — that file is committed. It goes in `.env.local`, which is
gitignored.

---

## 5. How this is judged

A pass/fail **Stage One** first: the project must reasonably fit the theme and
reasonably apply the required YouCam APIs — not a surface-level wrapper. Then four
criteria at **25% each**, all asking for clear **consumer or eCommerce value** and
a YouCam API from the Skin, Beauty, Fashion, Jewelry & Watch or Hair & Beard
category.

| Criterion | What it means for the code |
|---|---|
| **Technological Implementation** | Deep, non-trivial integration. Redness × Fitzpatrick is a *technical necessity*: redness is not interpretable without the phototype |
| **Design** | "A complete product experience, not a proof of concept." Loading, error and empty states. The actionable error table in `core/youcam/errors.ts` is the best effort-to-score investment in the project |
| **Potential Impact** | A specific, credible case, demonstrated. Measured numbers, not adjectives |
| **Quality of the Idea** | Creative, **non-obvious** use. The API is not used to beautify, but as **sensory substitution for a missing channel** |

**When torn between finishing one more feature and polishing what exists: polish.**

---

## 6. Stack and conventions

**Mobile-first web app + PWA. No native app, no database.**

| Piece | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) | One deployable. Route handlers keep the API key out of the browser |
| Language | TypeScript, strict | |
| Styling | Tailwind v4 | Speed |
| **Persistence** | **IndexedDB (`idb`)** | No accounts, no login, no external service |
| Colour | `culori` | Correct Lab and CIEDE2000 matter here more than anywhere |
| Server images | `sharp` | The `flatten` + `4:4:4` + `rotate` traps |
| Deploy | Vercel | Free, instant, public URL for the judges |

### Why there is no database

The rules require the project to be available "free of charge and without any
restriction" to judges until judging ends. A login means a judge creates an
account and lands in an empty app. And Vercel's filesystem is ephemeral, so
SQLite is out.

⚠️ **`src/core/db/local.ts` is client-only.** Never import it from a Server
Component or a route handler. `scripts/check-boundaries.mjs` enforces this.

### Platform rules

- **Mobile-first, 375 px baseline.** Touch targets ≥ 44 px. It is used phone-in-hand.
- Photo capture is `<input type="file" accept="image/*" capture>` via
  `core/ui/CameraInput.tsx` — no `getUserMedia`.
- Server Components for static reads; Route Handlers in `app/api/` for anything
  touching the YouCam API.
- **No global state manager.** React state and Context are enough.
- File naming: `PascalCase.tsx` for components, `camelCase.ts` for logic.
- `src/core` must never import from `src/features`.

### Before committing

```bash
npm run check               # boundaries + typecheck + lint
npm run verify:matrices     # matrix integrity, offline
npm run harness:calibration # F1 still measures what it claims
npm run harness:daltonize   # F18 still separates what it claims to separate
npm run harness:garment     # F6/F10 still read a known colour, and still tell
                            # a fold from a print in both directions
npm run harness:upload      # every shape we send still lands inside the size
                            # window each endpoint documents
```

---

## 7. Reference documents

| File | What it holds |
|---|---|
| `docs/00-SPECIFICATION.md` | The features with acceptance criteria. **Source of truth for scope** |
| `docs/01-ARCHITECTURE.md` | Why the repo is laid out this way |
| `docs/03-CUT-LADDER.md` | What gets cut, and in what order |
| `docs/04-LLM-POLICY.md` | **Read before adding any AI** |
| `docs/05-HACKATHON-CONTEXT.md` | The hackathon's rules, requirements and criteria |
| `docs/submission/` | Submission material: API findings, costs, limitations, MCP, video script |

---

## 8. LLM policy (summary — detail in `docs/04-LLM-POLICY.md`)

> **An LLM may DRAFT. Never DECIDE.**
> No figure, colour, name or verdict comes out of a language model.

**Our user cannot detect a hallucination.** If a model says "olive green" and the
garment is brown, anyone else sees it instantly; they do not. That is precisely
the failure this product exists to prevent.

Naming a colour is a nearest-neighbour lookup against a named-colour table:
deterministic, auditable, instant and free.

F17 (MCP) is a fixed sequence, not an agent: the order is known — you cannot
render onto a face you have not measured — so no model chooses it. If an LLM is
ever added, it drafts copy, runs with a spend cap and has a deterministic fallback.

This is not a limitation to apologise for, it is a design argument: "our
evaluator is deterministic and auditable because our user cannot detect an
error" is a better pitch than any model boast.
