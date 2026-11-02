# The colour engine, and how we prove it

### Reference document — the part of KROMA that cannot be wrong, and the machinery that keeps it honest

> Written as source material for reports, dossiers, pitches and posts. Every
> number is reproducible from this repository with the commands given.

---

## Why this deserves its own document

Every other feature of KROMA can be checked by the person using it. This part cannot.

A user with colour vision deficiency looks at a swatch we labelled *"olive green"* and has
no way to know we meant *"chocolate brown"*. They look at a dual-view panel and cannot tell
whether the right-hand image is genuinely more separable or just different. They read
*"these two are safe together"* and cannot audit the claim.

**So this is the one place where being approximately right is the same as being wrong**, and
it is why the colour engine got a disproportionate share of the engineering effort.

Four rules govern everything below:

1. **Nothing is invented.** Where a number comes from published research it is transcribed
   mechanically and sealed. Where it is our own design decision it is labelled as one.
2. **Measurement and presentation never mix.** They are opposite operations and share no
   code path — enforced by a build script, not by discipline.
3. **Every threshold comes from an existing standard** or is derived from data, never picked
   because it looked right.
4. **Assertions run in both directions.** It is trivial to eliminate a false alarm by never
   alarming. The harnesses check that too.

---

# Part 1 · The engine

## 1.1 The foundation: sRGB is not linear in light

`src/core/color/srgb.ts`

Every colour transformation in this project linearises first and re-applies gamma at the
end. This sounds like a footnote and is not: applying a cone-response matrix to
gamma-encoded values operates on the wrong number and produces invented colours.

```
sRGB 0–255 → linearise → 3×3 matrix → delinearise → sRGB 0–255
```

**The initial draft of this project got this wrong**, which is why the file carries a
warning rather than a description. The pipeline is not a style preference; skipping it
yields plausible output that is simply not the colour anyone would see.

The same file owns **relative luminance** and **WCAG contrast ratio**, and that is
deliberate: luminance is the channel that survives colour vision deficiency, and it is
load-bearing in the verdict (§1.5).

## 1.2 Simulation: 297 coefficients nobody typed

`src/core/color/matrices.ts` · `matrices.generated.ts`

Colour vision deficiency is simulated with **Machado, Oliveira & Fernandes (2009), IEEE
TVCG 15(6), Table 1** — three deficiency types × 11 severity steps × 9 coefficients = **297
values**.

They are not hand-copied. `scripts/gen-matrices.mjs` transcribes them mechanically from
DaltonLens-Python (MIT © 2021 Nicolas Burrus) and writes the **SHA256 of the source file**
into the generated header. Integrity is verifiable offline:

```bash
npm run verify:matrices
# ✅ Matrices intact · 297 values · 40dfe96356dae00c…
```

**Why this much ceremony.** The project's initial draft cited Brettel 1997 and Viénot 1999
in its comments while actually using the matrices from a 2000s web approximation that
DaltonLens's own literature advises against. A product whose central argument is perceptual
honesty cannot ship a false simulation while citing the correct paper — it is the one error
a judge with colour science training spots immediately.

**Why Machado and not Brettel.** Machado is the only one of the three that genuinely
parameterises *severity*, and **more than half of our users are mild anomalous trichromats,
not dichromats**. A model that only represents complete dichromacy would misrepresent the
majority of the people this product is for.

> ⚠️ **Declared limitation.** Machado is used for tritan too, and its own source warns it is
> not accurate for that case — Brettel's two-half-plane projection is correct there. Protan
> and deutan, where the product is actually decided, use it as published. See
> [`limitations.md`](limitations.md).

## 1.3 Distance: CIEDE2000, and a second metric that had to exist

`src/core/color/deltae.ts`

Perceptual distance is **CIEDE2000** via `culori`, not Euclidean ΔE76. Where the whole
product is a claim about whether two colours can be told apart, the difference between the
two metrics is the product.

But the file exports a second function, and the reason is one of the most instructive bugs
in the project.

### The rule that could never fire

KROMA's differentiating claim is: *a pair that collides in **hue** but is separated by
**lightness** is not a collision — the user tells them apart by light and dark.*

Implemented against full CIEDE2000, that rule was **unreachable**. Full ΔE includes the
lightness term, so any pair with enough contrast to be rescued already had a large ΔE and
was classified `safe` before the rescue was consulted.

Swept across a grid covering all of sRGB — **130,816 pairs**:

| | |
|---|---|
| pairs that collided | **8,147** |
| pairs ever rescued by luminance | **0** |
| maximum contrast among colliding pairs | **1.68** |
| threshold the rescue required | **1.80** |

`savedByLuminance` was dead code that read as a working feature.

