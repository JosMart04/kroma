# Architecture

## The shape

One Next.js 15 app (App Router) deployed to Vercel. A shared **core**, and **feature
slices** that build screens on top of it.

```
                         src/core  (everyone depends on it)
     ┌──────────────────────────────────────────────────────────────────┐
     │ contracts · color · youcam · mcp · db · ui                       │
     └──────────────────────────────────────────────────────────────────┘
          ▲            ▲            ▲            ▲            ▲
   features/face  features/wardrobe  features/shopping  features/tryon  features/makeup …
          ▲            ▲            ▲            ▲            ▲
                 src/app  (pages and API route handlers)
```

| Folder | What lives there |
|---|---|
| `src/core/contracts` | The types that cross slice boundaries (`CVDProfile`, `ColorPortrait`, `Garment`, `PairVerdict`, …) |
| `src/core/color` | The colour engine: sRGB/Lab, CIEDE2000, Machado 2009 simulation, assisted contrast, garment measurement, confidence, naming, verdicts, families, outfits, makeup maths. Pure functions, no Node dependencies |
| `src/core/youcam` | The only door to the REST API: upload, polling, error table, per-request time budget, mock fixtures, try-on category mapping |
| `src/core/mcp` | The MCP client over Streamable HTTP (server-only) |
| `src/core/db` | IndexedDB storage (`idb`). **Client-only** |
| `src/core/ui` | Shared components: camera input, dual view, confidence banner, verdict badge, lightbox, view preferences |
| `src/features/*` | Screens and slice-specific logic: calibration and portrait (`face`), wardrobe and outfits, shopping analysis, try-on, makeup studio, MCP run, onboarding |
| `src/app/api/*` | Route handlers — the only code that talks to YouCam |

## Data flow

- **Reads and writes of user data:** client components → IndexedDB (`@/core/db`). There is
  no server-side storage and no account.
- **YouCam calls:** route handlers in `src/app/api/`. They are **stateless**: receive an
  image, call the API, return the result. They exist so the API key never reaches the
  browser. Each one runs inside `withBudget()` so polling stops before Vercel's 60 s limit.
- **Colour simulation and assisted contrast:** in the browser, on a canvas, from
  `src/core/color`.
- **State:** React state and Context. **No global state manager.**

## Dependency rules

```
src/core/*         →  never imports from src/features or src/app
src/app/api/*      →  never imports src/core/db (IndexedDB is browser-only)
src/app/api/*      →  never imports the assisted-contrast filter (presentation ≠ measurement)
```

`npm run boundaries` (part of `npm run check`, and run in CI) enforces all three.

## Why not other options

| Alternative | Why not |
|---|---|
| **Hosted database** (Supabase, Turso) | Adds a login, and a judge behind a login lands in an empty wardrobe anyway. The wardrobe belongs to the person holding the phone |
| **SQLite on the server** | Vercel's filesystem is ephemeral and wiped between invocations |
| **Native app** (Kotlin/Swift) | An APK leaves out every iPhone; TestFlight needs Apple review. A link anyone can open beats both, and the PWA installs on Android, iOS and desktop |
| **Layered architecture** (controllers / services / models) | Groups code by file type rather than by feature; every change touches every layer |
| **Separate services or repos** | Coordination and deployment cost far above the benefit. One deployable is a real advantage |
