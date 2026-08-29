# App shell & navigation — direction

**Status:** brainstorm output, not a spec. Produced in conversation before
`/scope`, so nothing here was checked against the repo beyond what is cited.
Take it to `/scope` and then `/architect`; do not build from it.

**Resolves:** the gap named in the app shell brief — no decision existed
anywhere about the authenticated app's page inventory or navigation, while
features 9, 11 and 12 were each about to invent their own.

---

## How to route this file

Two audiences, deliberately kept in one file for now. Split when convenient.

- **FOR SCOPE** — everything down to and including "Suggested path". This is
  the app shell decision: page inventory, navigation, landing destination,
  header, mobile. Enroll as a named Foundation feature ahead of feature 9.
- **FOR CARRY-FORWARD** — the final section, "For the carry-forward file".
  Findings tagged to features 11 and 14 that came out of the same
  conversation but belong to those specs, not to the shell. Move them into
  `docs/jobhunt-carry-forward.md` under their feature headings.

---

## What constrained the answer

From `scope.md`, already decided and not reopened here:

- Feature 23 (Applications dashboard) is v1.5. **v1 has no dashboard.**
- Feature 11: results are fresh per search and never persist. **There is no
  saved-results view.**
- Feature 12: the application record is the only place a job persists.
- Feature 6's header and footer live in `(marketing)`. That is the
  unauthenticated surface and is separate.
- `(app)/layout.tsx` is a security boundary only: session check, redirect on
  failure. No chrome.

Those together mean a signed-in user can do three things — complete a
profile, search and read results, record an application — so the inventory
is small by construction, not by preference.

---

## The decisions

### 1. Page inventory: three routes, two in the nav

| Route | What it is | In the nav? |
|---|---|---|
| `/search` | Search and results. This is the app. | Yes |
| `/profile` | View-first, editable. The user's information as the system holds it. | Yes |
| `/applications` | The application record list. | **No** |

**The search route is `/search`, and this was already settled by accepted
spec text — not a toss-up for `/architect` to decide.** Spec 0006's Security
model is explicit about what the front door is: "The page is public and reads
nothing. No session check, no Supabase client, no Server Action, no user data
of any kind." Its AC-4 states the consequence — the route renders zero client
JavaScript and prerenders statically. A `/` that branches on session would
put a Supabase read in front of that public marketing page and force it
dynamic. That is not choosing between two open options; it amends spec 0006's
Accepted contract, which nothing here is entitled to do. `/search` leaves `/`
as the accepted entry page and gives search a structurally separate home,
which is how this project has settled comparable questions.

The one real constraint the earlier framing named still holds: route groups
add no path segment, so `(app)/page.tsx` cannot also be `/`, and
`src/app/(marketing)/page.tsx` remains the only file resolving to `/` today.
That bounds the decision; it never made it open.

An earlier draft of this document presented `/` as settled while also listing
the same question as open, and a later draft corrected that to genuinely
open. Both were wrong — this was miscategorized as an open routing preference
when existing spec text had already settled it — and it is now resolved, not
still pending. Everything else in the inventory holds: `/profile` and
`/applications` are unclaimed in the current tree.

**Profile is view-first, not a form.** A page the user can look at, with
editing available — not a form filled once and never seen again. The
product's argument is about fit between a profile and a posting, so seeing
what the system thinks you are is part of that argument. Note this is a
slightly stronger reading than feature 9's done-when clause, which says
"create and edit" and would most naturally be built as a form.

**Applications is its own route, reached from a link on `/profile` and from
the confirmation after marking a job applied.** Not nested inside profile as
a section, and not in the nav.

Why not nested: profile is stable and edited occasionally; applications grow
every time the user applies, and in a real job search that is dozens of
records within weeks. A list that grows without bound inside an otherwise
static page eventually dominates it, and would have to be split out later
under pressure. The two also answer different questions — "who am I to this
system" versus "what have I done lately".

Why not in the nav: until feature 20 adds captured answers, the record is
thin. It should exist and be findable without claiming equal billing with
search. Features 20 and 23 then have somewhere to land without a
restructure.

### 2. Post-sign-in destination: conditional, then a gate later

**BLOCKED — revisit before this file is treated as final input to
`/architect`.** This rule is pending feature 7's decision on whether a
profile row is auto-created via an `auth.users` trigger on signup. If that
trigger is chosen, "land on `/profile` if no profile row exists" stops being
a meaningful check — a row always exists — and must be replaced with a
completeness check across skills, work history and job preferences, which is
a different query than `readOwnProfile()` answers.

**Now (feature 9):** land on `/profile` if the user has no profile row,
`/` otherwise. A branch on data already read at sign-in — no first-time
flag, no session state, no onboarding machinery.

**Later (feature 14):** scoring is unavailable when the profile carries too
little to score against.

