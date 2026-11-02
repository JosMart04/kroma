# Field report for Perfect Corp

### What we learned integrating the YouCam API and MCP servers, from a build that depended on colour accuracy more than most

**Project:** KROMA — colour vision deficiency assistance
**Checked against:** the documentation (v1.16), its OpenAPI specs, the live REST API and all
three live MCP servers, with a funded key — verified 31 October 2026

---

## Why this report exists, and why it may be unusually useful to you

Most integrations can tolerate a colour being slightly wrong, because the user notices and
compensates. Ours cannot. KROMA exists for people with colour vision deficiency, and the
whole product rests on one uncomfortable fact: **our user is the one person who cannot
audit the answer.** If a returned hex is wrong, nobody catches it.

That made us verify things a normal integrator would reasonably assume, and the assumptions
that broke are the interesting part. Everything below was measured, not inferred. Each item
states how it was checked so you can reproduce it.

We are not listing complaints. We are listing the specific places where the API's real
behaviour and its documented behaviour diverge, what it cost, and what we think would fix
it — plus the capabilities we suspect you are under-selling.

---

## Part 1 · Documentation issues, ranked by what they cost

### 1.1 🔴 The price list is paginated, and its first page looks complete

`/s2s/v2.0/credit/feature-cost` returns at most 20 SKUs per page with a `next_token`. The
first page is a plausible, self-contained list — and it contains **none** of the Skin AI or
try-on SKUs, which sort later. Following `next_token` gives six pages and 103 SKUs, and the
`run_task_url` field of each one names the real endpoint path.

**What it costs.** An integrator reading one page concludes that skin analysis, skin tone,
Fitzpatrick, try-on and `makeup-vto` have no published price — and, worse, that
`makeup-vto` may not exist on REST at all, because `/task/makeup` (the obvious guess) is a
404. Both conclusions are wrong, and the page gives no hint.

**What would fix it.** Say "paginated" in the endpoint's first sentence, and consider a
larger default page. The `run_task_url` field is the best route map you publish; it deserves
a line in the Quick Start.

### 1.2 🟠 MCP tool names are spelled differently in the docs and on the servers

The documentation's MCP page lists `AI_Clothes_Virtual_Try_On`, `AI_Skin_Analysis`,
`AI_Makeup_Virtual_Try_On`… with underscores. The live servers' `tools/list` answers
`AI-Clothes-Virtual-Try-On`, `AI-Skin-Analysis`, `AI-Makeup-Virtual-Try-On`… with hyphens.
One tool is `AI-Skin-simulation`, lowercase `simulation`, in both.

**What it costs.** An integrator calling a tool by the documented name gets "no such tool";
one hardcoding the server's spelling breaks the day the docs' spelling ships.

**What would fix it.** One canonical spelling, generated from the same source for both.
Until then, we resolve names against `tools/list` ignoring separators and case (§3.1).

### 1.3 🟠 The documentation contradicts itself on limits that decide whether a call succeeds

| Topic | One page says | Another says |
|---|---|---|
| Task retention | task_id valid **30 days** (File Retention Period) | valid **24 hours** (task API response schema) |
| Skin analysis long side | "up to **2560** pixels on the long side" (Step 1) | "**no limit** on the long side; resized above 2560" (File Specs) |
| Makeup VTO size | "long side **< 1920**" (spec table) | "width < 1920px, **height < 1080px**" (error description) |

**What it costs.** A portrait selfie at 1200×1600 passes the makeup table and fails its error
description. Integrators have to probe or design for the stricter reading of each pair.

**What would fix it.** One authoritative row per limit, linked from everywhere it is quoted.

### 1.4 🟠 Fields whose meaning matters, left unexplained

- **`hair_color` is an enum of seven preset hex values** in the skin-tone schema, while skin,
  eyes, brows and lips are free measured values. Nothing says hair is a category swatch. An
  integrator who shows all five side by side presents a category as a measurement.
- **`raw_score` direction.** The skin-analysis reference says raw scores run 1–100 with
  "higher indicates healthier", while the official YouCam Skills interpretation guide says
  the raw score's "direction may differ from `ui_score`". Products that read redness — ours
  does — need one answer.
- **`pf_camera_kit`** appears in the skin-analysis v2.1 request schema with no description.

