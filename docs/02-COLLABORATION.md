# Collaboration rules

## Branches

`main` is always deployable — every push to it deploys production on Vercel. Work happens
on short branches, one day at most.

```
main
 ├── feat/makeup-foundation
 ├── fix/portrait-angle
 └── docs/video-script
```

**A branch that lives more than a day is a conflict waiting to happen.** If a task does not
fit in a day, split it.

## Pull requests

- Reviewed the same day. An unreviewed PR is a person blocked.
- `npm run check` and the harnesses relevant to the change must pass before opening it
  (see "Before committing" in `CLAUDE.md`).
- Squash merge. A broken `main` is a broken live app.

## Changing the core

`src/core/contracts/types.ts` is the boundary between slices. A change there changes every
slice at once, so it is proposed first, made in one commit, and announced — even for "just
one small field".

## Mock mode by default

`YOUCAM_MOCK=true` in your `.env.local`. Set it to `false` only while validating the real
integration, and back to `true` when done.

**Why:** units are finite and some calls are expensive (a full colour portrait is about 61
units). If everyone develops against the real API all day, there are no units left for the
video or for the judges. `npm run credits` shows the balance at any time, for free.

## Rate limit: the 429 that looks random

250 requests / 300 s **per IP and per token, at the same time**. Several people on the same
network hit the IP limit before the token one, and the symptom looks like a code bug.

If you see 429s with no explanation: it is not your code, it is the team. Space the tests
out or switch network. The client retries a 429 with backoff before giving up.

## Milestones

| When | What happens |
|---|---|
| Feature freeze, the day before the deadline | Only bugs and polish from here |
| **2 Nov 2026, 11:45 am ET** | Submissions close — the submission cannot change after this |
| 3–20 Nov 2026 | Judging: the live app must keep working, and the key must keep its units |

## A note on pace

The last days are not for writing features: they are for polishing, recording and
writing. That depends on judgement and taste, which are the first things to go without
sleep.

**When torn between finishing one more feature and polishing what exists: polish wins.**
Design is 25% of the score.