The fix was to separate the axes. `deltaEHue()` equalises L\* before measuring, answering
*"are these the same hue?"* — which is not the same question as *"do these look alike?"*.
Collision is measured on hue; rescue on WCAG contrast. Two independent axes, both reachable.

## 1.4 Naming: derived, never looked up

`src/core/color/naming.ts`

The single line where a measurement becomes a word, and the most dangerous in the product.

**The first version failed, and the failure was structural.** It picked the nearest of the
148 CSS named colours by CIEDE2000. A user reported a dark purple jacket, measured at hue
**316°**, coming back as *"midnight blue"* — hue ≈ **265°**. Fifty degrees away, a different
colour family. A forest green at 140° came back *"dark slate gray"*.

The cause is not tuning: in the dark region CIEDE2000 is dominated by the lightness term,
and the CSS table has almost nothing both dark and saturated, so the nearest entry is
whatever dark thing happens to be closest **regardless of hue**. Reporting the distance
alongside does not help — a name from the wrong family is wrong however politely it is
hedged.

So the name is now **derived from the measurement**: read in LCh — the polar form of the
same CIELAB space everything else uses — the hue angle selects the family and lightness and
chroma supply the modifiers. It is impossible to land in the wrong family, because the
family *is* the hue. A CSS name is offered only as a secondary label, and only when it is
genuinely close.

Deterministic, auditable, instant, free, identical on every run, **and no language model
anywhere near it.**

## 1.5 The verdict: three states, two axes, one asymmetry

`src/core/color/verdict.ts`

Every pair is judged in the user's **simulated** space:

| Input | Meaning |
|---|---|
| `deltaEHue` on simulated colours | do these collide in hue, for this person? |
| WCAG contrast ratio | does lightness separate them anyway? |
| measurement confidence of both | how much do we trust the inputs? |

Producing `safe` · `risky` · `clash`.

**Thresholds come from somewhere, not from us.** The luminance rescue threshold is **WCAG
AA's 4.5:1** — the point at which an accessibility standard already considers two lightness
levels no longer reliably distinguishable. Using an existing standard rather than a number
we liked is deliberate.

**Two neutrals have no hue to collide.** A white t-shirt and a charcoal pair of trousers
produced a hue ΔE of 5.3 — purely because neither has chroma — and were flagged `risky`.
Nobody confuses white with charcoal. A product that over-warns stops being used, so the
obvious-separation guard exists to kill exactly that false alarm.

**A doubtful measurement can never produce a confident `safe`.** If either colour came from
a poorly-lit photograph, `safe` degrades to `risky` and the explanation says why.

### The sentence that was false, and how it got there

A pair downgraded from `safe` to `risky` *by poor light* fell past both `safe` clauses in the
explanation builder and landed on the clash text:

> *"White and muddy brown will look like practically the same colour to you, and there is no
> difference in lightness to separate them either."*

White. And brown. The verdict was right — we should not be emphatic about a colour we are
unsure of — but the **explanation** had no memory of *why* it had been downgraded, and
invented a collision to explain a measurement problem. Our user cannot look at the screen
and catch that. The explanation now branches on whether a hue collision actually exists.

## 1.6 Assisted contrast: moving information, not inventing colour

`src/core/color/daltonize.ts` · F18

Every daltonisation technique does the same thing underneath: **move information out of a
broken channel into one that still works.**

```
protan / deutan   red-green broken   →  blue-yellow and lightness survive
tritan            blue-yellow broken →  red-green and lightness survive
```

The method is the canonical one from **Fidaner, Lin & Ozgüven, "Analysis of Color
Blindness", Stanford Psych 221 (2005)**: simulate the deficiency, subtract from the
original, and **the difference is the information being lost, quantified as an image**. Then
redistribute it into channels the eye still receives.

### The insight that reorganised the whole feature

A dual panel that shows *"others see"* beside *"you see"* — the original next to a
Machado simulation — is incoherent as a default, and naming why is the idea:

> **For a colour-blind user, the ORIGINAL IS ALREADY THEIR VIEW.**
> Their eyes do the simulation. Computing it and showing it back hands them what they were
> already looking at.

The simulation is not useless — **it is for somebody else.** It is how a partner, a shop
assistant or a judge understands the gap. As a default it would occupy the slot that belongs to
the one render that tells the *user* something new. So the default right-hand panel became
the **daltonised** one, and the simulation moved behind *"show someone"*.

### Two hard boundaries

**It is a presentation filter and its output is never measured.** Measuring a daltonised
image would mean measuring our own filter and handing a false colour to the one person who
cannot detect it. This is enforced mechanically: `scripts/check-boundaries.mjs` **fails the
build** if anything under `src/app/api/` imports this file.

**We do not correct colour blindness and must never say we do.** It makes an image easier to
tell apart on a screen. That is all it does.

