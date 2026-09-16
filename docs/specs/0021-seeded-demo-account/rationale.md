# 0021. Seeded demo account, rationale

## Context

> ⚠️ Premise note: the scope row for feature 31 describes something larger than what a demo
> actually needs: a fake profile, applications across every status, discard history, and a
> populated dashboard, and it names feature 23 (the applications dashboard, itself undecided) as
> a prerequisite. But the row's own accepted done when clause never asked for any of that: it
> only asks that a visitor reach it without signing up, that every seeded value be obviously
> fake, that a visitor cannot corrupt it for the next visitor, and that it make no external paid
> call. The entry page's own shipped copy (`src/features/entry-page/about-section.tsx`) already
> promises exactly the smaller thing, word for word: "a no sign in demo account", nothing about
> a dashboard. And spec 0001 binding rule 1 already reserves the secret key client's third caller
> for this feature, built to never hold a signed in session, which is the architecture for a
> small no sign in read rather than a full account. The row's descriptive paragraph overshot its
> own accepted bar. This spec builds to that bar, not to the paragraph, and the richer idea is
> recorded as a deferred possibility rather than dropped silently.

A freshly created real account shows a recruiter nothing: no profile filled in, no search run,
no score computed. Fixing that by letting a visitor run a real search would spend one Adzuna
call and up to twenty scoring calls per visit, real money for every person who follows a shared
link, which is not acceptable for a page whose whole purpose is to be shared freely. The results
have to be prepared in advance instead.

A prepared page still has to survive being genuinely public. Nothing on it can be a real
employer, since a link handed out for demonstration is not a channel to promise anything to
Adzuna or to a stated candidate. Nothing on it can be written to by a visitor, since the page has
no session to scope a write to, and a corrupted shared page would be broken for every visitor
after the first. And whatever it shows has to make the product's actual argument, that a job's
score is not a property of the job alone but of the job against a specific person, rather than
just asserting that in prose next to a single example.

## Options considered

### Option 1: A dedicated seeded table, read through the secret key client

The prepared results live in a new table with no relationship to the rest of the schema, seeded
directly in its migration, with row level security enabled and forced and zero policies. The
`/demo` route reads it through `createSecretClient()`, the same client already reserved as this
feature's caller in spec 0001 binding rule 1, because there is no session for row level security
to scope a normal read to.

**Pros**:
- Uses the caller slot spec 0001 already reserved for this exact feature, rather than leaving it
  permanently unused.
- The word "seeded" is literal: the data really is rows in the database, not a claim about a
  fixture file.
- A new table has no relationship to the real schema, so nothing here can be confused with a
  real listing or a real application by any query that is not this feature's own.

**Cons**:
- A new table and a new migration for content that never changes is more machinery than a plain
  fixture would need.
- Adds one more permanent caller to a highly privileged client, a fact spec 0001 has to keep
  recording indefinitely.

### Option 2: A static fixture module in code

The prepared results are a plain constant module, a list of objects with the same shape the real
`Listing` and score types use. No migration, no table, no secret key involvement at all.

**Pros**:
- The simplest possible build: no migration, no row level security to write, no new client
  caller.
- Trivially safe against corruption, since nothing about it is stored anywhere a write could
  reach.

**Cons**:
- Leaves spec 0001's reserved secret key caller for this feature unused, which either has to be
  removed from that allow list or left recorded for a mechanism the feature does not actually
  use.
- Stretches the feature's own name: nothing is "seeded" if it never touches the database.

### Option 3 (original): A real seeded Supabase Auth user with profile and application rows

A genuine `auth.users` row for a fixed demo identity, with real `profile`, `job_preference`, and
`application` rows attached, read either through an impersonated session or through the secret
key filtered to that one user id. This is closest to what "seeded demo account" literally says
and to the row's original, fuller description.

**Pros**:
- Reuses the real schema and the real rendering paths (`ResultCard`, `ScoreCard`, the
  applications feature) rather than building parallel ones.
- Would be the natural foundation for the fuller version this same spec defers, if that is ever
  built.