**What would fix it.** One sentence each.

### 1.5 🟡 Each engine has its own error vocabulary for the same problem

| Problem | Colour analyser | Skin analyser | Phototype / makeup | Clothes |
|---|---|---|---|---|
| Face too small / out of frame | `error_face_position_too_small` / `_out_of_boundary` | `error_src_face_too_small` / `error_src_face_out_of_bound` | `error_face_position_*` | — |
| Head angle | six directional codes (`error_face_angle_upward`…) | — | one code, `error_face_angle_invalid` | — |
| Second person in frame | — | — | — | `error_multi_person` (filter) / `error_multiple_people` |

**What it costs.** Every integrator maps each spelling separately or shows a generic error
for some of them. The skin analyser's framing rule is also the strictest in the API — the
face must exceed **60% of the image width** — so a selfie accepted on one screen is refused
on the next, with codes that do not resemble each other.

**What would fix it.** A shared set of framing codes across engines, plus the stricter rule
stated next to every endpoint that enforces it.

### 1.6 🟡 Behaviours an integrator only learns by failing

| Behaviour | Consequence of not knowing |
|---|---|
| The File API does **not** upload the file — it returns a pre-signed URL you must `PUT` to | `500 unknown_internal_error` or a bare 404 |
| Polling is mandatory, **and abandoning it still bills you** | `InvalidTaskId`, and the units are consumed anyway |
| The result URL expires after **2 hours** | A demo that worked yesterday shows broken images today |
| `fitzpatrick` requires `version: "1.0"` although it is described as a default | `400 version is required`. The phototype returns as a Roman numeral string (`"III"`) |
| `gender` is required by `/task/scarf` and `/task/hat` | An unclear error on a call that looks correct |
| `filter_multi_person` defaults to `off`: the engine dresses the largest person in frame | The wrong person in a group photo is dressed |
| Lower-body try-on supports only **worn** outfits as reference, not product shots | A plausible but wrong render |
| Rate limit is **250/300 s per IP *and* per token**, simultaneously | 429s that look random, especially when one key serves every user of a deployment |
| **The Playground resizes images for you; your code does not** | An image that measures fine in the Playground is rejected from code |

### 1.7 🟢 What the current documentation gets right

Credit where due: the REST reference documents `face_angle_strictness_level` with its
five tolerances, `face_quality` in the skin-tone response, `outer` in the `cloth-v4` enum,
`change_shoes`, `filter_multi_person`, the short `/task/lighting` and `/task/sod` paths, and
downloadable OpenAPI specs for every feature. The specs were the fastest way to check
everything in this report.

---

## Part 2 · MCP server findings

### 2.1 🔴 Failures are described inside successful responses

A call that failed at the engine can return a **perfectly successful MCP response** — no
`isError`, valid envelope — whose payload describes the failure:

```json
{"error_message": "YcoApiException - Start request failed: 400, ...
 {\"error_code\":\"CreditInsufficiency\"}", "request_id": "..."}
```

A UI trusting the protocol flag reports work as done when nothing ran. We caught it because
the timings were too fast to be real work.

**What we do, and what we would suggest to others:** inspect the payload, not just
`isError` — conservatively, matching an explicit error field rather than any occurrence of
the word "error", since a skin analysis is entitled to mention one.

**What would fix it.** Set `isError: true` when the upstream task failed, or document a
structured error envelope. Today every client parses a string.

### 2.2 🔴 The same `file_id` measured over MCP and REST returns different colours

Same image, same `file_id`, same account, minutes apart:

| Feature | REST | MCP | ΔE2000 |
|---|---|---|---|
| skin | `#b48d72` | `#b79075` | 1.0 |
| **eye** | `#582109` | `#6e310d` | **6.4** |
| lip | `#e78982` | `#e78882` | 0.4 |
| brow | `#5b3f32` | `#5b3f32` | 0.0 |
| hair | `#000000` | `#000000` | 0.0 |

Skin differs below the threshold of perception. **The iris differs by ΔE 6.4, which is
plainly visible.** (Hair matching says little: it is a category swatch, §1.4.)

We do not claim to know the cause. One hypothesis is `face_angle_strictness_level`
defaulting differently per transport — the MCP schema declares its default as `null` while
its description and the REST reference say `high`. Engine non-determinism is also possible.
**We did not verify it, and we do not assert it.** We send the level explicitly on both.

