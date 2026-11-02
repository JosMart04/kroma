# KROMA

**You cannot see the colour of your own face. So you cannot tell whether that shirt
clashes, or whether your skin looks red today.**

KROMA measures it, tells you how sure it is, and refuses to answer when the light will
not let it know.

Built for the **YouCam API Skin AI & eCommerce VTO Hackathon** (Perfect Corp · Devpost),
and it answers both of its topics as one product: **Skin AI** reads the colours of the
user's own face, and **eCommerce VTO** puts the garment they are about to buy onto their
body — judged against that face and against the wardrobe they already own.

**Live:** https://kroma-aidrationbreak.vercel.app

---

## The idea, and why the API is irreplaceable here

Around 300 million people have colour vision deficiency. More than half are mild
deuteranomals who were never diagnosed, because their variant causes no darkening — so
KROMA never asks what you have. It measures it.

The thesis is one sentence: **a person with CVD cannot see the colour of their own face,
and therefore cannot make any decision that depends on it.** Not correcting redness, not
knowing what suits them, not telling a navy jumper from a dark purple one in their own
wardrobe. `skin-tone-analysis` returns that colour as a number. There, and only there, the
API does something no amount of local code can.

So the API is not used to beautify. It is used as **sensory substitution for a missing
channel** — and that is what makes every shopping decision in the app possible.

### The corollary that shaped every decision

Our user is the one person who **cannot audit our product**. If we name a colour wrong,
they have no way to catch it. That makes honesty structural rather than a promise:

1. **Every measurement carries a confidence level.**
2. **The app refuses when conditions do not allow a measurement.** `refuse` is a feature,
   not an error — *"I can't tell in this light"*.
3. **No language model decides anything.** Colour naming is a deterministic lookup. A model
   that says "olive green" about a brown garment is caught instantly by anyone else and
   never by our user.
4. **We never claim a check we did not run.** `lightingDeltaE: null` means "not verified"
   and is never rendered as `0`, which would mean "verified, perfect".

### The app starts empty, on purpose

Nothing is pre-loaded and nothing is simulated. You calibrate, take a selfie, and
photograph your own garments. **Every colour on screen was measured from your photo, on
your device.** Showing pre-baked data as if it were measured is exactly the failure this
product exists to prevent — so the cost of an empty first screen is one we pay, and the
three-step onboarding is the path through it.

---

## How to test it

Open **https://kroma-aidrationbreak.vercel.app** on a phone (it also works on desktop) and
follow the three steps on the home screen. No account, no login.

1. **Measure how you see colour** — a two-minute arrangement test plus a short
   odd-one-out test. People with typical colour vision get "no deficiency detected"; the
   rest of the app still works.
2. **Measure your face** — a selfie, straight on, in daylight from a window. You get your
   skin, eye, brow, lip and hair colours by name and hex, your phototype and redness, the
   confidence of the reading, and a colour corrector computed from your own skin.
3. **Add a garment** — photograph a piece of clothing on a plain surface. KROMA names its
   colour, warns about duplicates you could not tell apart, and judges it against your face.

Then try **Should I buy this?** (a garment photographed in a shop, judged before you buy
it), **Try it on** (the garment rendered onto your photo), **Get dressed** (complete outfits
with no clashing pair), and **See it on your face** (the corrector rendered, then its
effect on your redness measured).

Everything is stored only in your browser. **Start over** on the home screen erases it.

---

## Where the YouCam API is used

Ten endpoints across six route handlers. Every call is server-side; the key never
reaches the browser.

| Route | Endpoint | What it contributes |
|---|---|---|
| `/api/portrait` | `/task/skin-tone-analysis` **×2** | skin, eyes, brows, lips and hair — raw and light-normalised |
| | `/task/lighting` | normalises the light; the gap between the two readings **is** the confidence |
| | `/task/fitzpatrick-scale-analyzer` | phototype I–VI |
| | `/v2.1/task/skin-analysis` | `redness.raw_score` — uninterpretable without the phototype |
| `/api/garment` | `/task/sod` | isolates the garment from what it is lying on |
| `/api/tryon` | `AI-Clothes-Virtual-Try-On` (MCP) → `/task/cloth-v4` | renders one garment onto the user's own photo |
| | `/task/scarf`, `/task/hat` | the accessories that frame the face |
| `/api/outfit` | the same, **chained** | the person comes back wearing the top, and that goes back in as the body for the trousers |
| `/api/makeup` | `/task/makeup-vto` + `/task/skin-analysis` | F16 — renders the computed corrector, then re-measures the redness |
| `/api/mcp` | lighting, face colour and phototype **over MCP** | F17 — an audited run that shows which transport each step took |
| all | `/s2s/v2.0/file` | upload, then the `PUT` everyone forgets |