**Cons**:
- Drags in the whole profile and application schema, and by extension feature 23's dashboard, for
  a feature whose accepted done when clause never asked for any of it.
- Still needs the secret key regardless, since there is no real session to authenticate as a
  fixed user with no password anyone holds, so it buys none of option 1's simplicity while
  costing all of its complexity.
- The real `application` schema has no place to store a persisted score outside of an actual
  applied job (scoring is computed live per search render, per spec 0015), so faking "already
  scored" results this way means writing fabricated data into a table whose every other row means
  something real, which is its own honesty problem.

## Rationale

Option 1 is the right size for what this feature's own done when clause actually requires, and
it is the mechanism spec 0001 already committed to when it reserved this feature's caller slot,
so choosing it costs nothing new architecturally. Option 2 would work and would be simpler to
build, but it leaves that reservation meaningless and stretches what "seeded" means for no real
benefit, since the extra machinery option 1 needs (one small table, one migration) is not much
machinery. Option 3 (original) is what the row's original prose actually described, and it is
rejected here specifically because it pulls in schema and dependencies (feature 23's dashboard,
the real `application` table's meaning) that the done when clause never required and that this
spec is deliberately not building yet; `## Consequences` in `index.md` records that fuller version
as a deferred possibility rather than as something this decision closes off.

## Rework, 2026-09-14: real data replaces fabricated data

The fabricated design above (Option 1, still the right storage mechanism) is superseded in its
content, not its shape: a fabricated demo cannot be evidence the ranking works, since a reader can
reasonably assume the examples were picked to flatter it, and a "sample data" label does not fix
that. `docs/scope/scope.md`'s feature 31 entry, updated the same day, records the decision to keep
this the same feature and spec rather than opening a new one, and to supersede
`feat/seeded-demo-account` in place rather than merge its fabricated migration to `main`. Two new
decisions this rework required, beyond the reversed acceptance criteria `index.md` already
tracks with strikethrough:

### New decision: how the refresh authenticates to spend real budget

`checkUsageGate()` (spec 0011) calls `getClaims()` and refuses with `session_missing` when no
verified session exists; there is no anonymous or service role path through it. A script or an
externally triggered route has no interactive login, so reusing the real `searchListings()` and
`scoreListings()` unchanged (the whole point, since a parallel unggated implementation would be a
second, undertested vendor call path) requires deciding how the refresh gets a session at all.

**Option A: A dedicated demo refresh identity (chosen)**. A permanent `auth.users` row, holding no
`profile` or `application` row, created once via the admin API. The refresh mints it a session
per run with `admin.generateLink()` plus `verifyOtp()`, the technique `test/helpers/session.ts`
already established for tests, reimplemented under `src/` since that file itself cannot be
imported. **Pros**: reuses `searchListings()`/`scoreListings()`/`checkUsageGate()` completely
unchanged; the identity's own weekly account scope budget is separate from any real user's by
construction, without inventing a new call type. **Cons**: introduces a production session minting
path where the only prior one (`test/helpers/admin.ts`'s `devOnlyAdminClient()`) is hard blocked
outside development; the identity, however narrow, is a new kind of thing in this codebase to
reason about.

**Option B: Trigger under the engineer's own session**. A protected route the engineer visits
while signed in as themselves. **Pros**: no new identity, no new minting code. **Cons**: spends the
engineer's own personal weekly caps, and only works at the moment they happen to be signed in,
which sits badly with "manually triggered whenever convenient" and worse with a future cron.

**Option C: Bypass the usage gate entirely**. Call the underlying Adzuna fetch and model call
directly, no cap check. **Pros**: simplest to build, no auth question at all. **Cons**: removes the
one safety net against a mistakenly repeated or looped trigger, and the calls would never appear
in feature 20's spend dashboard, which is the same objection that keeps every other real vendor
call in this app gated.

Option A was chosen: it is the only one that reuses every existing gated code path unchanged
while keeping the refresh's budget structurally separate from real users', at the cost of a
narrow, well bounded new production capability rather than a workaround.

### New decision: how the refresh is triggered, and whether a route handler may write

`docs/scope/scope.md`'s feature 31 entry names both a script and a protected route as v1
candidates. A cross model check on 2026-09-14 asked whether a local script should be preferred
instead, since it would leave spec 0001's already development-only test mint (caller 1) exactly as
blocked as it is today and would avoid the route's own mechanics risk (secret comparison, request
duration, concurrency) entirely.

**Option A: A protected route handler (chosen)**. `POST /api/demo/refresh`, authorized by a shared
secret. **Pros**: callable today and by a future cron with no code change; the production secret
key stays on the server, never on a personal machine. **Cons**: it is the first route handler
under `src/app/api/` to write anything, and introduces a production session minting path (see the
decision above) that a local script would not need.

**Option B: A local script**, run by the engineer from their own machine against production
credentials. **Pros**: no route to secure, no new environment variable. **Cons, checked against
this repository rather than assumed**: it is not a continuation of an existing practice.
`pnpm eval` runs against `test/eval`'s fixture-minting harness and `pnpm db:reset` runs against the
local Supabase stack; `test/helpers/database.ts` refuses any host other than `127.0.0.1` or
`localhost` outright. A local refresh script would be the first routine handling of
`SUPABASE_SECRET_KEY`, the BYPASSRLS credential over every user's table, on a personal machine, for
a task run every week. It also does not touch spec 0001 caller 1 either way: caller 1 is the
unrelated development-only test session mint, and the refresh's own mint is caller 3 (this
feature) whichever mechanism triggers it, so "keeps caller 1 blocked" is not a real point of
difference between the two options.