**Why it matters more to us than to most.** A user routed one way is told a different eye
colour than a user routed the other — and ours cannot detect the inconsistency. So: **REST
owns every measurement that feeds a verdict, and MCP renders and orchestrates.**

**What would fix it.** Document that the transports may differ and by how much, or align
the defaults.

### 2.3 🟢 What MCP got right

- **One credential, two transports.** The same key works on both, and MCP accepts a
  `src_file_id` from the REST File API — no second image pipeline.
- **Self-describing schemas**, with enums and tolerances an integrator can read at run time.
- **Streamable HTTP** works cleanly from a serverless runtime.
- **Unit and balance tools** (`Get-Unit-Info`, `Get-Feature-Cost`) on every server.

---

## Part 3 · Engineering solutions we built, offered freely

### 3.1 Resolving tool names instead of hardcoding them

The client lists the server's tools once per warm instance and matches the wanted name
ignoring separators and case, so `AI_Clothes_Virtual_Try_On` and `AI-Clothes-Virtual-Try-On`
resolve to the same tool. Where only the purpose is known, a pattern is used
(`/light/i` → `AI-Photo-Lighting` on `creators`). A tool that is *not offered* raises a
distinct error that deliberately does not hide inside a REST fallback — a missing tool is our
mistake, not a transport problem. `tools/list` costs nothing, so this is free insurance.

### 3.2 A time budget per request

