# Slice: shopping

F12 "Should I buy this?" — a garment photographed in a shop, judged against the wardrobe and the portrait before it is bought.

Screens: `/analyze`

## Rules

- Code here may import from `src/core/**` (colour engine, contracts, local
  storage, UI kit, YouCam client types).
- Anything several slices need belongs in `src/core`, not copied between slices.
- `src/core` must never import from here, server code must never import local
  storage (`src/core/db`), and no API route may import the assisted-contrast
  filter. `npm run boundaries` enforces all three, and CI runs it on every push.
- Every YouCam call goes through a route handler in `src/app/api/**`: the API key
  never reaches the browser.
