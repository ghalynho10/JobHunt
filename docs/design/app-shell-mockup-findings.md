# App shell mock-up — findings

**Source:** docs/design/jobhunt-app-shell.html, driven directly in a real
browser (Chromium via Playwright) at 1440×900 and 320×800, reviewed
2026-08-29/30. Token-level consistency is covered separately in
ui-registry.md's "Design tool import audit, 2026-08-30" — this file covers
what that audit doesn't: layout, density, and information architecture.

## Confirmed correct against the shell decision

- Routes render as `#/search` and `#/profile`, not `/` — matches the
  resolved decision in app-shell-direction.md.
- Header: logo + Search + Profile + Sign out, no menu, zero horizontal
  overflow at 320px (confirmed via scrollWidth/clientWidth, not a screenshot
  guess).
- `/applications` is reached only via a link on `/profile`
  ("Tracked applications"), not in the nav — matches the settled decision.
- On `/profile`, "Skills & learning" is the one elevated card — a
  deliberate, defensible answer to the open question ("if every result is a
  peer, is anything elevated?"): skills literally drive every match score.
  Worth naming this explicitly in the spec rather than leaving it implicit.

## The headline finding: card density

Full-detail cards, measured live: **0 of 7 results fully visible above the
fold at 1440px** (only 1 starts above it). The compact alternative built
into the same page: 71px rows instead of 391px, an 82% height reduction,
**6 of 7 fully visible**. The compact row keeps score, top gap chip,
salary, and the match fraction; full reasoning (19 matched chips, 14
non-top gap chips, 7 summary lines) moves to the per-job detail view.

**Recommendation: take the compact list as the real direction for feature
11's results screen**, not full-detail.

## Worth a decision, not blocking

- Header tap targets measure 32px (1440px) and 28px (320px) — both clear
  WCAG 2.2's 24px AA floor, but sit under the 44px "comfort" target the
  mock-up's own panel flags.
- The Adzuna mark in the mock-up is a placeholder dot, not Adzuna's real
  logo image — needs the real asset before feature 11 ships. The
  attribution block itself measures exactly 116×23px, correct.

## Token-level consistency

Covered in full in ui-registry.md's design tool import audit (2026-08-30) —
radius mismatches, two invented border colors, card padding/shadow, the gap
chip's color, unused status colors, off-scale text sizes, and the open
ScoreBadge third-size decision. Don't duplicate that here; read it there.