**And its parameters are declared as design decisions, not physics.** The redistribution
strength is a chosen, tunable value — the exact opposite of `matrices.generated.ts`, which is
sealed precisely because those values were measured and may never be invented. Confusing the
two categories is how projects end up citing a paper for a number they made up.

## 1.7 Measuring a garment: shading is not a second colour

`src/core/color/measure.ts`

A plain orange t-shirt was reported as **"37% dominant — patterned"**. It was not patterned;
it had folds.

A photograph of fabric is mostly shadow. Grouping pixels by anything that varies with
lightness splits one solid colour into several groups. Two naive readings both shipped bugs
a user caught: the centre of the frame (a printed tee returned the colour of its print), and
Lab cells by area.

**Shading is a continuous ramp; a print is a gap.** So pixels are grouped by **hue**, those
too grey to have one are pooled, and that pool splits **only at a real valley** in the
lightness histogram. `looksPatterned` is then decided by whether a *second* group is large —
never by the dominant group's share, which shading drags down on perfectly plain garments.

The same shirt now reads **99% dominant, solid**.

## 1.8 Confidence, and the right to refuse

`src/core/color/confidence.ts`

Three states: `measured` · `low_light` · `refuse`. **The refusal is a feature with its own
screen**, not an error path — *"I can't tell in this light"* is a legitimate and honest
answer.

**`null` never renders as `0`.** "Not verified" and "verified, perfect" are different claims,
and a type that cannot express "unknown" forces a lie at the first gap. This is not
theoretical: a field was a plain `number` until the API returned no redness entry and a
`?? 0` default turned that into 0 — the most alarming value on an inverted scale.

**Faces and garments are verified differently, because they must be.** On a face, confidence
is the ΔE gap between a raw reading and a light-normalised one. On a garment that signal is
worse than useless — see §2.5 — so garment confidence is built only from what we can defend
on our own pixels: clipping, the 8-bit encoding floor at that lightness, exposure, framing.

---

# Part 2 · How it is proved

## 2.1 Why harnesses and not unit tests

A unit test asserts that a function returns what its author expected. That is worth little
here, because **three of the bugs a user caught in this product were wrong colours, and none
of them looked wrong to whoever wrote the code.**

Looking at the output proves nothing either: a swatch on screen is exactly what our user
cannot check, and it is what the developer stops checking after the tenth time.

So each harness **synthesises inputs whose correct answer is known by construction** and
asserts the real code recovers it. The truth is not a judgement about an image; it is the
number the image was built from.

Five run offline and spend no API units.

## 2.2 `npm run verify:matrices`

Re-derives the 297 coefficients and compares against the sealed SHA256 of their source. Any
hand-edit, any drift, any "improvement" fails the check.

```
✅ Matrices intact · 297 values · 40dfe96356dae00c…
```

## 2.3 `npm run harness:calibration`

Feeds the calibration scorer the **complete session a model observer would produce** —
arrangement plus every staircase response — and asserts it comes back.

```
REAL OBSERVERS — must be measurable and recover the type
  normal 0.0    -> normal 0.00    conf=0.95  measurable=true  OK
  deutan 0.4    -> deutan 0.49    conf=0.92  measurable=true  OK
  deutan 0.6    -> deutan 0.49    conf=0.92  measurable=true  OK
  deutan 1.0    -> deutan 1.00    conf=0.95  measurable=true  OK
  protan 0.6    -> protan 0.43    conf=0.92  measurable=true  OK
  protan 1.0    -> protan 0.87    conf=0.91  measurable=true  OK
  tritan 0.8    -> tritan 0.79    conf=0.92  measurable=true  OK

DEGENERATE OBSERVERS — the refusal MUST still fire
  random guesser (25%)    measurable=false OK refuses
  always wrong            measurable=false OK refuses
```

**Both halves matter.** Recovering the real observers proves the test measures something.
Refusing the degenerate ones proves it is not just always answering — and a calibration that
confidently profiles someone who was tapping at random would poison every verdict that
followed.

**Why it matters.** An arrangement test on its own only detects severity **≥ 0.9**, which
would classify more than half of our real users — mild deuteranomals — as having normal
vision. Nothing else would have caught it: the app looked like it worked,
and the people it was failing are precisely the ones who cannot check.

## 2.4 `npm run harness:daltonize`

The critical question is not *"does the filter change the image"* — anything changes an
image. It is **does the gap widen in the user's own perceptual space**, and does it widen
without collapsing something that was already separable.

