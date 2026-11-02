# KROMA — Devpost submission copy

> Paste-ready text for the Devpost project form of the **YouCam API Skin AI & eCommerce VTO
> Hackathon**. **Every number here was measured.** Nothing is estimated, rounded up, or
> inferred — if a figure is not in this file it is because we could not verify it, which is
> the same rule the product itself follows.
>
> **Live:** https://kroma-aidrationbreak.vercel.app
> **Topics:** Skin AI **and** eCommerce VTO — one product, because for our user the face and
> the garment are one decision.

---

## Elevator pitch (one line)

KROMA gives people with colour blindness the colours of their own face, measured — then uses
them to judge every garment they own or are about to buy, and refuses to answer when the light
will not let it know.

---

## Inspiration

Around 300 million people have colour vision deficiency. More than half are mild
deuteranomals who were never diagnosed, because their variant causes no darkening — they
simply grew up being told they were bad at colours.

We started from one sentence that reorganised everything:

> **A person with colour vision deficiency cannot see the colour of their own face, and
> therefore cannot make any decision that depends on it.**

Not correcting redness. Not knowing what suits them. Not telling a navy jumper from a dark
purple one in their own wardrobe. That last one sounds small until you learn what people
actually do about it: they ask someone. Every morning, a partner or a parent or a flatmate
tells them whether the outfit works. And when they shop, they buy black, grey, navy and white
— the safe colours — or a third navy shirt they cannot tell from the two they own.

`skin-tone-analysis` returns the colour of their face as a number. **There, and only there,
the YouCam API does something no amount of local code can** — it substitutes for a missing
sensory channel. That is not a beauty use case. It is assistive technology for shopping, and
nobody is building it.

Then the corollary that governed every decision: **our user is the one person who cannot
audit our product.** If we name a colour wrong, they have no way to catch it. So honesty could
not be a promise in a README. It had to be structural.

---

## What it does

KROMA measures how *you* see colour, measures the colours you cannot see, and then answers the
shopping and dressing questions that depend on both — stating how confident it is, and refusing
when the light will not let it know.

**It measures the user first, without asking.**
A Farnsworth D-15-style arrangement test plus a three-axis psychophysical staircase derive the
type of deficiency and its severity. We never ask which one you have: more than half of our
users do not know, and asking is asking for the answer they came for. The confusion axes are
**derived from the Machado 2009 matrices the app already uses**, so the engine that calibrates
you is the same one that later simulates what you see.

**Skin AI — it measures the face.**
Skin, eyes, brows, lips and hair, plus Fitzpatrick phototype and `redness.raw_score`. We use
`raw_score`, never `ui_score`, because the documentation says `ui_score` is adjusted upward as a
psychological motivator — and this product's entire argument is that the user could not
detect us flattering them. **Redness is not interpretable without the phototype**, which makes
the Fitzpatrick × redness cross a technical necessity. From the measured skin, KROMA computes
the colour corrector that cancels its redness and the foundation depth and undertone that
match it — the decisions their vision denies them.

**Skin AI — it checks its own advice.**
The corrector is rendered onto the user's face with `makeup-vto`, and the redness is measured
before and after on the same image — **including when it gets worse.** Measured on already-calm
skin: 72.5 → 68.9; on skin with real redness: 57.0 → 58.4. We publish both, because a product
that can tell you *not* to buy a corrector is worth more than one that always flatters.

**eCommerce VTO — "Should I buy this?"**
Photograph a garment in a shop and KROMA answers before you pay: its measured colour and name,
whether it collides with your skin and hair, which of your clothes it goes with — a percentage
that counts only safe pairs — and a warning if you already own one you could not tell apart.

**eCommerce VTO — on your body.**
`cloth-v4` renders the garment onto the user's own photo (with `outer` for coats and the
multi-person filter on, so only they are dressed), scarves and hats frame the face, and whole
outfits are built by feeding each render back in as the body for the next. The picture answers
*how does this hang*; the colour verdict beside it comes from the measurement, and the screen
says so.

**It answers the morning question.**
KROMA composes **whole outfits with no clashing pair**, judged against the palette on the
user's own face, and says the thing the product exists to say: *you can put any of these on
without asking anyone.* Users can also build and save their own — because many already own
outfits that work, assembled by someone they trust, and nothing has ever been able to check
those.

**It makes the invisible visible.**
Assisted contrast (daltonisation) moves the information lost in the user's broken channel into
channels they can see — so text hidden in a pattern becomes legible. It is a presentation
filter only: it never touches a measurement, and the build fails if an API route imports it.

### Consumer and eCommerce value

- **Purchase confidence.** A measured colour, a collision verdict against the existing
  wardrobe and the user's own face, a compatibility percentage, and a try-on — at the moment of
  purchase.
- **Fewer duplicate purchases and returns.** Buying a garment indistinguishable from one you
  own is a documented behaviour nobody has named in a product. KROMA warns at the point of
  decision.