Both, not either. They ship at different times and neither adds to v1's
critical path: at feature 11 there is nothing to gate, because search
without scoring is a complete product. The gate becomes necessary exactly
when scoring does.

**Why the gate and not routing alone:** landing on profile nudges, it does
not prevent. A user can type one field, navigate away, and the failure is
still reachable. And the failure is the shape this project is organised
against — an empty profile would produce scores that compute, render, and
look exactly like real ones. A match bar reading 0 of 11 with an empty gap
list is a confident wrong answer, not an error.

**Consequence:** because it is a correctness guard and not a UX nicety, the
check cannot live only in the UI. It belongs where scoring happens, so a
Server Action called directly refuses too.

**Named open question, tagged to feature 14:** what counts as *enough*
profile to score against. Skills alone may suffice for matching, or the band
rubric may need a role and seniority to mean anything. Feature 14 owns the
rubric, so it owns this threshold. Feature 9 stores the fields; feature 11
respects the gate.

**Scope risk to name in the spec:** the threshold turning into a completeness
meter, a progress bar, or a multi-step wizard. The gate is a refusal with a
reason, not an onboarding flow.

### 3. Mobile: no navigation machinery

Two nav links plus a logo fit at 320 pixels. No hamburger, no drawer, no
bottom tab bar.

Feature 6's marketing header has a mobile menu because it carries more
links; the signed-in header does not need one. Recorded as a decision rather
than left implicit, so it is not added later out of habit. This also closes
the mobile/responsive posture item that the idea brief's open items flagged
as never decided at all.

### 4. The header: one component, varied by route group

One header component with two variants. **Which variant renders is decided
by the route group, not by a prop passed at each call site**: the marketing
layout renders the signed-out variant, `(app)/layout.tsx` renders the
signed-in one.

Structural rather than per-page, for the same reason spec 0005 assigned
container idioms explicitly instead of leaving them to implementation. A
prop each page has to remember is a convention; a layout is a mechanism.

The signed-in header carries: logo, `Search`, `Profile`, sign out.

Spec 0006 promised this inheritance directly. Its Positive tradeoffs list
states that "Header, footer and logo exist as components before the second
page needs them, so feature 7's sign in screens and the application shell
inherit them rather than reinventing them" (spec 0006 index.md). The promise
is only half kept in the tree: `Logo` landed in `src/components/ui/logo.tsx`,
but `EntryHeader` and `EntryFooter` are feature-local under
`src/features/entry-page/`, and the folder-by-feature rule forbids another
feature from importing them. The shell feature must therefore promote a
shared header primitive into `src/components/ui/` — or knowingly build a
second header, named as such. This is a required scope item for the feature
being enrolled, not an implementation detail to discover mid-build.

---

## What the shell actually is

A header above whatever the page renders, inside `(app)/layout.tsx`. No
sidebar, no tabs, no drawer, no persistent indicators.

**State this as deliberate in the spec, with the reason** — v1 has three
routes and one of them is not in the nav. A later reader seeing a shell this
thin will otherwise assume it was left unfinished.

---

## Fit with the design system

Spec 0005's output was not only `Card` / `Section` / `Text`. It was a
register: the monospace reasoning voice as the organising idea, two
container idioms split by elevation (elevated for the single most important
object, flat for peers), and three rhythm tiers.

The shell has to hold that register, and a minimal shell holds it more
easily than a chrome-heavy one. Worth checking during `/architect` that
nothing in the navigation competes with the elevated idiom, since on a
results page the elevated object should be the result being reasoned about.

---

## Still open, deliberately

- **The sufficiency threshold** (above) — feature 14's.
- **`robots: { index: false, follow: false }`** is set at the root layout, so
  it currently applies to signed-in routes too. Probably right, but it was
  inherited rather than chosen for them. Worth a deliberate line.

**Resolved, not open — the search route.** `/search`, settled by spec 0006's
Security model ("The page is public and reads nothing. No session check, no
Supabase client, no Server Action, no user data of any kind") and AC-4 (zero
client JavaScript, static prerender); see section 1. A `/` that branches on
session would put a Supabase read in front of the public page and force it
dynamic, amending the Accepted contract rather than choosing between options.
The trail, for the reader who has watched this document get it wrong twice:
first presented as settled while also listed as open, then corrected to
genuinely open, now closed for real.

---

## Suggested path

`/scope` this as its own named feature in the Foundation tier, ahead of
feature 9, then `/architect` it. The brief's sequencing note holds: it does
not block feature 7, whose done-when clause needs no decided shell, but it
must land before feature 9 starts.

A visual mock-up is worth its cost here in a way it was not for the
single-page landing port — but **after** the inventory above is accepted,
not before. Drawing first would silently re-answer decision 1.

---
---

# For the carry-forward file