Both topics are covered: **Skin AI** (skin tone, Fitzpatrick, skin analysis) and
**eCommerce VTO** (clothes, scarf, hat and makeup try-on).

**Where it is deliberately *not* used**, which is the other half of the argument: the
measured colour of a garment comes from our own pixels; its name from a deterministic
table; the CVD simulation from published Machado 2009 matrices; every verdict from local
arithmetic; and the calibration (F1) touches no API at all.

### Integration details that matter

- **Head angle.** The colour analyser refuses a face turned more than 10° by default
  (`face_angle_strictness_level: high`). KROMA sends that level explicitly, and on an
  angle refusal retries once at 15° (`medium`) — labelling the result approximate rather
  than refusing a photo that looks straight-on to the person holding the phone.
- **Framing for skin analysis.** The skin analyser wants the face over 60% of the image
  width, stricter than anything else in the API. When it says the face is too small, the
  makeup check retries on a tighter crop — cropping selects pixels and cannot move a colour.
- **One person in the try-on.** `cloth-v4` runs with `filter_multi_person: normal`, so a
  friend standing beside you is never the one dressed.
- **Image sizes per endpoint.** Every upload is converted server-side (EXIF rotation,
  flatten onto white, JPEG with 4:4:4 chroma) to a size window that fits all endpoints;
  `makeup-vto` gets its own, smaller one. `npm run harness:upload` asserts both.
- **Polling inside the platform's limits.** Each request runs on a time budget below
  Vercel's 60 s ceiling, so a slow task is abandoned in time to log its id; a `429` is
  retried with backoff before the user is told the service is busy.

---

## Four things we measured that shape the product

Not opinions. Each of these is a measurement, and each one decided how a part of KROMA works.

### 1. The lighting pass normalises faces. It damages garments.

The confidence layer compares a raw reading against a light-normalised one. On a **face**
that works — observed gap ΔE 0.5–0.7, a real colour cast removed. On a garment it does not.
One garment, five lights, measured on the real endpoint:

| photo | raw→normalised ΔE | verdict it would produce |
|---|---|---|
| even daylight, true colour | 16.9 | **refuse** ← the best photo in the set |
| strong folds, true colour | 1.2 | measured |
| warm bulb, colour really shifted | 5.9 | low_light |
| cold cast, colour really shifted | 14.9 | refuse |
| underexposed | 22.6 | refuse |

The signal is not weak, it is unrelated: it refuses the good photos and passes a bad one.
On that daylight shot the normalisation moves the garment from **ΔE 1.8 to ΔE 20.2** away
from its known true colour — the engine relights scenes, and flat fabric is not a scene.
So `/task/lighting` runs in the portrait path only, and garment confidence is built from
what we can defend on our own pixels: clipping, the 8-bit encoding floor at that
lightness, exposure and framing.

### 2. Shading is not a second colour

Binning fabric pixels by anything that varies with lightness splits one plain colour into
several groups, and a plain orange T-shirt reads as *"37% dominant — patterned"*. It is not
patterned; it has folds.

Shading is a **continuous ramp**; a print is a **gap**. So garment pixels are grouped by
hue, the ones too grey to have one are pooled, and that pool splits only at a real valley
in the lightness histogram. The same shirt reads **99% dominant, solid**.

`npm run harness:garment` builds garments whose colour is known by construction, under
shading harsher than any real photo, and asserts **both** directions — solid must not read
as patterned, and patterned must not read as solid. Calling everything solid would blind
the one person who cannot see the print.

### 3. MCP and REST do not return the same number

Same image, same `file_id`, both transports: skin agrees within **ΔE 1.0** (below
perception, irrelevant) and the iris differs by **ΔE 6.4**, which is plainly visible.

A user routed one way would be told a different eye colour than a user routed the other,
and **could not detect the inconsistency**. So REST owns every measurement that feeds a
verdict, and MCP does the orchestration — visibly, with the transport of each step shown
on screen.

### 4. Hair colour is a category, not a reading