Option A was chosen. The real trade is a deployed, narrowly scoped session-minting endpoint
against `SUPABASE_SECRET_KEY` itself living on a laptop for a routine chore: a compromised refresh
endpoint's worst case is spending this feature's own capped, dedicated budget, while a compromised
laptop holding the secret key's worst case is every user's data. `index.md`'s Security model
records this as a deliberately accepted risk rather than an unremarked one.

A related, smaller decision: whether a Route Handler under `src/app/api/` may write
`demo_result`/`demo_refresh` at all, given root `AGENTS.md`'s "Server Components read, Server
Actions write" and its separate restriction on route handlers touching user data. `index.md`'s
Feature design records this as a scope clarification rather than an exception: both rules, read
by what they actually say, were never written with a sessionless, non personal data, externally
triggered operational endpoint in mind. This is the first route handler under `src/app/api/`, and
the first that writes anything, which is why the reasoning is recorded in the route file itself
too, not only here.

### New decision: which and how many listings the refresh keeps

**Option A: A fixed count in Adzuna's own returned order (chosen)**, 8 listings, both personas
scored against the same 8. *(Superseded in its detail 2026-09-15: the count is now up to 4 from
each of two searches, kept by the walk in `index.md`, still 8 at most and still never selected by
score. See "Revision, 2026-09-15" below.)* **Pros**: mechanical, never selected by how a score looks, which is
what keeps "whatever a refresh returns gets published" true rather than aspirational. **Cons**: a
run whose first 8 results happen to cluster on one band shows a less compelling spread than a
curated set would.

**Option B: All returned listings (20, `RESULTS_PER_PAGE`)**. **Pros**: the most complete picture.
**Cons**: a long page for a demo, and 40 scoring calls per refresh instead of 16, for a benefit
this page does not need.

**Option C: One per band, best effort**, keeping whichever returned listings land closest to each
of the five bands. **Pros**: closest to the fabricated version's curated feel. **Cons**: this is
itself a form of selecting by score outcome, the exact thing this rework exists to stop doing;
rejected for the same reason a dedicated "largest band divergence" comparison listing was rejected
in favor of the per card cross persona line (AC-16).

## Revision, 2026-09-15: two opposed searches replace one broad search

### What the first real refresh showed

The first real refresh ran on the local stack (`demo_refresh.refreshed_at` 2026-09-15 00:08 UTC)
and wrote 16 rows, 8 listings under each persona. Read directly from `public.demo_result` on
2026-09-15:

