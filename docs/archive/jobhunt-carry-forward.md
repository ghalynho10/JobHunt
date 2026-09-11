# JobHunt — findings to carry into later specs

Research findings that landed before the spec that owns them was written.
Each is tagged with the feature that inherits it. Delete an entry once it
is written into that feature's spec.

**Every entry carries a status line:** when it was written, its source with
a URL where the source is external, and whether each claim is verified or
inferred. This mirrors the "verify before you recommend" standing rule in
`AGENTS.md`. Without it a claim written months ago reads today as current
fact, which is how three errors survived in the feature 10 entry below.

**Auditing this file asks two separate questions, not one.** *Did it land*
in the owning spec — that is the deletion rule above. *Is it still true* —
that is a different pass, and an entry can be correctly undeletable and
wrong on its face at the same time. Entries that make claims about **other**
features' state are the ones that rot: they are written before that feature
ships and are not revisited when it does.

**Dates below marked `unknown` must be backfilled from `git log` on this
file**, not from memory. A guessed date is worse than none, because it
looks verified.
---

## Feature 4 — Data model

_Written: 2026-08-19 · source: Supabase docs · key
format verified in `src/env.ts`._

**Audited 2026-09-02: this entry did NOT land in spec 0003 and stays.**
The key format landed elsewhere — spec 0001 index line 38, and spec 0002
index lines 191–192 for the env vars. The `apikey` header transport
difference appears in no spec at all, only here and in
`docs/experiments/0002-deployment-and-environments.md:63`.

**The verbatim RLS line below is nowhere in any spec, and spec 0003's
`rationale.md:106` claims it was adopted verbatim.** Someone recorded that
it landed; it did not. Related substance exists in other shapes (0003 index
line 195 forces RLS, line 211 says no table is reachable by the secret-key
client), but not the named line. **Fix the rationale's claim as well as
this entry** — a document asserting a decision its own spec does not carry
stops anyone looking again.

**Supabase API keys changed. Start on the new ones.**
Legacy `anon` and `service_role` keys are deprecated by end of 2026.
Replacements are publishable (`sb_publishable_...`) and secret
(`sb_secret_...`). Greenfield means starting on the new format rather
than migrating mid-build. Current docs use
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Transport difference: the new keys go in the `apikey` header and cannot
be sent as an `Authorization` bearer token.

**The line that belongs in the spec verbatim:** migrating keys does not
secure a project whose tables have no policies. A publishable key in
front of an unprotected table exposes exactly as much as an anon key
did. Key rotation is not a substitute for RLS.

---

## Feature 7 — Auth & per user isolation

_Written: 2026-08-19 · source: Supabase SSR docs ·
audited 2026-09-02._

**Audited 2026-09-02: this entry stays, and two of its three claims are
recorded nowhere.**

- The `@supabase/ssr` choice is in spec 0001 index lines 14 and 33.
  **The rejection of the legacy auth-helpers package is in no spec, no
  `AGENTS.md`, and no code** — a repo-wide search hits only this file.
- The root `proxy.ts` requirement LANDED: spec 0001 binding rule 6,
  index line 133, with the amendment note at 137–139.
- **The `getClaims()` / never `getSession()` prohibition is recorded
  nowhere.** Not a spec, not `AGENTS.md`, not code. The only mention is a
  test-mechanics comment at `src/proxy.test.ts:18`. Feature 7 is done and
  this never landed, so it is a live gap rather than a stale note — and by
  this entry's own argument it belongs in a spec as a named prohibition,
  because a check that passes without proving anything is exactly the
  silent-failure shape.

**Use `@supabase/ssr`, not the legacy auth-helpers package.**

**A root `proxy.ts` is required** (Next.js 16 renamed `middleware.ts` to
`proxy.ts`, and the named export with it; it sits beside `app`, so
`src/proxy.ts` here). Server Components cannot write
cookies, so the proxy refreshes expired auth tokens: it calls
`supabase.auth.getClaims`, passes the refreshed token to Server Components
via `request.cookies.set`, and back to the browser via
`response.cookies.set`. Use a matcher so it does not run on routes that
never touch Supabase.