The analyser's documented schema allows exactly seven preset hex values for hair, one per
hair category, while skin, eyes, brows and lips come back as free measured values. Shown
side by side without comment, a category would pass as a measurement — the kind of
difference our user cannot see. So the portrait labels hair as *a colour category, not a
measurement*, and when the engine returns no hair colour, none is invented and none enters
an outfit verdict.

---

## F18 · Assisted contrast — the feature that follows from taking the user seriously

A dual panel that shows **"others see" beside "you see"** — the photo next to a
simulation of colour blindness — is the easy part, and web simulators have done it for
years. Shown **to the colour-blind person**, it gives them nothing:

> **When they look at the screen, they are already seeing that.** Their eyes do
> the simulation. Computing it and handing it back returns what they were
> already looking at.

So KROMA does the opposite. It takes the difference between what is there and what they
perceive — which is exactly the information they are losing — and re-injects it into the
channels their vision does process. No colour is invented; the information is moved to the
only route that can carry it. The technique is the canonical one,
[Fidaner, Lin & Ozgüven (Stanford Psych 221, 2005)](http://www.daltonize.org/2010/05/lms-daltonization-algorithm.html),
reusing the same linearised pipeline as the simulation.

**Both panels are shown through the user's own vision**, and that is what makes the feature
demonstrable. Putting the true photo beside the assisted one proves nothing to anybody who
can already see colour — they could read both sides, so all they notice is that a colour
moved. Simulating both shows the *gain*: on the left the text hidden in a pattern stays
hidden, on the right it becomes legible. A sighted person sees the point in two seconds,
and the colour-blind user loses nothing, because the left panel is what their eyes were
doing to the original anyway. A button restores the true colours for anyone who needs to
check what the thing actually is.

**Measured**, in the user's own simulated space, across three observer types and four
garment pairs (`npm run harness:daltonize`):

| pair, for a full deutan | seen apart | gentle | full strength |
|---|---|---|---|
| signal red vs olive | 2.0 | 14.8 | **25.5** |
| forest green vs brown | 6.1 | 4.5 | **11.5** |
| navy vs dark purple | 1.0 | 2.1 | 3.0 |

Two honest findings sit in that table. **The effect is not monotonic** — some pairs move
closer at gentle strength before they move apart, which is why the strength is adjustable
and why a full-strength *"read a label"* preset exists for text hidden in a pattern. And
**it is a trade**: one global transform takes range from where there is plenty and gives it
to where there is none, so well-separated pairs do compress. The harness asserts the
property that matters — **no pair that was distinguishable becomes indistinguishable**.

⚠️ **It never touches measurement.** Assisted contrast moves colours *away* from the truth;
the lighting pass moves them *towards* it. `check-boundaries.mjs` fails the build if any API
route imports the filter, because measuring our own distortion would hand a false colour to
the one person who cannot detect it. The original is always on screen, the altered panel
says it is altered, and **the reference truth is the measured name, not the pixel** — the
pixel is for telling colours apart, the name is for knowing what they are.

State of the art we did **not** implement, and know we did not: naturalness-preserving
mass-spring optimisation (Kuhn, Oliveira & Fernandes, IEEE TVCG 2008), content-dependent
recolouring (Shen et al., IET Image Processing 2021) and gradient-domain daltonisation —
the last two would fix the compression trade.

---

## F19 · Get dressed — whole outfits, already checked

Answering *"do these two clash?"* still leaves the user doing the work: holding a wardrobe
in their head and checking it pair by pair — precisely the task their vision makes
unreliable, and precisely why they end up asking a partner or a flatmate every morning.

`/outfits` hands over complete outfits with no clashing pair, judged against the palette
they wear on their own face, with the headline the product is for: **you can put any of
these on without asking anyone.**

**Zero API cost, and that is an argument rather than a detail.** Every colour was measured
once, when the garment was photographed. The pairwise verdicts are computed once — 25
garments give 300 comparisons — and combinations become lookups. **The wardrobe does not
multiply the cost of the product; it amortises it.**

### What it refuses to do

- **It never suggests a clash.** One collision discards the whole candidate. That is what
  makes the headline a statement about the data.
- **It never invents a check it did not run.** No portrait means no verdict against skin
  and hair, and the card says so instead of describing a smaller check in confident words.
- **It never silently drops a garment.** Anything wearable that no suggestion uses gets its
  best outfit swapped in — and whatever still cannot appear is explained by name: nothing
  to pair it with, collides with every one of your shoes, or simply outranked.
- **It does not suggest accessories.** A belt, tie or socks have no try-on; the scarf and
  hat engines restyle the outfit and background by design (measured: a flat magenta
  reference comes back a crimson patterned scarf in front of the Colosseum, ΔE 31.4).
  Suggesting what we cannot render honestly is no service to someone who cannot check it.
  They still count in every verdict, and the user can add them deliberately.

### Outfits the user assembles

Many people with CVD already own outfits that work because someone they trust put them
together — a parent, a partner — and wear them because they are known-safe rather than
chosen. A product that only proposes its own combinations offers no way to check the one
they actually rely on.

So `judgeOutfit` **never refuses**. A custom outfit containing a real collision comes back
marked and explained, not hidden. Telling someone their trusted outfit has a problem is the
job; declining to look at it is not. Saved outfits persist locally, with their render.

### The outfit on the body

`cloth-v4` dresses one garment at a time, so an outfit is built by feeding each render back
in as the next body. **Two pieces**, and the ceiling is the reason: Vercel's free plan caps
a request at 60 s, a render is ~25 s, and each pass needs its own upload. Timing out after
spending units is the worst outcome available.

The render is **kept and reused**. That is a spending decision, not a cache: each pass costs
2 units, so re-rendering an unchanged outfit every time the panel opens would quietly bill
the user for looking at it. The cost is stated before the button, and the picture is shown
through the same dual view as every other image in the app.

---

## F17 · MCP, and what it is trusted with

The Model Context Protocol is used through the official SDK over Streamable HTTP, with the
same key as REST, sessions opened server-side so the credential never reaches the browser.

| Server | Tools | Where it runs | Role |
|---|---|---|---|
| `fashion` | 19 | `/api/tryon`, `/api/outfit` | **Production.** Every clothes try-on goes MCP first, with REST underneath |
| `beauty` | 50 | `/api/mcp` | Audited run: face colour and phototype, each with a REST fallback |
| `creators` | 37 | `/api/mcp` | Audited run: photo lighting, discovered by name at run time |

**Measurements stay on REST.** Face colour, phototype, redness, lighting and the makeup
render whose redness is compared before and after all feed a verdict, and the transports
disagree visibly on the same image (finding 3). So MCP renders garments — where no verdict
is read from the pixels — and the measurement tools are exercised in a run that shows,
step by step, which transport answered.

**Tool names are resolved, not assumed.** The live servers spell tools with hyphens
(`AI-Clothes-Virtual-Try-On`) while the documentation lists underscores
(`AI_Clothes_Virtual_Try_On`), so names are matched against the server's own `tools/list`
ignoring separators and case. The lighting tool is found by pattern; a tool the server does
not offer is reported as such rather than hidden inside a fallback.

**Failures are read from the payload.** These servers can answer a failed task with a
perfectly successful MCP response whose text describes the failure (`CreditInsufficiency`,
for one). A step only counts as done when the payload shows real work.

**The trace is the feature.** A fallback nobody can see is a claim nobody can check, so
every step reports which server answered, over which transport, how long it took, and — if
it fell back — why, including on runs that fail. The screen derives which servers were
reached from that trace, never from a hand-written list.

---

## Cost and latency

Unit costs come from the paginated `/credit/feature-cost` price list (all six pages, 103
SKUs — `npm run cost` regenerates [`feature-cost.json`](docs/submission/feature-cost.json)).
Reading prices and the balance is free.

| Operation | Units |
|---|---|
| Facial Color Tones Analyzer (`/task/skin-tone-analysis`) | **20** |
| Fitzpatrick Skin Type (`/task/fitzpatrick-scale-analyzer`) | **10** |
| Skin Analysis v2.1, 1–4 SD concerns | **9** |
| Photo Lighting (`/task/lighting`) | **2** |
| Background removal (`/task/sod`) | **1** |
| Clothes try-on (`/task/cloth-v4`) · scarf · hat | **2** each |
| Makeup try-on (`/task/makeup-vto`) | **1** |

A full colour portrait is about **61 units** — 40 of them are the two face readings whose
gap *is* the confidence score. A garment costs 1, a try-on 2, the makeup check about 19
(the render plus a redness reading before and after). Units are charged only when a task
succeeds. `npm run credits` prints the balance.

Wall-clock latency, measured end to end against the live API:

| Journey | API tasks | Time |
|---|---|---|
| Colour portrait | 5 | ~22 s |
| One garment | 1 | 13–19 s |
| One try-on | 1 | 14 s in production, 24 s locally |

---

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
```

With `YOUCAM_MOCK=true` (the default) no API call is made and no units are spent. To run
against the real API, put your key in `.env.local`:

```bash
YOUCAM_API_KEY=your_key_here
YOUCAM_MOCK=false
```

A key comes from [yce.perfectcorp.com/ai-api](https://yce.perfectcorp.com/ai-api) → API
Console → API Keys. ⚠️ **The secret is shown once, when you create it.** Close the tab
without copying it and you have to generate another.

⚠️ `.env.local` is gitignored and the key never gets a `NEXT_PUBLIC_` prefix. It is read
only in route handlers, so it never reaches the browser.

Free helpers that read the live API without spending units:

```bash
npm run credits
```

```bash
npm run cost
```

```bash
npm run probe:mcp
```

### Checks

```bash
npm run check
```

```bash
npm run verify:matrices
```

```bash
npm run harness:calibration
```

```bash
npm run harness:garment
```

```bash
npm run harness:daltonize
```

```bash
npm run harness:upload
```

`verify:matrices` re-validates the 297 Machado 2009 coefficients offline against a sealed
SHA256. The harnesses put synthetic observers, synthetic garments and pathological image
shapes through the real code and assert what comes back — including the negative cases,
because it is trivial to "fix" a refusal by refusing nothing.

---

## Stack

Mobile-first web app and PWA, 375 px baseline. **No native app, no database, no accounts.**

Installable on Android, desktop and iOS: manifest, icons and a service worker that
deliberately caches nothing — the app is judged from a live URL, and a cached app shell
could serve someone a stale build after a fix with no way to know. Replacing the two PNGs
in `public/` swaps the icon; no code changes.

Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · IndexedDB (`idb`) · `culori`
for CIELAB and CIEDE2000 · `sharp` server-side · Vercel.

**There is no database and that is deliberate.** The project has to be available free of
charge and without restriction to the judges until the end of judging. A login means a
judge creates an account and lands in an app that is empty anyway, because the wardrobe is
theirs. Everything lives in IndexedDB, in their browser.

---

## What we found in the API, written up for Perfect Corp

Everything verified against the live API and the live MCP servers — the per-endpoint size
windows, the parameters that decide whether a selfie is accepted, the paginated price list,
failures described inside successful MCP responses, and a transport disagreement nobody
could detect — is written up as a report **for Perfect Corp**, with the engineering
workarounds and what we would change:

**→ [`docs/submission/perfect-corp-dossier.md`](docs/submission/perfect-corp-dossier.md)**

A shorter, integrator-facing version is in
[`docs/submission/api-findings.md`](docs/submission/api-findings.md).

---

## How the colour engine is built, and how we prove it

The part of this product that cannot be wrong — simulation, distance, naming, verdicts,
assisted contrast — together with the offline harnesses that verify it:

**→ [`docs/submission/colour-engine.md`](docs/submission/colour-engine.md)**

---

## Known limitations

Declared in full in [`docs/submission/limitations.md`](docs/submission/limitations.md),
because declaring the limits is the same argument the product makes. In short:

- **Tritanopia uses Machado 2009**, which its own source says is not the right model for
  that case. Protan and deutan — where the product is decided — use it as published.
- **We cannot detect a colour cast on a garment photo.** Separating the light from the
  fabric needs a surface of known colour in the frame, and a user photographing their
  wardrobe has none. That is physics, not a gap in effort.
- **We do not say how much redness is "a lot".** The per-phototype calibration that would
  license a threshold has not been done, so the measured score is reported on its own scale
  and left ungraded. What F15 answers is *which colour* cancels it, which is arithmetic on
  a measured face.
- **Trousers and skirts need a photo of them being worn** for the try-on. The engine
  supports the lower body only from worn outfits, not flat product shots, and the screen
  says so before the render.
- **The outfit render chains two pieces, not more.** A third pass does not fit inside
  Vercel's 60 s request ceiling. Accessories are excluded from renders entirely — see F19.
- **Colour simulation matrices are transcribed mechanically**, not typed by hand, from
  DaltonLens-Python (MIT © 2021 Nicolas Burrus), originally Machado, Oliveira & Fernandes
  (2009), IEEE TVCG 15(6), Table 1.