- **A wider basket.** People with CVD shrink their wardrobes to "safe colours". Colour families
  show them which colours are safe *for them*, which is a larger set.
- **Cost that amortises.** Measuring a garment is a one-off API cost. Comparing 25 garments is
  **300 local comparisons and zero calls**.
- **A market with no incumbent.** ~300 million people, more than half undiagnosed.

---

## How we built it

**Stack.** Next.js 15 (App Router) · TypeScript strict · Tailwind v4 · IndexedDB via `idb` ·
`culori` for CIELAB and CIEDE2000 · `sharp` server-side · Vercel. Mobile-first PWA, 375 px
baseline, installable on Android, iOS and desktop.

**No database, no accounts, and that is deliberate.** The project must be freely available to
judges until judging ends. A login means a judge creates an account and lands in an app that is
empty anyway, because the wardrobe is theirs. Everything lives in IndexedDB on their device.
Every API call is server-side; the key never reaches the browser.

**YouCam API surface — ten endpoints across six route handlers:**

| Route | Endpoint | Contribution |
|---|---|---|
| `/api/portrait` | `/task/skin-tone-analysis` **×2** | skin, eyes, brows, lips, hair — raw and light-normalised |
| | `/task/lighting` | normalises the light; the gap between the two readings **is** the confidence |
| | `/task/fitzpatrick-scale-analyzer` | phototype I–VI |
| | `/v2.1/task/skin-analysis` | `redness.raw_score` |
| `/api/garment` | `/task/sod` | isolates the garment from the surface under it |
| `/api/tryon` | `AI-Clothes-Virtual-Try-On` (MCP) → `/task/cloth-v4`; `/task/scarf`, `/task/hat` | the garment or accessory on the user's photo |
| `/api/outfit` | the same, **chained** | the render becomes the body for the next pass |
| `/api/makeup` | `/task/makeup-vto` + `/task/skin-analysis` | renders the corrector, then re-measures the redness |
| `/api/mcp` | lighting, face colour and phototype **over MCP** | an audited run showing which transport answered each step |
| all | `/s2s/v2.0/file` | upload, then the `PUT` everyone forgets |

**Integration details that decide whether a selfie is accepted.** The colour analyser refuses
a head turned more than 10° by default; KROMA sends `face_angle_strictness_level` explicitly
and retries once at 15°, labelling the result approximate. The skin analyser wants the face over
60% of the image width; the makeup check retries on a tighter crop, which selects pixels and
cannot move a colour. Every image is converted to a per-endpoint size window, and every request
runs on a time budget below the platform's 60 s ceiling, with `429`s retried before the user is
told the service is busy.

**Model Context Protocol.** Official SDK, Streamable HTTP, same key as REST, sessions opened per
call and closed after. The `fashion` server renders every clothes try-on in production, with
REST underneath; `beauty` and `creators` run in an audited flow. Tool names are resolved
against the server's own `tools/list` — the servers spell them with hyphens while the docs use
underscores — and a failure written inside a successful MCP response still counts as a failure.

**Where the API is deliberately not used**, which is the other half of the architecture: the
measured colour of a garment comes from our own pixels; its name from a deterministic table; the
CVD simulation from published Machado 2009 matrices (297 coefficients, transcribed mechanically
and sealed with a SHA256, verifiable offline); every verdict from local arithmetic; and the
calibration touches no API at all.

**No language model decides anything.** Not the colour, not the name, not the verdict, not the
recommendation. If a model says "olive green" about a brown garment, anyone else catches it
instantly and our user never does.

---

## Challenges we ran into

**1. The lighting pass normalises faces. It damages garments.**
Our confidence layer compares a raw reading against a light-normalised one. On a face that
works — observed gap ΔE 0.5–0.7, a real cast removed. On garments it does not. One garment,
five lights, measured on the live endpoint:

| photo | raw→normalised ΔE | verdict it would produce |
|---|---|---|
| even daylight, true colour | 16.9 | **refuse** ← the best photo in the set |
| strong folds, true colour | 1.2 | measured |
| warm bulb, colour really shifted | 5.9 | low_light |
| cold cast, colour really shifted | 14.9 | refuse |
| underexposed | 22.6 | refuse |

The signal is unrelated to the truth — and on that daylight shot the normalisation moves the
garment **from ΔE 1.8 to ΔE 20.2 away from its known true colour.** The engine relights
*scenes*; flat fabric is not a scene. So `/task/lighting` runs in the portrait path only, and
garment confidence comes from our own pixels.

**2. Shading is not a second colour.**
Grouping fabric pixels naively turns a plain orange T-shirt into *"37% dominant — patterned"*:
folds, not a print. Shading is a continuous ramp; a print is a gap. Grouping by hue, pooling the
greys, and splitting only at a real valley in the lightness histogram gives the same shirt
**99% dominant, solid**.

