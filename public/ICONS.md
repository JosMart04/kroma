# App icons — what to hand over

Two files, replaced in place. **No code changes, no manifest changes.**

| File | Size | Requirements |
|---|---|---|
| `icon-192.png` | 192 × 192 | square, PNG, fully opaque |
| `icon-512.png` | 512 × 512 | square, PNG, fully opaque |

Opaque matters: a transparent icon rasterises against whatever the OS puts
behind it, which is often black, and a logo designed on white disappears.

---

## The one trap: `maskable` — currently satisfied, keep it that way

Android does not show your icon as you drew it. It crops it to whatever shape
the launcher uses — circle, squircle, rounded square — and **keeps only the
central 80%**. That is the "safe zone": a circle of radius 40% of the icon
(205 px on a 512), centred.

**The current icon passes**, measured: background full bleed to all four edges,
`rgb(24,27,44)`, artwork bounded by 142,112 → 388,422, and **0.0% of it outside
the safe zone**. So `icon-512.png` is declared `maskable` in the manifest and
fills the launcher shape edge to edge.

⚠️ An earlier version did not pass — it had its own rounded badge and a wordmark
along the bottom, and **30.5% fell outside**, so Android would have cut the
corners and part of the name. The declaration had to be dropped until the
artwork was redrawn. If a future icon reintroduces its own rounded corners or
pushes text toward the edges, **remove the `maskable` entry again** rather than
ship a cropped logo.

Rules for any replacement:

- background runs off **all four edges** — no rounded corners of your own, the
  launcher adds them;
- everything that must survive sits inside the centred circle of radius 205 px;
- rule of thumb: logo at about **72% of the canvas**, centred.

---

## Checking a replacement before shipping it

From the project root. Reports the size, whether it is opaque, and how much of
the artwork the launcher would cut:

```bash
npm run check:icons
```
