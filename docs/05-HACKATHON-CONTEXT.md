# Hackathon context — YouCam API Skin AI & eCommerce VTO Hackathon

Summary of the official rules and page at
[youcam-api-skin-ai-ecommerce.devpost.com](https://youcam-api-skin-ai-ecommerce.devpost.com/)
(read 31 Oct 2026). **The official rules prevail** over this summary and over the
hackathon page if they ever disagree.

---

## Dates (Eastern Time)

| | |
|---|---|
| Registration | 24 Sep 2026 12:00 pm – **2 Nov 2026 11:45 am** |
| Submission period | 29 Sep 2026 12:00 pm – **2 Nov 2026 11:45 am** |
| Judging | 3 Nov 2026 12:00 pm – 20 Nov 2026 11:45 am |
| Winners announced | on or around 24 Nov 2026 |

Once the submission period ends, the submission cannot be changed. **The live app must
stay available, free and without restriction, until judging ends (20 Nov).**

Sponsor: Perfect Mobile Corp. (Perfect Corp). Administrator: Devpost.

---

## The challenge

Integrate **at least one YouCam API** into a functional web or mobile prototype that
delivers clear consumer or retail value — "fresh, unexpected solutions to real-world pain
points in beauty, fashion, or eCommerce", not surface-level wrappers. The experience must
be intuitive enough that a first-time user grasps its value at once. Agentic AI workflows
are welcome.

Two topics; pick the one that fits (KROMA covers both):

- **Skin AI** — meet people at the moment they wonder about their skin: before a purchase,
  after a breakout, in front of a mirror. Help them understand their skin and know exactly
  what to do next.
- **eCommerce VTO** — beauty and fashion decisions rarely happen in isolation: "what
  someone wears and how they look are part of the same self-image". Bring virtual try-on
  together into one seamless experience that reimagines how people shop.

### How KROMA maps onto the topics

| Topic | KROMA |
|---|---|
| Skin AI | F2 colour portrait (skin tone, Fitzpatrick, redness), F15 corrector computed from the measured skin, F16 corrector rendered and its effect on redness measured |
| eCommerce VTO | F12 "Should I buy this?", F13 clothes try-on, F14 scarf and hat, F19 outfit on the body, makeup try-on — every one judged against the user's own measured face and wardrobe |

---

## What to submit

- **Code repository URL**, with all source code, assets and instructions needed to run
  it. Either **public with a licence**, or **private and shared with
  `contact_event@PerfectCorp.com`**.
- **Text description** explaining the features, functionality and clear consumer or
  eCommerce value.
- **Screenshots** of the project.
- **Demo video, 1–3 minutes** (judges need not watch past 3:00): shows the experience end
  to end, **explains the YouCam APIs used**, shows the project **running on the device it
  was built for**, public on YouTube (preferred) or Vimeo, and contains no third-party
  trademarks or copyrighted music without permission.
- **Testing access**: a link to the working project. It must be free and unrestricted for
  testing until judging ends; if anything is private, include credentials.
- Everything **in English** (or with English translations).
- Winners must take part in an exit interview.

### Project requirements worth re-reading

- **New & existing projects.** A project may be newly created, or one that existed before
  the submission period and was **significantly updated after it started** — in which case
  the entrant must **explain how it was significantly updated** during the period.
- **Functionality.** It must install and run consistently on its platform and work as shown
  in the video and description.
- **Third-party APIs/SDKs** must be used within their licences.
- **Original work**, solely owned by the entrant. Open source is allowed if its licences are
  respected and the project builds on it.
- No project developed with financial or preferential support from the sponsor.
- Multiple submissions are allowed only if substantially different from each other.

---

## Judging

**Stage One (pass/fail):** the project reasonably fits the theme and reasonably applies the
required APIs.

**Stage Two:** four equally weighted criteria.

| Criterion | The question | What answers it in KROMA |
|---|---|---|
| **Technological Implementation** | How thoroughly and skilfully is at least one YouCam API (Skin, Beauty, Fashion, Jewelry & Watch, Hair & Beard) integrated? Clear consumer or eCommerce value? Genuine, working, non-trivial code? | Five face/skin endpoints chained with a confidence layer; redness × phototype as a technical necessity; try-on judged against measurements; MCP with an audited trace; offline harnesses that prove the colour engine |
| **Design** | A complete, coherent product experience — not just a technical proof of concept? | Guided onboarding from an empty app, refusal states, actionable error messages, accessibility that never relies on colour alone |
| **Potential Impact** | A credible, specific case for a real problem for a real audience, addressed by what is demonstrated? | ~300 million people with CVD; documented coping strategies (safe-colour wardrobes, asking someone else) answered feature by feature |
| **Quality of the Idea** | A creative, non-obvious use of a YouCam API, with genuine understanding of the problem space? | The API as sensory substitution for a missing channel: the user cannot see the colour of their own face |

Ties are broken by Technological Implementation, then the next criteria in order.

---

## Prizes

| Prize | Award |
|---|---|
| 1st | $2,500 + feature blog + product/developer marketing meeting |
| 2nd | $1,000 + feature blog + meeting |
| 3rd | $500 + feature blog + meeting |
| Women in Tech Special Award | $1,000 (team with at least one member who self-identifies as a woman) |
| Rising Star Award (students only) | $1,000 (team with at least one enrolled student, school email required) |

A project can win only one prize.

**Social sharing bonus** (does not affect judging): 500 API units per platform, up to two,
for a public demo video that tags @YouCam API, names the APIs used and includes the
disclosure "Received API credits for sharing"; claim form by the end of the submission
period.

---

## Free API units

Every registered participant gets a redeem code for **1,000 free API units** (valid 90 days
from redemption): register on Devpost → receive the code by email → sign up at
yce.perfectcorp.com/ai-api → Account → Redeem Code. `npm run credits` prints the balance.

---

## Submission checklist

- [ ] Repository shared with `contact_event@PerfectCorp.com` (private) **or** public with a licence
- [ ] README with what it does, how to run it and how to test it
- [ ] Text description (`docs/submission/devpost-submission.md` is the draft)
- [ ] Screenshots
- [ ] 1–3 min demo video on YouTube, explaining the APIs, filmed on the device (`docs/submission/video-script.md`)
- [ ] Live URL tested end to end with the production key and enough units for judging
- [ ] Everything in English
- [ ] Submitted before **2 Nov 2026, 11:45 am ET**
