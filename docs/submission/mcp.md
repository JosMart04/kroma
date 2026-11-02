# MCP in KROMA — what was verified, and what it is trusted with

## End to end, on the official servers

Criterion: *end to end = initialize → tools/list → one real tool call. Listing tools does
not count as working.*

All three steps work with `@modelcontextprotocol/sdk` over Streamable HTTP:

```
1. initialize    ✅  "YouCam for Beauty & Personal Care"
2. tools/list    ✅  50 tools on beauty
3. tools/call    ✅  AI-Facial-Color-Tones-Analyzer → a real result
```

## The three servers

| Server | URL | Tools (31 Oct 2026) |
|---|---|---|
| Beauty | `https://mcp-api-01.makeupar.com/mcp/beauty` | **50** |
| Fashion | `https://mcp-api-01.makeupar.com/mcp/fashion` | **19** |
| Creators | `https://mcp-api-01.makeupar.com/mcp/creators` | **37** |

Authentication: the same key as REST, as `Authorization: Bearer <YOUCAM_API_KEY>`.

The tools that matter here exist and are readable: `AI-Facial-Color-Tones-Analyzer`,
`AI-Fitzpatrick-Skin-Type-Analysis`, `AI-Skin-Analysis`, `AI-Makeup-Virtual-Try-On`
(beauty) · `AI-Clothes-Virtual-Try-On`, `AI-Scarf-Virtual-Try-On`, `AI-Hat-Virtual-Try-On`
(fashion) · `AI-Photo-Lighting`, `AI-Photo-Background-Removal` (creators).

⚠️ **The servers spell names with hyphens; the documentation lists them with underscores**
(`AI_Clothes_Virtual_Try_On`). The client resolves names against `tools/list` ignoring
separators and case, so either spelling works. `npm run probe:mcp` prints the live list for
free — `tools/list` is protocol metadata and spends no units.

## What MCP adds over REST, measured rather than assumed

Input schemas arrive **self-described**, with enums and help text: `garment_category`
including `outer`, `filter_multi_person`, `face_angle_strictness_level`, `change_shoes`, and
a `polling` switch. Every tool accepts a `src_file_id` from the File API, so **uploads are
shared with the REST path** and the image pipeline is not duplicated.

## ⚠️ The two transports do not return the same number

Same image, same `file_id`, measured over REST and over MCP:

| Feature | REST | MCP | ΔE2000 |
|---|---|---|---|
| skin | `#b48d72` | `#b79075` | **1.0** |
| eye | `#582109` | `#6e310d` | **6.4** |
| lip | `#e78982` | `#e78882` | 0.4 |
| brow | `#5b3f32` | `#5b3f32` | 0.0 |
| hair | `#000000` | `#000000` | 0.0 |

Skin differs by ΔE 1.0 — below the perception threshold. **The iris differs by ΔE 6.4,
which is visible.** (Hair matching exactly says little: it is one of seven preset category
swatches.)

The cause is not known — a different default `face_angle_strictness_level` is one
candidate, engine non-determinism another. KROMA pins the strictness level explicitly
on both transports. **What matters for the product is choosing one path and not mixing
them**, or the same user could be told two different eye colours depending on the internal
route — an inconsistency a colour-blind user could never detect.

**Decision:** REST owns every measurement that feeds a verdict. MCP renders garments in
production (`/api/tryon`, `/api/outfit`, with REST underneath) and runs the measurement
tools in an audited run (`/api/mcp`) that shows which transport answered each step.

## Failures inside successful responses

A task that failed on the engine can come back as a perfectly successful MCP response, with
`isError` absent and the failure written inside the payload:

```json
{"error_message": "YcoApiException - Start request failed: 400, ...
 {\"error_code\":\"CreditInsufficiency\"}", "request_id": "..."}
```

The client inspects the payload, not only the protocol flag, so a step only counts as done
when it did real work.
