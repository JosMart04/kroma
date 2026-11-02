# KROMA — demo video script

For whoever records the video. Everything below is real: there is no demo data, no fixtures
and nothing simulated. **Whatever you film, you have to photograph on camera.** That is a
deliberate product decision, and it is worth saying out loud in the video.

**Live app:** https://kroma-aidrationbreak.vercel.app

## The rules this video has to meet

- **1 to 3 minutes.** Judges are not required to watch past 3:00 — plan for 2:45.
- **It must explain which YouCam APIs are used.** Name them on screen and in the voice-over.
- **It must show the app running on the device it was built for** — film a phone, held in a
  hand, with the installed PWA.
- **Public on YouTube** (preferred) or Vimeo, link in the Devpost form.
- **No third-party trademarks, no copyrighted music** without permission. Use royalty-free
  music or none.
- **In English.**

---

## The one sentence to open with

> **You cannot see the colour of your own face. So you cannot tell whether that shirt
> clashes, or whether your skin looks red today.**

Do **not** open by talking about colour analysis — "personal colour" is a crowded idea and
that framing files KROMA in the wrong pile before the second sentence. Open with the person
and what they cannot do.

The pitch in one more sentence: **KROMA measures it, tells you how sure it is, and refuses
to answer when the light will not let it know.**

---

## A 2:45 cut

| Time | Shot | Voice-over (what it must say) |
|---|---|---|
| 0:00–0:15 | A person holding two shirts, unsure | The opening sentence. ~300 million people; more than half never diagnosed |
| 0:15–0:35 | Calibration on the phone | "It never asks what you have — it measures it." No API here: pure maths |
| 0:35–1:05 | Selfie → the colour portrait | **Skin AI**: "YouCam's Facial Color Tones Analyzer, Fitzpatrick Skin Type and Skin Analysis return the colours this person cannot see — skin, eyes, hair, phototype, redness." Show the confidence banner |
| 1:05–1:25 | Corrector → "See it on your face" | "From the measured skin, the corrector colour — rendered with Makeup Virtual Try-On, then the redness re-measured. It even tells you when a corrector does not help." |
| 1:25–1:50 | Add a garment; the duplicate alert | "Background Removal isolates the garment; the colour is measured on our own pixels." The alert: "you already own one you could not tell apart" |
| 1:50–2:20 | "Should I buy this?" → Try it on | **eCommerce VTO**: "Clothes Virtual Try-On puts it on your body — the verdict comes from the measurement, the picture is for fit." Show "works with X% of your wardrobe" |
| 2:20–2:35 | Get dressed — outfits with no clash | "You can put any of these on without asking anyone." |
| 2:35–2:45 | The refusal screen, or assisted contrast revealing hidden text | "And when the light lies, it says so." End on the URL |

---

## What you need before filming

| | |
|---|---|
| A phone with a camera, the PWA installed | it opens with no browser chrome and looks like a tool |
| A face | for the selfie, straight on, daylight from a window |
| A full-body photo of the same person | standing, facing the camera, head to knees |
| 3–5 garments | **at least two nearly the same colour** — that triggers the duplicate alert |
| A pair of trousers **worn** in a photo | the engine supports the lower body only from worn outfits |
| One garment with a printed graphic | shows the pattern detection working |
| Good daylight | the app refuses bad light, which is a feature but not what you want mid-take |

⚠️ **Every measurement spends API units.** A full colour portrait is about 61 units, a garment
1, a try-on 2, the corrector check about 19. Run `npm run credits` before the shoot and do not
rehearse the whole flow ten times on the same key.

---

## The flow, in the order the app itself proposes

The home screen is not a menu, it is a path with visible progress. Follow it.

### 0 · Home — install it first

On Android and desktop Chrome the install card is a button; on iPhone it explains the Share →
Add to Home Screen gesture. **Film it installed.**

### 1 · Calibrate — *"Measure how you see colour"* (~2 min, no API)

Sorting and odd-one-out tasks **measure** the type of colour vision deficiency and its
severity.