Serverless platforms kill a function at a fixed ceiling (60 s on Vercel's free plan). A poll
that outlives the function dies without logging its task id, and the unit may already be
spent. Each route runs inside a budget that every nested poll can see, and polling stops
early enough to log the id and answer. A `429` is retried with backoff inside the same budget.

### 3.3 One retry at a looser angle, labelled as such

The colour analyser refuses a head turned more than 10°, which is the most common reason a
selfie that looks straight-on is refused. On an angle refusal we retry once at `medium`
(15°) and mark the result approximate — the engine itself says a stricter level gives more
accurate attributes, so the user is told which reading they got.

### 3.4 A transport trace as a product feature

Every orchestrated run reports, per step: which server answered, which tool, over which
transport, how long it took, and — if it fell back — why. The screen derives which servers
were reached **from the trace**, never from a hand-written list. **A fallback nobody can see
is a claim nobody can check.**

### 3.5 Probing parameters without spending credits

Send a deliberately invalid `file_id` so no task starts, and read which half of the request
the error names: an accepted value answers about the file, a rejected one names the
parameter. That is how `filter_multi_person`, `face_angle_strictness_level` and the
`makeup-vto` path were confirmed at zero cost. A documented validation-only mode would make
the trick unnecessary.

### 3.6 Two transports, one measurement policy

Our resolution to §2.2 generalises: **pick one transport for anything whose output a user
will compare against another output, and use the other for orchestration.**

---

## Part 4 · Honest assessment of our own limits

### 4.1 Tritanopia uses the wrong model, knowingly

Our simulation uses Machado 2009 across all three deficiency types. **Its own source warns it
is not accurate for tritanopia**, where Brettel 1997's two-half-plane projection is correct.
Protan and deutan — where this product is decided, and where most users sit — use it as
published. Declared rather than hidden.

### 4.2 We cannot detect a colour cast on a garment photo

Separating illuminant from surface requires a reference of known colour in the frame. A user
photographing their wardrobe has none. **This is physics, not a gap in effort**, and we refuse
to claim a "smart white balance" that would be guessing.

**This is a genuine opportunity for Perfect Corp.** An endpoint returning an illuminant
estimate with a confidence would unlock honest colour measurement for user-generated garment
photography — the bottleneck for every resale marketplace, wardrobe app and accessibility
tool in this space.

### 4.3 Where each MCP server sits

`fashion` is in production: every clothes try-on goes MCP first, with REST underneath.
`beauty` and `creators` run in an audited demonstration. That follows from our own policy
(§2.2): the tools we use from them — face colour, phototype, lighting, background removal,
and the makeup render whose redness we compare before and after — all feed a measurement,
and we committed to one transport for measurements. **We would rather say that plainly than
measure one face through two paths that disagree.**

### 4.4 No LLM, and that is a position rather than a gap

**Our user cannot detect a hallucination.** If a model says "olive green" about a brown
garment, anyone else catches it and they never do. So no language model names a colour,
computes a verdict, or chooses a recommendation. What we do have is the part of agency that
matters for reliability — runtime tool resolution (§3.1) — and a deliberate stop before the
decision boundary.

### 4.5 The outfit render chains two garments, not more

A `cloth-v4` render is ~25 s and each pass needs its own upload. Three passes do not fit in a
60 s request, and timing out **after** spending units is the worst outcome available.
**A multi-garment endpoint — or webhooks, which remove the request ceiling — would lift
this** (§5.2).

---

## Part 5 · What we would build if you shipped it

### 5.1 An illuminant estimate for non-face images

See §4.2. Even a coarse `{ illuminant, confidence }` would let us measure user-photographed
garments honestly instead of relying on defensible-but-weaker heuristics on our own pixels.

### 5.2 Multi-garment try-on in one call

A single call accepting an ordered list of garments with categories would be faster and
cheaper than chaining, and would let outfit-level try-on exist as a first-class feature.

### 5.3 A validation-only mode

`?dry_run=true` returning parameter validation without starting a task (§3.5).

### 5.4 Consistency guarantees across transports

A documented statement that MCP and REST may differ and by how much, or aligned defaults
(§2.2).

### 5.5 Garment colour returned with the try-on

`cloth-v4` necessarily has an internal representation of the garment's colour. Returning it,
with a confidence, would let integrators verify that a render is faithful to the input — we
currently tell users to judge fit from the render and colour from our measurement.

### 5.6 Accessory engines that respect the reference garment

Measured on `/task/scarf`: a flat magenta reference (`#e010a0`) returned a **crimson patterned
scarf in front of the Colosseum** — `#570c25`, **ΔE 31.4**. The docs explain it: the `style`
parameter "controls outfit and background style" and defaults to `random`, with no value that
keeps the original. For a generative styling tool that is fine; for showing a **real
product** it is not. A transfer-faithful mode — as `cloth-v4` achieves for clothing — would
make these endpoints usable for commerce.

---

## Part 6 · Use cases we think are under-served

**Accessibility as a first-class market.** ~300 million people have CVD, more than half
undiagnosed, and `skin-tone-analysis` is the only practical way to give a colour-blind person
the colour of their own face. That is not a beauty feature; it is **sensory substitution**, a
category with no incumbent.

**Second-hand and circular fashion.** Colour is the most disputed attribute in peer-to-peer
listings, and every photo is taken under unknown light. §5.1 plus a faithful VTO would make
your stack the obvious infrastructure for resale platforms.

**Measure, intervene, re-measure.** Our F16 loop — measure redness, render a corrector, measure
the same metric again — generalises to dermatology follow-up and treatment adherence. The
`raw_score`/`ui_score` distinction matters enormously there, and `raw_score` deserves to be the
documented default for clinical-adjacent use (once its direction is documented, §1.4).

**Assistive technology for low vision generally.** Measure a colour, name it
deterministically, state the confidence, refuse when unsure.

---

## Appendix · How to reproduce anything in this report

**Tool inventory** across all three servers — free, because `tools/list` is protocol
metadata rather than a task:

```bash
node --env-file=.env.local scripts/probe-tools.mjs
```

**One tool's full `inputSchema`** (either spelling of the name works):

```bash
node --env-file=.env.local scripts/probe-tools.mjs --schema AI-Clothes-Virtual-Try-On
```

**The full price list**, all pages, free:

```bash
node --env-file=.env.local scripts/feature-cost.mjs
```

**The balance**, free:

```bash
node --env-file=.env.local scripts/credits.mjs
```

**Parameter validation without spending units:** POST to the task endpoint with a
deliberately invalid `src_file_id` and vary the parameter. An accepted value answers about the
file; a rejected one names the parameter.

**Transport comparison:** upload once, call `AI-Facial-Color-Tones-Analyzer` over MCP and
`/task/skin-tone-analysis` over REST with the same `file_id`, and compare the returned hex
values in CIEDE2000.

The scripts are in this repository. A report that says "run this" without shipping the script
is asking to be taken on trust, which is the one thing this project does not do.

---

*Written by the KROMA team. We are happy to expand on any of this.*