**Not for `/scope`.** These came out of the same conversation but belong to
feature specs, not to the app shell. Move them into
`docs/jobhunt-carry-forward.md` under the feature headings named below.

Source for all of them: the reference project's own screens, viewed 2026-08-29
— its results table, its job detail page, and a real Adzuna description as that
project stored it. Reading a shipped implementation of the same idea, so these
are observations of a real artefact rather than reasoning about one.

---

## Feature 11 — Job search & results list

**The reasoning goes in the list, not behind two clicks.**

Two list patterns were compared: a table (one row per job, match score as a
percentage in a column) and a split pane (short list left, scrollable detail
right). Both are built for boards that have nothing to say about a job beyond
its title, so both treat the list as triage and the detail as the payload.

That is the wrong shape here. This product computes an argument — matched
skills, gap skills, why each gap matters — and an argument does not fit in a
table cell. In the reference project the reasoning was the best content on the
page and sat two clicks deep, behind the list and then behind the detail page.
The same pattern shows on the large commercial board, which hides its match
explanation behind a "Show match details" disclosure.

**The decision:** a single-column list of result cards, each carrying company,
role, score, matched chips, gap chips and the one-line summary. The card
role, score, matched chips, gap chips and the one-line summary. The same
composition exists as the hero of the entry page (spec 0006) — `Card`,
`MatchBar`, `Chip` and `ScoreBadge` together — so the pattern is designed
already. **But it is not a shared component:** `ExampleResultCard` in
`hero-section.tsx` is a private, unexported, feature-local function, so
feature 11 rebuilds the pattern rather than importing it, and the two can
drift. Whether to extract a shared component is feature 11's call. A detail page carries the source
material: the description as stored, company research, and the link out.

The split to hold: **the list is "what we concluded and why", the detail is
"the source, read it yourself".**

**The honest counter, worth recording:** a full card per result means roughly
three visible at once rather than twenty rows. That is a bet on ranking
quality. If the ranking is good the bet pays; if it is not, scrolling tall
cards is worse than scanning rows. It is the same bet the product already
makes, so it is not a new risk — but it is a real one, and feature 14's band
spread is what settles it.

**Steal this line verbatim.** The reference project labels its stored
description with a sentence saying it ends where the source's preview stops,
plus a link to the full post. That is exactly the honest labelling the
snippet entry under feature 14 asks for, already solved. Do not silently
render a truncated description as if it were the posting.

---

## Feature 14 — Fit scoring

**The snippet may be more usable than assumed. Do not over-design around
truncation.**

A real Adzuna description, as stored by the reference project, was read
directly. It cut off mid-sentence — but the full requirements list arrived
before the cut: ML/GenAI/LLM feature work, cloud-native deployment, RAG
pipelines, vector databases, conversational AI, RESTful APIs and microservices
for model serving, containerisation and orchestration.

The existing snippet entry under this feature still stands, and the ten real
results test still needs running. But the prior should shift: the failure mode
may be less common than "scoring against a partial description" implies, and
a design that assumes every snippet is unusable would be solving a problem
that does not always occur.

**Clustering is the real failure, not truncation.**

Same reference project, same screens. Its detail page produced specific,
plausible reasoning — the named gaps (RAG pipelines, vector databases,
container orchestration) were all genuinely absent from the candidate profile
and genuinely present in the description. The reasoning was right.

Its results list showed eight consecutive jobs, seven of them the same company
and role, every one scored **75%**.

So the reasoning layer worked and the number was meaningless anyway. This is
the reference audit finding this feature's done-when clause already targets
(anchored band rubric, spread across bands rather than clustering) — and this
is direct evidence that it is the failure that actually happens, not a
theoretical one. Truncation was not what broke it.

**Consequence for the band rubric:** correct-looking reasoning is not evidence
the score is sound. The two can be tested separately and should be. A test
that checks "does the reasoning cite real skills" would have passed on the
reference project's output.

**Company research fires on a button, never automatically.**

The reference project gates its company research behind an explicit "Research
Company" control, with an empty state until pressed. One call per job, on
demand, only when the user cares.

Independent arrival at the cost-bounding pattern already recorded under this
feature from `santifer/career-ops` (`--verify` run sequentially, only on new
offers after dedup). Two implementations reaching the same shape is worth
noting.

This also bears on the fetch-versus-score sequencing question: scoring against
a snippet risks gaps that are not real, which argues for fetching before
scoring rather than on detail-open. But fetching every scored result multiplies
cost against the Adzuna budget already worked out under feature 10. That
tension is real and unresolved; it is the strongest argument yet for the
two-tier ranking idea already queued under this feature — cheap pass over
snippets, full fetch and score on the top few — as the only way to fetch
everything scored without fetching everything retrieved. **Still an idea, not
a decision.**