- **15 of the 16 rows carry zero matched skills.** The one exception is the frontend persona on
  Mastercard's "Manager, Software Engineering", with one. A card with no matched skills cannot show
  the skill matching this page exists to demonstrate.
- **Three of the eight listings are roles neither persona fits**: "Embedded Software Engineer",
  "Robotics Software Engineer (Industrial Automation)" and "FPGA Embedded Software Engineer".
  `"software engineer"` was broader than the two personas it serves.
- **Every stored `description_snippet` is exactly 500 characters.** The three read in full
  (Mastercard, Everpure, Amazon Leo) are each the company's own introduction, cut off before any
  requirement. The scorer said as much on Everpure's row: "the visible excerpt provides no
  concrete technical requirements". Spec 0013's Consequences already records that Adzuna returns
  only a snippet.

**What that evidence does and does not settle.** It settles that the old query returned roles
outside both personas. It does not settle that the query caused the missing skills: three of
eight snippets were read, and all three would carry no stack terms under any query. The likelier
cause is **inferred** to be the snippet. That is why the revision below carries a stopping rule
rather than a promise that it fixes the cards.

### Options for the queries

**Option A: Two opposed searches, `"backend engineer"` and `"frontend engineer"`, four kept from
each (chosen)**. Each matches one persona's own first desired title. **Pros**: each persona gets
its own likely strong matches and its own likely mismatches, so AC-16's cross persona line can
show differences in both directions; roles neither persona fits become less likely; the model
call count is unchanged at up to 16 scoring calls. **Cons**: one extra Adzuna search per refresh
(trivial, 2 against a global day cap of 66); a cross search duplicate needs a tie rule (the
backend search, taking the first turn, keeps it); the snippet problem is not addressed.

**Option B: One search for `"full stack engineer"`**, recommended in the design conversation as
naming neither persona's stack. **Pros**: one search, no walk, no tie rule. **Cons** (inferred, not
measured): a full stack posting tends to part match both personas, which pulls both columns toward
the middle bands and leaves AC-16's line showing less difference than two opposed searches would.
It also gives neither persona a guaranteed set of its own strong matches.

**Option C: Keep `"software engineer"`**. **Pros**: no change after seeing a run, so the strictest
reading of the no cherry picking rule. **Cons**: the cards keep showing no skill matching, and
three in eight listings stay outside both personas.

**Option D: A query naming stack technologies** (for example "react golang"). **Pros**: Adzuna
matches the keywords against the full posting, so returned postings do mention those skills
somewhere. **Cons**: Adzuna combines the keywords, which narrows results sharply, and the query
leans toward whichever persona's stack it names, which is the bias this rework exists to remove.

The engineer chose Option A: a single role query leans toward whichever persona it names, making
the other persona's column mostly weak or not a match and its reasoning lopsided, and two opposed
queries remove that lean rather than averaging it.

### Why this is not the cherry picking the spec forbids

`index.md` and `refresh.ts` both state the query is never adjusted after seeing what came back.
This revision does adjust it after one run, so the difference is recorded rather than glossed:

- **The trigger is about the cards' information, not their outcome.** The query changed because
  neither persona's cards showed any matched skills and three listings fit neither persona, not
  because any band came back unflattering. Nothing about which bands appeared entered the choice.
- **The new queries are chosen by a rule fixed before they run**: each persona's own first desired
  title, taken from `personas.ts` as it already stood.
- **It is bounded.** The stopping rule in `index.md`'s `## Follow-up` says that if 5 or more of the
  next refresh's own role rows (up to 8) still carry zero matched skills, the snippet is the cause
  and the queries do not change again. A third query tuned to the results would be exactly the
  selection this rework removed.

### Two details the cross check left open, decided by the engineer

- **Each `demo_result` row stores the `search_title` whose walk turn kept it.** Without it, nothing
  stored says which search a listing came from, so a verify step claiming the listings alternate
  could not fail, and the stopping rule could not be read per query. The runner up, per search
  counts on the span with no column, was rejected because it leaves the stored result set unable
  to explain itself. A posting both searches returned is kept once, under whichever search's turn
  reaches it first.
