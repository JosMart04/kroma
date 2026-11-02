# YouCam API — what an integrator needs to know

> Everything here was checked **against the live API and MCP servers with a funded key**,
> and against the documentation (v1.16) and its OpenAPI specs — verified 31 Oct 2026.
> Each row says how.
>
> 📄 **The extended version, addressed to Perfect Corp:**
> [`perfect-corp-dossier.md`](perfect-corp-dossier.md). It adds the engineering built around
> each issue, our own declared limits, and what we would build if the platform offered it.
> This file is the operational summary.

Most of it can be reproduced **without spending units**:

```bash
npm run probe:mcp     # tools/list on all three servers — protocol metadata, free
npm run cost          # the full, paginated price list — free
npm run credits       # the balance — free
```

---

## 1. Routes and prices

| Fact | How it was checked |
|---|---|
| The real paths are short: `/task/lighting`, `/task/sod`, `/task/makeup-vto`. `/task/makeup` is a 404 | Zero-cost probe with an invalid `file_id`: an existing route answers `400 InvalidParameters`, a missing one `404 NotFound` |
| `/s2s/v2.0/credit/feature-cost` is **paginated, 20 SKUs per page** — six pages, 103 SKUs. Page 1 contains none of the Skin AI or try-on SKUs | Following `next_token` until null. Each SKU's `run_task_url` names its real endpoint |
| The balance is `GET /s2s/v1.0/client/credit` — a **v1.0** prefix, unlike every task | Called it; `/credit/balance` variants are 404 |

Costs that matter for this product (units, charged only on success):

| Feature | Units |
|---|---|
| Facial Color Tones Analyzer | 20 |
| Fitzpatrick Skin Type | 10 |
| Skin Analysis v2.1 SD, 1–4 concerns | 9 (the same for one concern or four) |
| Photo Lighting | 2 |
| Background removal (`sod`) | 1 |
| Clothes try-on (`cloth-v4`), scarf, hat | 2 |
| Makeup try-on (`makeup-vto`) | 1 |

---

## 2. Parameters that decide whether a call succeeds

| Parameter | What to know |
|---|---|
| `garment_category` (`cloth-v4`) | `full_body` · `upper_body` · `lower_body` · `shoes` · `auto` · **`outer`**. `outerwear` is rejected with 400 |
| `filter_multi_person` (`cloth-v4`) | `off` (default — dresses the **largest** person) · `normal` · `strict`. A rejection comes back as **`error_multi_person`** |
| `face_angle_strictness_level` (skin tone) | `strict` (4°/6°/4°) · `high` (10°, default) · `medium` (15°) · `low` (20°) · `flexible` (30°). Send it explicitly: the MCP schema's default is `null` |
| `version` (Fitzpatrick) | Required, only `"1.0"`. The phototype comes back as a Roman numeral string (`"III"`) |
| `gender` (scarf, hat, bag, shoes) | Required, absent from the generic examples |
| `style` (scarf, hat) | Restyles outfit **and background**, default `random`, no "keep original" value |
| `dst_actions` (skin analysis) | All SD or all HD, never mixed. HD needs a short side ≥ 1080 px |
| `format` (skin analysis) | Send `json`; the default is `zip`. Results are an **array** (`output[]`), and some concerns repeat per `region` |

---

## 3. Image sizes, per endpoint

The Playground resizes images for you; your code must do it itself.

| Endpoint | Short side | Long side | Formats |
|---|---|---|---|
| Facial Color Tones Analyzer | ≥ 320 | ≤ 4096 (downsized above 1080) | jpg/png |
| Fitzpatrick | ≥ 320 | ≤ 4096 | **jpg only** |
| Skin Analysis SD / HD | ≥ 480 / ≥ 1080 | ≤ 2560 (resized above it) | jpg/png |
| Photo Lighting | — | ≤ 4096 | jpg/png |
| Makeup VTO | face ≥ 100 px wide | < 1920, and height < 1080 | jpg/png |
| Clothes (person and garment) | ≥ 384 (512×384 min) | ≤ 4096 | jpg/png |

All under 10 MB. `npm run harness:upload` asserts that every shape KROMA sends fits.

---

## 4. Framing rules, and the error codes they produce

| Engine | Rule | Codes |
|---|---|---|
| Colour analyser | Face fully visible, ≤ 10° by default | `error_face_position_too_small` / `_invalid` / `_out_of_boundary`, six `error_face_angle_*` directions |
| **Skin analyser** | **Face over 60% of the image width** — the strictest rule in the API | `error_src_face_too_small`, `error_src_face_out_of_bound`, `error_lighting_dark` |
| Phototype, makeup | Within 10° of straight on | one code for every angle: `error_face_angle_invalid` |
| Clothes | One person; upper body from the chest up visible; lower body only from worn outfits | `error_pose`, `error_no_shoulder`, `error_invalid_src`, `error_invalid_ref`, `error_multi_person` |

Generic codes any task can return: `error_face_parsing`, `error_inference`, `error_upload`,
`exceed_nsfw_retry_limits`, `error_download_image`, `error_decode_image`. Account-level:
`CreditInsufficiency`, `InvalidParameters`, `BadRequest`, `InvalidAccessToken`. Every one of
them has a user-facing sentence in `src/core/youcam/errors.ts`.

---

## 5. Response fields worth reading carefully

| Field | What to know |
|---|---|
| `face_quality` (skin tone) | `has_face`, `area`, `frontal`, `lighting`, `faceangle` — the engine grading its own input |
| `hair_color` (skin tone) | One of **seven preset hex values** — a category swatch, not a measurement |
| `raw_score` vs `ui_score` (skin analysis) | `ui_score` is adjusted upwards "as a psychological motivator". The reference says raw scores are "higher = healthier"; the official Skills guide says the raw direction "may differ". Verify for your concern |
| task retention | The docs say both 30 days and 24 hours. Assume 24 hours |
| result URL | Valid 2 hours. Download the binary at once |

---

## 6. MCP

| Fact | How it was checked |
|---|---|
| Three servers: `beauty` 50 tools, `fashion` 19, `creators` 37 | `tools/list`, free |
| The servers spell names with **hyphens**; the docs list **underscores** | Comparing `tools/list` with the MCP documentation page |
| A failed task can come back as a **successful** MCP response with the failure inside the payload | `CreditInsufficiency` arrived that way; `isError` was absent |
| REST and MCP returned different iris colours for the same `file_id` (ΔE 6.4; skin ΔE 1.0) | Same upload measured both ways |
| `polling: false` returns immediately; every tool accepts `src_file_id` or `src_file_url` | Tool schemas |

---

## 7. What an integrator takes from all this

1. **Read `tools/list` and the OpenAPI specs, even if you call REST.** They carry enums and
   tolerances the prose pages describe loosely, and both are free.
2. **Follow `next_token` on the price list.** Its `run_task_url` is the best route map there is.
3. **Do not trust `isError`** on MCP responses: inspect the payload.
4. **Pick one transport for anything that is a measurement.** REST and MCP do not return the
   same number, and whoever consumes it cannot tell.
5. **Size images per endpoint**, and keep the polling inside your platform's time limit.
