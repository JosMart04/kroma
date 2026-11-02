# Improvements and MCP — where KROMA goes next

What is built, how MCP is used, and the improvements worth doing next, in priority order.
Every item names the API capability it relies on, verified against the documentation and
the live servers on 31 Oct 2026.

---

## 1. How MCP is used today

| Server | Tools used | Where | Why there |
|---|---|---|---|
| `fashion` | `AI-Clothes-Virtual-Try-On` | `/api/tryon`, `/api/outfit` | Production. A render feeds no verdict, so the transport cannot contaminate a measurement. REST `cloth-v4` underneath |
| `beauty` | `AI-Facial-Color-Tones-Analyzer`, `AI-Fitzpatrick-Skin-Type-Analysis` | `/api/mcp` | Audited run with REST fallback per step |
| `creators` | `AI-Photo-Lighting` (discovered by pattern) | `/api/mcp` | Audited run |

Rules the client follows (`src/core/mcp/client.ts`):

- **Names are resolved against `tools/list`, ignoring separators and case** — the servers
  answer `AI-…` with hyphens, the documentation lists `AI_…` with underscores.
- **A payload that describes a failure is a failure**, even when the MCP response itself
  is a success (`CreditInsufficiency` arrives that way).
- **Measurements stay on REST.** REST and MCP returned visibly different iris colours for
  the same image (ΔE 6.4), so anything that feeds a verdict — including the makeup render
  whose redness is compared before and after — uses one transport.
- **Sessions are not reused** between serverless invocations; each request opens and
  closes its own.

---

## 2. Next improvements, by priority

### P1 · Webhooks instead of polling

The API reference recommends webhooks (Standard Webhooks, HMAC-SHA256, up to 10 endpoints)
and polling "every ~10 seconds" only as a fallback. Today every task is polled inside a
55 s request budget.

- **Gain:** no polling requests eating the shared rate limit (250 / 300 s per token), and
  no 60 s ceiling — multi-garment outfit renders become possible.
- **Cost:** a small server-side store mapping `task_id` → session (the webhook payload only
  carries `task_id` and `task_status`), plus a way for the client to learn the result
  (polling our own endpoint, or server-sent events).

### P1 · Guided capture with the Camera Kit

Most refusals are framing: the colour analyser allows 10° of head angle by default, and the
skin analyser wants the face over 60% of the image width.

- **Web:** JS Camera Kit v2.5 has a `shadefinder` mode for skin-tone capture and `skincare`
  for skin analysis, with real-time face, angle and lighting checks and auto-capture.
  ⚠️ Its `RELAXED` preset accepts a face at 55% of the width — below the skin analyser's
  60% — so use `MODERATE` (65%) or override `face_ratio_lower_threshold`.
- **Native:** Mobile Camera Kit 2.5.0 (Android 6+, iOS 12+) offers the same checks as a
  native SDK; React Native or Flutter would need a bridge.
- **Trade-off:** it needs `getUserMedia`, which the current `<input capture>` design avoids
  on purpose for compatibility. A progressive approach keeps the file input as fallback.

### P2 · Foundation on the face

`makeup-vto` has a `foundation` effect (colour, coverage, glow). F15 already computes a
foundation depth and undertone from the measured skin; rendering it closes the same loop F16
closes for the corrector.

### P2 · Skin type next to redness

Skin analysis returns `skin_type` (normal, oily, dry, combination, and the "+ redness"
variants) at no extra cost: 1–4 SD concerns cost the same 9 units. It gives context to the
redness score without inventing a threshold.

### P2 · Shoes

Shoes try-on V3 (`/task/shoes-transfer`, 2 units) and the `shoes` category of `cloth-v4`
exist. Shoes are in every verdict already; rendering them is a scope decision, not an API
limitation.

### P3 · Mobile app and Chrome extension

- **The API key never ships in a client.** The FAQ shows direct REST calls from mobile, but
  an APK or extension would expose the key. Every client talks to KROMA's own route
  handlers.
- **Chrome extension (Manifest V3):** remotely hosted code is not allowed, so the JS Camera
  Kit from its CDN cannot run inside the extension; open the web app for capture instead.
  Product photos on shopping sites are public URLs, and every task accepts `src_file_url` /
  `ref_file_url`, so the extension can judge a garment without uploading it.
- **Costs at scale:** a full colour portrait is about 61 units; the token rate limit is
  shared by every user of one key.

---

## 3. Not planned, with the reason

- **An LLM deciding anything.** See `04-LLM-POLICY.md`: our user cannot detect a
  hallucination.
- **HD skin concerns.** They need a short side of at least 1080 px; the engine format is
  capped at 1600 px on the long side, and SD answers the redness question.
- **`pf_camera_kit`.** The skin-analysis v2.1 schema lists this flag without describing it.
  Not used until it is documented.