🎬 **The line worth saying:** the app never asks what you have. More than half of people with
CVD are mild deuteranomals who were never diagnosed, so asking would be asking for the answer
they came for. It can also **refuse** if the answers are not consistent enough — that is not
a bug.

### 2 · Colour portrait — *"Measure your face"* (~20 s, 5 API tasks)

One selfie returns **skin, eyes, brows, lips and hair**, each with its name and hex, plus the
Fitzpatrick phototype and a redness score. Hair is labelled as the category it is.

⚠️ Also here: the **confidence**. If the light is bad the app says so, and if it is bad enough
it refuses — *"I can't tell in this light"*. **If you can stage that refusal on camera, film it.**

Below it, **F15**: the corrector colour and foundation depth and undertone, derived from the
measured skin, with the reasoning shown.

### 3 · See it on your face — corrector check (~30 s, makeup try-on + skin analysis)

The corrector rendered onto the selfie, the redness before and after, and the honest sentence
when it does not help. Then the real check: put a corrector on and measure again.

### 4 · Wardrobe — *"Add a garment"* (~14 s per garment, 1 API task)

Photograph a garment flat, on a surface of a clearly different shade. Film three moments:

1. **A plain garment** → reported solid, dominant share near 100%.
2. **A printed garment** → detected as patterned; the colour reported is the fabric.
3. **A second garment nearly the same colour** → the duplicate alert fires *before* it joins
   the wardrobe. Buying a second copy of something you cannot recognise as a second copy is an
   ordinary, invisible loss.

With two or more garments the wardrobe shows **colour families**: *"your wardrobe has 4
colours, not 9"*.

### 5 · Try it on (~14–25 s, 1 API task)

🎬 **Say this out loud, it is the design argument:** the verdict comes *before* the picture and
does not need it. A try-on image is the one output this user cannot evaluate. So the answer is
text, computed from the measured colours; the picture is for fit and drape.

### 6 · Should I buy this? — the shopping beat

Photograph something as if in a shop. Returns **"works with X% of your wardrobe"**, computed
locally from measured colours, plus what it clashes with and how it sits against your own face.

### 7 · Over MCP *(optional, 10 seconds for a technical audience)*

`/mcp` runs lighting, face colour and phototype over the **Model Context Protocol** with
automatic fallback to REST, and shows which server, tool and transport answered each step.

---

## The four things that make this different

1. **It measures the user, it does not ask them.**
2. **Every answer carries a confidence, and the app can refuse.** It exists because this user
   is the one person who cannot catch us being wrong.
3. **No language model decides anything.** Colour naming is a deterministic lookup.
4. **Skin and shopping are one decision.** The face measured with Skin AI is what every
   garment and every try-on is judged against.

---

## Things NOT to claim on camera

Everything here was measured, and overstating it would undo the entire argument.

- ❌ **"We correct colour blindness."** Nothing does. Assisted contrast moves information into
  channels the user can see; it does not change their eyes.
- ❌ **"It works offline."** Every colour is a measurement.
- ❌ **"It detects the lighting in a garment photo."** Separating the lamp from the fabric needs
  a surface of known colour in the frame. It says so.
- ❌ **"It tells you if you have too much redness."** It reports the score and deliberately
  declines to grade it.
- ❌ **"The scarf try-on shows your scarf."** That engine restyles the scarf, outfit and
  background: a magenta reference came back crimson, ΔE 31.4 away. The app warns about it.
- ❌ **Any invented number.** If a figure is not in the README, do not say it.

---

## If something fails during the shoot

- **"The account has run out of credits"** → real, and retrying will not help. Switch the key in
  Vercel and redeploy.
- **"The service is busy"** → the shared rate limit; wait half a minute.
- **A refusal about light** → that is the product working. Consider keeping it.
- **A selfie refused for angle or distance** → the message says what to change; follow it.
- **"I can't find the garment"** → garment and surface are too close in colour.
- **Everything in Spanish** → the browser is auto-translating. Turn it off.