Measured on real confusion pairs (ΔE in the observer's simulated space):

| Observer | Pair | Seen apart | Gentle | Full |
|---|---|---|---|---|
| deutan 1.0 | signal red vs olive | **2.0** | 14.8 | **25.5** |
| deutan 1.0 | forest green vs brown | 6.1 | 4.5 | 11.5 |
| deutan 0.6 | signal red vs olive | 11.1 | 16.4 | 21.9 |
| protan 0.8 | signal red vs olive | 13.6 | 21.0 | **26.0** |
| protan 0.8 | forest green vs brown | 5.6 | 6.1 | 12.2 |

Signal red against olive goes from **ΔE 2.0 — indistinguishable — to 25.5** for a complete
deutan.

**The assertion that matters most is the negative one:** no pair that was already
distinguishable may become indistinguishable. Note `teal vs olive` for the same observer
*decreasing* (27.9 → 15.5): that is the blue-yellow axis, which a deutan still has, being
partly spent to widen the broken one. It is a real trade-off, it is visible in the harness
output, and it stays above the collision threshold — which is why the redistribution
strength is a declared design parameter and offered to the user as a control rather than
being fixed at maximum.

## 2.5 `npm run harness:garment`

Builds garments whose colour is **known by construction**, under shading harsher than any
real photograph — a 3× range from highlight to fold — and asserts both directions:

- a known colour comes back within a visible-difference margin;
- a **solid** garment is not called patterned (the false alarm a user reported);
- a **patterned** garment is not called solid.

```
✅ Every garment measured within tolerance, and solid and patterned told apart.
```

**The second direction is the one that could not be dropped.** Silencing the false alarm by
calling everything solid would hide a print from the one person who cannot see it.

## 2.6 `npm run harness:upload`

Not colour, but the same philosophy: every shape we might send — panoramas at 20:1, strips
at 40:1, tall images, PNG sources — is put through the real conversion and checked against
the size window each endpoint documents.

```
Colour drift through the conversion: 1.00 / 255 per channel
✓ The colour survives the conversion.
✓ Every shape lands inside the documented window.
```

That first line matters more than it looks: it proves our own JPEG encoding is not moving
the colour before the API ever sees it. `chromaSubsampling: '4:4:4'` is not an optimisation
— the default 4:2:0 averages chroma in 2×2 blocks, injecting noise into the one variable
this product sells.

## 2.7 `npm run check` — architecture enforced by script

Boundaries + typecheck + lint. The boundaries script enforces exactly two rules, and fails
the build on either:

- **anything under `src/app/api/` importing the daltonisation filter**
  (`check-boundaries.mjs:76`) — the measurement/presentation separation of §1.6, enforced
  mechanically rather than remembered. This is the one that protects the user directly: it
  makes it impossible to accidentally measure our own filter's output.
- **`src/core` importing from `src/features`** (`check-boundaries.mjs:52`) — the core stays
  reusable and cannot quietly grow a dependency on one screen's needs.

Two rules, both cheap, both catching a class of mistake that type checking cannot.

> ⚠️ **A known gap, and it cost us.** `npm run check` does **not** run the harnesses. Adding
> `outfits.ts` to the colour barrel broke `harness:calibration` — the harness copies a fixed
> list of core files into a temporary directory, and the barrel now re-exported one that was
> not on the list. Every check passed for four commits while a harness was dead. It was found
> only by running it to quote its output instead of trusting memory of it.
>
> The same failure had happened before, to a different feature: the calibration harness
> broke when the colour barrel grew. **It is a recurring
> fragility in the harness design, not a one-off** — the fix is either to add each new core
> colour file to that list, or to have the harness copy the directory wholesale.

---

# Part 3 · What this buys, in one page

**For the user.** Every colour on screen was measured from their own photograph, on their
own device, by arithmetic they could check if they could see. Every verdict carries the
confidence of the measurements behind it. When the light does not allow an answer, they get
a refusal instead of a guess.

**For a reviewer.** Nothing here rests on trust. The matrices verify offline against a
sealed hash. The calibration, the filter, the garment reading and the upload path each have
a harness that synthesises known inputs and asserts the real code recovers them —
**including the negative cases**, because it is trivial to eliminate a false alarm by never
alarming. The architectural boundary between measuring and presenting is enforced by a
script that fails the build.

**For the pitch.** Every decision in this engine has the same shape, and it is worth saying
in one sentence:

> **Our user is the only person who cannot audit our product — so the product audits
> itself.**

That is why the matrices are sealed, why the naming is derived rather than looked up, why
the collision metric was rewritten when a sweep proved a rule could never fire, why the
daltonisation filter is forbidden from touching an API route, and why the refusal has its
own screen.

It is also why every number in this document comes with the command that reproduces it.

---

*See also: [`README.md`](../../README.md) · declared limits in
[`limitations.md`](limitations.md) · API findings in
[`perfect-corp-dossier.md`](perfect-corp-dossier.md).*