**In server code, check auth with `getClaims()`, never `getSession()`.**
`getSession()` reads the cookie without verifying it against the auth
server — a check that passes without proving anything; `getClaims()`
verifies the token instead, which is why `src/app/(app)/layout.tsx:32`
uses it. That is exactly the silent-failure shape feature 7 exists to
prevent, so it belongs in the spec as a named prohibition, not just a
preference. **Corrected 2026-09-02:** an earlier version of this claim
said `getUser()`, but `getUser()` appears nowhere in `src/` — every auth
check calls `getClaims()` (`src/proxy.ts`, `src/app/(app)/layout.tsx`,
`src/app/go/route.ts`, `src/app/(marketing)/sign-in/page.tsx`,
`src/features/profile/queries.ts` and `src/features/profile/actions.ts`).

---

## Feature 10 — Usage gating & kill switch

_Written 2026-08-19 · corrected 2026-09-02 · re-corrected 2026-09-04 · source:
Adzuna terms of service at https://developer.adzuna.com/docs/terms_of_service,
heading "Default API access limits" (checked 2026-09-04) · numbers and claims
below verified 2026-09-04._

**Confirmed rate limits, from Adzuna's terms of service:**
25 hits/minute, 250/day, 1,000/week, 2,500/month.
(An earlier third-party figure of ~1,000/month was wrong; verified 2026-09-04 at
https://developer.adzuna.com/docs/terms_of_service under heading "Default API access limits".)

**Look in the docs, not the terms — corrected 2026-09-04: this 2026-09-02 correction was itself wrong.**
The 2026-09-02 pass recorded:
> An earlier version of this entry attributed these to Adzuna's terms of
> service. They are not there. Three public pages — `developer.adzuna.com/docs/search`,
> `/overview` and `/terms` — state no limits at all, so a wrong pointer costs
> real time on re-verification. The heading to look for is **"Default API access
> limits"**.

That negative result was false, and the original 2026-08-19 attribution to Adzuna's
terms of service was correct all along. The 2026-09-02 pass checked
`developer.adzuna.com/terms` (which states no limits), `/docs/search`, and `/overview`,
and concluded the terms attribution was false — but it never checked
`https://developer.adzuna.com/docs/terms_of_service`. The "Default API access limits"
heading was read as evidence the source was the docs rather than the terms, but the
page is both, which the URL path makes plain.
Verified 2026-09-04 directly at `https://developer.adzuna.com/docs/terms_of_service`:
the page title is "Terms of Service" and the heading "Default API access limits"
sits directly on that page. The 2026-09-02 error is preserved here because a
confidently recorded negative result based on checking the wrong URLs is exactly
the failure shape that wastes hours on re-verification.

**"Default" is load bearing.** These are per-key defaults, not a hard
platform ceiling. That makes raising them a lever that exists *before*
2,500 is treated as immovable — an option no decision so far has weighed.
**Terms verified 2026-09-04** at `https://developer.adzuna.com/docs/terms_of_service`:
higher limits are offered "upon request for commercial applications with mutual benefit"
("We are very happy to increase limits for applications where we see mutual commercial
benefit - our biggest API users do millions of hits per day!"). A non-commercial project
may not qualify for an increase, so the default 2,500/month should be treated as binding
unless commercial terms apply.

**The monthly window is the binding constraint.** Working down from
2,500/month: that is roughly 577/week or 82/day — well under both the
1,000/week and 250/day allowances. The weekly does bind over the daily
(250 × 7 = 1,750, above the 1,000 weekly cap), but the chain does not
extend to the month: 1,000/week runs about 4,333 over an average month,
which breaches 2,500 badly. Gate on the monthly, or on a rolling window
derived from it.

**Confirm what one search costs before designing the cap.** If a
user-facing search is more than one API call — pagination, a count
query, a follow-up fetch — the effective ceiling drops by that
multiple. Check this against the real API before writing the numbers
into a spec.

**Two budgets, not one.** The limits are against a single API key, so
per-account caps alone do not protect the aggregate — one heavy user or
twenty enthusiastic friends drain the same 1,000. Needs a per-account cap
*and* a global counter.

**The kill switch already exists; this feature is its first caller.** An
earlier version of this entry described it as future work. It shipped in
feature 3: a single-row table with no policies, read behind the secret key
client, flipped from the dashboard with no deploy and proved on preview,
with 22 tests in `src/lib/kill-switch.test.ts` plus an integration test.
`docs/observability/spans.md` already carries `kill_switch.read` with the
note that feature 10 puts this read inside every gated call. So the
mechanism is the manual backstop under both budgets, and what this feature
adds is the call site, not the switch.

**Suggested starting point:** 20–25 searches per user per week, and
configurable rather than hardcoded. Against the real budget (~577/week
derived from the monthly cap), ten users at 25/week is 250 — comfortable,
but half the headroom a weekly-cap reading would suggest. Recheck once
the calls-per-search question above is answered.

**A permanent constraint, not a v1 limitation — VERIFIED 2026-09-04 (previously INFERRED).**
Creating multiple accounts for a single entity or individual is explicitly prohibited.
Adzuna's terms of service (`https://developer.adzuna.com/docs/terms_of_service`, section
"Confidentiality", checked 2026-09-04) state: "Creation of multiple accounts for a single
entity or individual will immediately be considered misuse and a breach of these terms
and conditions." Provisioning per-user API keys or rotating accounts to expand the effective
budget is not an available option under the terms.

---

## Features 5 and 11 — Design system, and job search results

_Written: 2026-08-19 · source: Adzuna terms · audited
2026-09-02 · verified 2026-09-04 directly against
https://developer.adzuna.com/docs/terms_of_service._

**Audited 2026-09-02, updated 2026-09-04: LANDED.** The 116×23 rule with
both word and logo linked is in feature 11's Done when at `scope.md:213`.
The per-advert wording and the logo source both sit at
`brand-tokens.md:219–227`. The design-input half is in spec 0005 (AC-10
line 27, `Card.Footer` row line 86, rationale line 66, `verify.md` line
47). Feature 11 is now specified in spec 0013 (merged 2026-09-04), where
AC-6 and AC-7 implement both attribution requirements.

**Adzuna attribution is per displayed advert, not per screen (verified 2026-09-04).**

The terms state (`https://developer.adzuna.com/docs/terms_of_service`,
section "API user Obligations", clause 1, checked 2026-09-04): an API user shall
label *each displayed advert* with the phrase "Jobs by Adzuna" at least
116 × 23 pixels, with the word "Jobs" hyperlinked to http://www.adzuna.co.uk
(or relevant local domain) and the word "Adzuna" being the Adzuna logo image
(sourced from http://www.adzuna.co.uk/press.html), also hyperlinked.

This is a per-result-card requirement, and 116 × 23 px is not small at
card scale — it affects card layout, so it is a design-system input, not
a footer to add later. `brand-tokens.md` carries the corrected per-advert
wording under its results-page requirements.

**Salary-data requirement from the same section (verified 2026-09-04):**

The same terms section (clause 2, "Publishing Jobsworth salary estimates",
checked 2026-09-04 at `https://developer.adzuna.com/docs/terms_of_service`)
adds a separate requirement for salary estimates that this entry did not
originally record: an API user shall label every Jobsworth salary estimate
published with an icon at least 20 × 20 pixels in size and the words
"Adzuna Jobsworth", both linking to `http://www.adzuna.co.uk/jobs/salary-predictor.html`,
with mouseover text "Salary estimate powered by Adzuna Jobsworth".
Spec 0013 (feature 11) records this requirement in AC-7 and incorporates it
into the search results card design whenever `salary_is_predicted` is true.

Logo images: http://www.adzuna.co.uk/press.html

---

## Feature 14 — Fit scoring

_Written: 2026-08-19, extended through 2026-08-25 · sources
named per claim below · **TRUTH RE-AUDIT PENDING.**_

**Not yet audited for truth.** The 2026-09-02 audit asked only whether
entries landed in their spec, and feature 14 is still planned so nothing
could have landed. That is a different question from whether these claims
are still correct. **This entry makes claims about feature 3's state** —
the MCP disclosure below — and feature 3 has since shipped, which is
exactly the pattern that made the kill-switch line in feature 10 wrong.
Re-read those before this spec is written.

**Adzuna returns only a snippet of the job description, not full text.**

This lands on three features and needs a decision, not just a note:

- **Scoring (14)** matches skills against a partial description. A skill
  the posting requires but the snippet omits reads as a gap that is not
  real.
- **The remote heuristic (18)** is specified as running over title and
  description. A truncated description weakens it.
- **The cross vendor self check (17)** verifies that reasoning cites
  skills present in both the listing and the profile. It can only check
  against what was actually retrieved.

Options to weigh when the spec is written: fetch the full posting from
the source URL, label scoring as based on partial data, or accept the
limitation and state it in the UI. All three are honest; silently scoring
against a snippet as if it were the full posting is not.

**If the fetch option is taken:** `defuddle` (github.com/kepano/defuddle)
extracts clean markdown from a web page, stripping nav, ads, cookie
banners and footers. That is the concrete mechanism for turning a posting
URL into scoreable text rather than page furniture. It also ships as one
of the five skills in kepano/obsidian-skills. Verify its current state
against the repo when this spec is written rather than assuming the
description above still holds.

**Check the terms before assuming the fetch option is clean.** Adzuna
returns a redirect URL that routes through their own tracking rather than
a direct link to the employer's page, so "fetch the source URL" may mean
fetching Adzuna's redirect at volume — a different activity from the API
use they licensed, and a second rate-limit surface on top of theirs.
Confirm what the field actually points at, and what the terms say about
automated fetching of it, before designing around this option. Many
careers pages are also JS-rendered, the same open question already flagged
for lite company research.

**Job descriptions are untrusted input reaching a model.**

Verified in MadsLorentzen/ai-job-search (MIT): postings are treated as
untrusted input — the workflow follows no instructions embedded in them
and fetches no links from their body. Their own README notes the defense
is instruction-level, not a sandbox.

This is the same attack shape as the Supabase MCP disclosure recorded
under feature 3, without the MCP: attacker-controlled text reaching an
agent's context. The difference is that JobHunt is multi-user and the
text arrives automatically from a job board, not from a user pasting it.
A posting containing scoring instructions is the obvious case; a posting
that exfiltrates profile content into its own reasoning output is worse.

Belongs in the spec as a named risk with a stated mitigation, not as a
prompt-engineering preference.

**Stale postings leak from ATS feeds.**

Verified in santifer/career-ops (MIT): some companies leave closed roles
in their public API, so expired entries reach the pipeline. Their fix is
a `--verify` flag that runs Playwright after the API pass, sequentially
and only against new offers after dedup, so cost stays bounded.

The bounding pattern is the transferable part. Whether Adzuna has the
same staleness problem is unverified — check against real results at
feature 14 alongside the ten-result snippet test already planned.

**Legitimacy as a separate signal, never folded into the score.**

Verified in career-ops: Block G is a posting-legitimacy assessment that
never affects the score, and a Work-Auth signal flags an explicit
no-sponsorship JD as a hard blocker. Same shape as the sponsorship signal
already planned here.

Open question for the spec, not answered by either repo: what evidence
justifies flagging a real posting as suspect. A wrong flag costs a user
an application.

**Two-tier ranking — an idea, not an inherited one.**

A cheap ranking pass over all results, then deep scoring only on what the
user selects. This was suggested as coming from ai-job-search's `/rank`,
but `/rank` dispatches parallel agents that fetch each posting and score
five dimensions — a full fetch per job, not a cheap pass. The idea may
still be right for the snippet-versus-full-posting split above. It is not
proven by either repo and should not be written up as though it were.

---

## Feature 25 — Resume tailoring (v1.5)

_Written 2026-08-21 · source: `MadsLorentzen/ai-job-search` (MIT), read
directly · verified against that repo at the time · **TRUTH RE-AUDIT
PENDING** — the upstream repo may have changed._

**Verify the rendered PDF's text layer, not the source.**

Verified in ai-job-search: the compiled CV's text layer is extracted with
`pdftotext` and checked the way an ATS parser sees it — contact details
present as literal text, no garbled glyphs, sane reading order — then
keyword coverage is scored against that extraction rather than the
source. Their honesty rule: a keyword the profile does not support is
acknowledged as a gap, never stuffed in.

Same standard as this project's rule that every external dependency gets
a test that really calls it. Checking the source assumes the renderer
behaves; checking the output proves it.

---

## Feature 19 — Listing data quality

_Written: 2026-08-19 · source: Adzuna terms and docs ·
Jobsworth attribution requirement verified 2026-09-04 against
https://developer.adzuna.com/docs/terms_of_service._

**Adzuna salaries are often model-predicted, not stated by the employer.**

This is a labeling problem, not only an outlier problem. Showing a
prediction as a fact is the same failure shape as a score that looks
confident and is not — which is the thing this whole project is
organized against. A predicted salary needs to read as predicted.

Note also: publishing Jobsworth salary estimates carries its own
attribution requirement (a 20 × 20 px icon plus the words "Adzuna
Jobsworth", both linked to `http://www.adzuna.co.uk/jobs/salary-predictor.html`,
with mouseover text "Salary estimate powered by Adzuna Jobsworth").
**Verified 2026-09-04** at `https://developer.adzuna.com/docs/terms_of_service`
(section "API user Obligations", clause 2). Spec 0013 (feature 11) resolves
this: listings with `salary_is_predicted: true` display "(estimated)" and
render the required Jobsworth icon, link, and mouseover attribution (AC-7).

---

## Feature 5 — Design system

*(The feature 1 half is spent: spec 0001 records Tailwind v4 in the stack
table and the scaffold is built on it.)*

_Written: 2026-08-20 · audited 2026-09-02 · port
constraints verified as landed; one item below has no owner._

**Audited 2026-09-02: the port constraints LANDED and are spent.**
Non-inline `@theme` is spec 0005 AC-1 (index line 18); all four
accessibility media features are AC-12 (line 29), with the build-plan step
at line 148. Verified in code: `globals.css` uses `@theme`, deliberately
not `inline`.

**The sentence below about the landing page was true when written and is
false now.** The shipped page is `src/app/(marketing)/page.tsx` on the v4
token layer. The only remaining CDN script is in the throwaway prototype
`docs/design/jobhunt-landing_3.html` lines 12–15, which
`brand-tokens.md:208` already labels prototyping-only and must-not-ship.
Kept here as the record of a claim that rotted, not as current fact.

**Tailwind v4 removed the JavaScript config file.** Current is 4.3.x.
Customization lives in CSS via `@theme`. `brand-tokens.md` has been
annotated. ~~the landing page HTML is still v3-shaped and loads the CDN
script~~ — no longer true, see above.

Port constraints: raw channel values in `:root` mapped by a **non-inline**
`@theme` (`@theme inline` bakes values at build time and breaks runtime
theming); v4 supports `prefers-contrast`, `forced-colors`,
`prefers-reduced-motion` and `:focus-visible` directly in CSS, which is
where the WCAG 2.2 AA groundwork should land.

**Deprecation to avoid — THE ONE ITEM IN THIS FILE WITH NO OWNER
ANYWHERE:** `start-*` and `end-*` in favor of `inline-s-*` and
`inline-e-*`. Not in spec 0005, not in `brand-tokens.md`, not in the UI
`AGENTS.md`. Everything else in this section is spent; this is not.
**Give it a home in feature 5's context before this section is pruned**,
or it disappears with the rest.

---

## Unowned — TypeScript 7

_Written: 2026-08-20 · audited 2026-09-02 · **DELETE
CANDIDATE — fully spent.** Its input feature (1, Stack & architecture) is
done and the language-strictness decision is recorded at spec 0001 index
line 27. The entry itself declares TS7 an optional upgrade with no pending
decision, so nothing is owed. Nothing is lost by keeping it either._

*(The rest of this entry is spent. The `next dev` `AGENTS.md` block was
preserved byte for byte during `/audit`; Node 24 is pinned in `.nvmrc`
and `engines`.)*

**TypeScript 7** shipped recently and `next build` can use it for type
checking via `pnpm add -D typescript@^7`. This was an input to feature
1's language strictness decision, which settled the flags but not the
version — so the project is on TypeScript 5.x. That makes this an
optional upgrade rather than a pending decision. Worth revisiting only if
build times become a real problem; a major compiler bump mid build is not
free.

---

## Feature 3 — Supabase MCP server

_Written: 2026-08-20 · audited 2026-09-02 · **DELETE
CANDIDATE — landed in spec 0002, kept only so removal is a deliberate
act.**_

**Audited 2026-09-02: this LANDED and is not an orphan.** Spec 0002 AC-17
(index line 38) scopes the server to the development project with
`read_only=true` and per-call confirmation, no production ref anywhere;
line 181 records that this closes the environment half of binding rule 7;
build-plan step 18 (line 265) is the human connection step. `verify.md`
line 166 confirms nothing is connected, so `AGENTS.md` saying "no MCP
servers connected" is accurate — **the decision was made and the
connection deliberately not yet performed.** Those are different things.

**Side finding, not about this file:** spec 0001's follow-up at line 195
("Feature 3 owns the environment half…") is still unticked even though
spec 0002 discharged it. Same class as the spec 0003 rationale problem
above — a document disagreeing with what actually happened.

**This is the one with a named, demonstrated risk.** The feature 2 half
is spent: binding rule 7 in spec 0001 states all five conditions, and
`/audit` wrote them into root `AGENTS.md`. What remains is feature 3's
half — **which project the connection points at**, since feature 3 owns
the environment split and secrets. The fifth condition ("never pointed at
real user data") is now satisfiable: `jobhunt-dev` and `jobhunt-prod`
exist as separate hosted projects in `us-east-1`, both created with the
Data API "automatically expose new tables" setting off. What is left is
the deliberate choice of which `project_ref` the connection carries.

The 2026 server uses OAuth rather than a pasted personal access token:
`claude mcp add --transport http supabase https://mcp.supabase.com/mcp`,
with `project_ref` in the URL to scope it to a single project.

A mid-2025 disclosure showed an agent reading support tickets through
this server, following instructions planted in a ticket body, and —
running with `service_role` credentials that bypass row level security —
querying a sensitive tokens table and writing the result back where the
attacker could read it. A prompt injection through ordinary user-supplied
content, executed with credentials that ignore RLS.

**Why this matters here specifically:** JobHunt holds real resumes and
personal details from Slice 1 onward. The attack requires only that
attacker-controlled text reach the agent's context — a profile field, a
saved job description, an application answer. All three exist in v1.

Mitigations, from Supabase's own guidance:

- **Read-only mode.** Runs every query as a read-only Postgres user;
  disables migrations and deploys.
- **Scope to one project** via `project_ref`.
- **Keep per-call confirmation on.** Do not auto-approve database tools.
- **Prefer a development project with synthetic data** for agent-assisted
  work, rather than pointing the agent at production rows.

Decide before connecting the MCP server to a project that contains real
user data, not after. This is a decision to make deliberately, not one to
handle by remembering.

---

## Deliberately not researched

AI model pricing and availability. That is feature 13's explicitly
deferred decision, and anything gathered now would be stale by Slice 2.