- **The stopping rule counts own role rows, not all 16.** The first proposal, "9 or more of 16
  rows empty", was rejected by the engineer: each persona is also scored against the other role's
  postings, where zero matched skills is often correct, so up to 8 rows can be empty by design and
  that threshold would fire on almost any run, freezing the queries for the wrong reason. The rule
  reads only rows where the persona's own query kept the listing, and fires at 5 or more of up to
  8. Both counts, own role and cross role, are recorded on every completed run so the right one is
  always the one read.

### Two build decisions, ratified

Both were made by `/develop` while building the refresh and are recorded in `index.md`, **Feature
design**, "Refresh outcomes". Neither had an owning line in this spec before 2026-09-15.

- **A gate refusal returns `success({ completed: false })`, reported at info level.** The
  alternative, a `Failure` at `expected` severity, looks equivalent but is not: `failure()` fails
  the active span whatever the severity, so a correct refusal would enter `demo.refresh`'s failure
  ratio, which spec 0001 binding rule 3 forbids.
- **A refresh that keeps zero listings aborts.** The alternative, publishing the empty set as the
  "publish whatever comes back" rule literally reads, would delete real results and stamp a fresh
  `refreshed_at` over nothing, a page state neither AC-12's nor AC-15's copy describes. Any total
  from one upward still publishes as is, so the rule is narrowed at exactly one point.

## References

**Project sources** (verifiable, in this repo):
- Root `AGENTS.md`'s rules on route handlers under `src/app/api/` and on "Server Components read,
  Server Actions write", read closely in the route write scope clarification above.
- Spec 0001 binding rule 1, the closed secret key caller allow list, naming "the seeded demo
  account (feature 31)" as caller 3, which the refresh's admin mint reuses rather than extends.
- Spec 0011's `checkUsageGate()`, whose `getClaims()` requirement is what makes the refresh
  authentication decision load bearing, and whose optional `cookieAdapter` parameter is the seam
  the refresh uses to supply a session with no HTTP request behind it.
- Spec 0013's `AdzunaAttribution`/`JobsworthAttribution` components and its `CURRENCY_BY_COUNTRY`
  derived salary currency, both reused unchanged rather than rebuilt.
- Spec 0015's `notMentionedSkills` invariant and `ScoringProfile` shape (`src/features/scoring/
  rubric.ts`), which the two persona constants are written to satisfy exactly.
- `docs/scope/scope.md`, feature 31, updated 2026-09-14 with the three structural decisions (stays
  the same feature, supersedes the branch in place, AC-13 stays held) this spec builds under.

**Practices & standards**:
- Store raw, format at render (this project's own rule, applied to `salary_currency`).
- The atomic multi statement write via one ~~`security definer`~~ `security invoker` function
  (corrected 2026-09-15; `index.md` and the migration both chose `security invoker` on 2026-09-14,
  and this line was never updated), the same "several statements, one guarantee" shape
  `check_usage_gate()` already establishes in this codebase.

**Links** (web verified 2026-09-14, by `/scope` ahead of this spec, reused here rather than
re-fetched):
- Adzuna Terms of Service: https://developer.adzuna.com/docs/terms_of_service — confirmed:
  "Publishing Adzuna ad listings" is a named permissible use with no authenticated visitor
  restriction; each displayed advert requires the "Jobs by Adzuna" attribution (minimum 116 by 23
  pixels, both "Jobs" and the logo hyperlinked) and, where a Jobsworth estimate is shown, its icon,
  label, and mouseover text; rate limits are 25 per minute, 250 per day, 1000 per week, 2500 per
  month, against which one weekly refresh is negligible; on termination all data must be removed
  from the site, implying storage and display are contemplated; storage duration itself is not
  addressed, a gap rather than a permission, which is why a refresh replaces the table rather than
  accumulating rows. These terms may change at any time (`## Follow-up`), the same reason spec
  0013 carries a standing re-verification item.
