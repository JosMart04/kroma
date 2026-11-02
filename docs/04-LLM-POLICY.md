# LLM and inference policy

## First: what "free of charge and without any restriction" actually means

The rules, Testing section:

> *Access must be provided to an Entrant's working Project for judging and testing by
> providing a link to a website, functioning demo, or a test build. (...) The Entrant must
> make the Project available **free of charge and without any restriction**, for testing,
> evaluation and use by the Sponsor, Administrator and Judges until the Judging Period ends.*

**It refers to the judges' access, not to our infrastructure.** A judge must not have to
pay or ask permission to try it.

It does **not** mean a paid API is forbidden: using a hosted model with **our** key, paid
by us, is perfectly valid — the judge pays nothing.

**The real risk is a different one:** if a key runs out of credit in the middle of the
judging period, the judge sees a broken app. The answer is a spend cap and graceful
degradation, **not** local inference. The same applies to the YouCam key itself, which is
why `npm run credits` exists.

---

## Second: where would an LLM actually be needed?

Going through every feature, the uncomfortable answer is: **almost nowhere.**

| Feature | LLM? | Why |
|---|---|---|
| F1 calibration | ❌ | Maths on the arrangement pattern and the thresholds |
| F2 colour portrait | ❌ | The API returns hex values and names. Formatting needs no model |
| F3 simulation | ❌ | Matrix algebra |
| F4 confidence | ❌ | ΔE comparisons and pixel statistics against thresholds |
| F6 garment ingestion | ❌ | Colour histogram by hue band |
| F8 families | ❌ | Deterministic clustering |
| F9 duplicates | ❌ | Distance comparison |
| **F10 naming** | ❌ **and it matters that it is not** | See below |
| F11 traffic light | ❌ | Distances + text template |
| F12 "Should I buy this?" | ❌ | Percentage + template |
| F15 corrector | ❌ | Arithmetic on the measured skin |
| F17 MCP run | ❌ | A fixed sequence: you cannot render onto a face you have not measured |

### Why naming a colour can NOT be an LLM

This is the point that matters most.

**Our user cannot detect a hallucination.** If a model says "olive green" and the garment
is brown, anyone else sees it instantly; they do not. It is exactly the failure the product
exists to prevent.

Naming a colour is a **nearest-neighbour lookup against a named-colour table**.
Deterministic, auditable, instant and free. An LLM would be slower, cost money, and could be
wrong in a way the user cannot detect.

> **Project rule:** the evaluator is deterministic. An LLM may *draft*, never *decide*. No
> figure, colour, name or verdict comes out of a language model.

This is not a limitation to apologise for: it is a **design argument**. "Our evaluator is
deterministic and auditable by design, because our user cannot detect an error" is a
better pitch than any model boast.

---

## Third: why NOT local inference (LiteRT-LM, WebLLM, MediaPipe)

Attractive, and ruled out for four concrete reasons:

1. **The model weight ruins the first impression.** A small model is 500 MB–2 GB to
   download. A judge opening the link would wait for it before seeing anything.
2. **WebGPU on iOS is a risk we do not control.** Running an LLM in the browser needs
   WebGPU, whose support in mobile Safari depends on the version. We do not know which
   device the judges use.
3. **The privacy argument does not hold for this product.** The photos go to Perfect Corp's
   servers anyway — that is the core of the project. We cannot promise nothing leaves the
   phone when the main feature consists of sending it.
4. **It is not on the critical path of any judging criterion.**

---

## Fourth: what about a native app?

**Not for the judged build.** The rules require something the judges can open. An Android
APK leaves out every judge on an iPhone or a laptop; TestFlight needs Apple review.

**What we do instead, and it is cheap:** a **PWA** — the web app plus a manifest, icons and
a service worker. It installs to the home screen with its own icon, runs full screen
without the browser bar (so on video it looks native), and works the same on Android, iOS
and desktop.

---

## Decision

| Aspect | Decision |
|---|---|
| Platform | **Mobile-first web + PWA** |
| Evaluator (colours, verdicts, figures) | **100% deterministic.** No LLM. Non-negotiable |
| Colour naming | Named-colour table + nearest neighbour |
| LLM in the product | **None.** If one is ever added, it drafts copy only |
| Local inference | **No** |

### If an LLM is ever added, three requirements

1. **A hard spend cap** in the provider's dashboard, below what we are willing to lose. The
   judging period runs until 20 November.
2. **A mandatory deterministic fallback.** If the model fails or runs out of credit, the
   feature falls back to fixed rules and **the app keeps working**.
3. **Show the fallback in the video.** Demonstrating that killing the model does not break
   the experience turns resilience into part of the pitch.