**3. A rule that could never fire.**
Our differentiating rule is that a pair colliding in hue but separated by lightness is not a
collision. Measured on full CIEDE2000 the two conditions are mutually exclusive: across 130,816
pairs covering sRGB, **8,147 collide and 0 are ever rescued**. Separating the axes — hue with
lightness equalised for collision, WCAG contrast for rescue — makes the rule reachable.

**4. The two transports disagree.**
Same image, same `file_id`: skin agrees within ΔE 1.0, **the iris differs by ΔE 6.4**. A user
routed one way would be told a different eye colour than a user routed the other and could not
detect it. Policy: REST owns every measurement feeding a verdict; MCP renders and orchestrates.

**5. Selfies refused for reasons the user cannot see.**
Three engines, three framing vocabularies, and the strictest rule in the API (face over 60% of
the width) on the skin analyser. Every code the documentation lists has a sentence that
tells the user what to change — including the number of degrees to straighten up.

**6. Failures that arrive as successes.**
These MCP servers can answer a failed task with a perfectly successful response whose text says
`CreditInsufficiency`. A trace that trusted the protocol flag would report work that never
happened; ours reads the payload, and the screen derives which servers were reached from the
trace rather than from a hand-written list.

---

## Accomplishments that we're proud of

**Honesty implemented rather than promised.** `refuse` is a feature with its own screen. `null`
never renders as `0`, because "not measured" and "measured, perfect" are different claims. Every
verdict carries the confidence of the measurements behind it, a garment measured in poor light
degrades every combination it appears in, and hair is labelled as the category it is.

**Measurements that overturned our own design**: the lighting pass, the shading model and the
collision metric each changed after the evidence came in, and the evidence is published.

**A skin recommendation that checks itself.** Compute a corrector from measured skin, render it,
re-measure the redness, report the delta — including when it worsens.

**Calibration verified against synthetic observers.** `npm run harness:calibration` feeds the
scorer complete sessions from model observers — normal, deutan at 0.4/0.6/1.0, protan at
0.6/1.0, tritan at 0.8 — and all are recovered with the right type, while a random guesser and
an always-wrong responder are still refused. Mild deuteranomals, more than half of our users, are
measured correctly.

**The interface works for someone who receives no colour at all.** Every state travels as icon +
text + shape. Even in the colour-vision test itself, where the stimulus must be colour, every
swatch is numbered.

---

## What we learned

**Read `tools/list` and the OpenAPI specs even when you are calling REST.** They carry complete
enums and tolerances — `outer`, `filter_multi_person`, the five `face_angle_strictness_level`
values — and both are free.

**Follow `next_token`.** The price list is paginated, and its first page looks complete while
containing none of the Skin AI or try-on SKUs.

**Trusting a protocol flag is not the same as checking.** `isError` can be absent on calls that
failed.

**Measure your own instrument.** Every harness asserts the negative case too, because it is
trivial to "fix" a false refusal by refusing nothing, and trivial to fix a false pattern alarm by
calling everything solid — which would blind the exact person the product is for.

**Physics is not a gap in effort.** Without a surface of known colour in the frame, the
illuminant is not recoverable. We do not claim to detect a colour cast on a garment photo.

---

## What's next for KROMA

**Guided capture.** The JS Camera Kit's `shadefinder` and `skincare` modes check framing, angle
and light in real time — the most common reasons a selfie is refused.

**Webhooks.** Replacing polling removes the 60 s ceiling, so an outfit can be rendered with more
than two pieces.

**Foundation on the face.** `makeup-vto` has a `foundation` effect; F15 already computes the
shade.

**Brettel 1997 for tritanopia.** Machado 2009's own source warns it is not accurate for tritan;
the two-half-plane projection is the identified fix.

**A browser extension for shopping sites.** Product photos are public URLs, and every task
accepts `src_file_url` — a garment can be judged against your face and wardrobe without leaving
the shop.

**Retail integration.** The compatibility percentage against a catalogue is a merchandising
filter: *show me only what I can distinguish from what I already own.*

---

## Built with

Next.js · TypeScript · Tailwind CSS · IndexedDB · culori · sharp · Vercel · YouCam API (Facial
Color Tones Analyzer, Fitzpatrick Skin Type, Skin Analysis, Photo Lighting, Background Removal,
Clothes Virtual Try-On, Scarf and Hat Virtual Try-On, Makeup Virtual Try-On) · YouCam MCP servers
(beauty, fashion, creators) · Model Context Protocol SDK

---

## Testing instructions

Open https://kroma-aidrationbreak.vercel.app on a phone (desktop works too). No account. Follow
the three steps on the home screen: measure how you see colour (two minutes), take a selfie
straight on in daylight, and photograph a garment on a plain surface. Then try "Should I buy
this?", "Try it on", "Get dressed" and the corrector check. Everything is stored only in the
browser; "Start over" erases it.
