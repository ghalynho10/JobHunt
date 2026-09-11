# JobHunt

A job search app I built that ranks real listings against your profile and
shows the reasoning behind each ranking.

**Live:** [usejobhunt.dev](https://usejobhunt.dev) · **State:** the v1 core loop
runs end to end on the deployed site, and three planned v1 features are not
built yet ([details](#current-state))

<!-- SCREENSHOTS: replace both filenames with the files added under docs/images/ -->

![Scored search results on usejobhunt.dev](docs/images/REPLACE-results-list.png)

![One scored result card](docs/images/REPLACE-result-card.png)

## Why I built it

A fit score is only useful if you can check it. A bare number gives a job
seeker no way to tell a careful judgment from a guess, so each scored result
shows its work: which of your skills the posting mentions, which it doesn't,
and a short explanation of the band. I also decided against hiding results
below a score threshold. A slightly miscalibrated scorer would then silently
drop jobs worth seeing, so JobHunt shows every result and leaves the decision
to you.

JobHunt replaces JobPilot, an earlier project of mine, on my resume and
portfolio. Two audits of JobPilot's code, not just its documentation, found
two defects that shaped this one. A usage-limiting database function returned
a list that the calling code read as a single row, so every metered action was
silently denied for every account for two weeks. Every test mocked the same
wrong assumption the code made, and the suite stayed green throughout. Its fit
scoring also passed every test while returning a nearly constant score, mostly
70 to 75, because no test checked the quality of the output, only its shape.

I built it for my own job search, for a few friends, and for anyone evaluating
it as a portfolio piece. It is free: spend caps stand in for billing.

## How it works

1. **Sign in and fill in a profile.** You sign in with Google or GitHub. There
   is no password. The profile has four sections, each saved on its own:
   Personal details, Skills, Experience, and Search preferences. You type it
   in; there is no resume upload.
2. **Search real listings.** Search by job title, location, or both. Listings
   come from Adzuna. Opening the search page with no search in the address
   fills the form from your saved preferences. Each account can run 25 searches
   a week.
3. **Read the ranked cards.** Each card shows the posting's own details first
   and the fit judgment below them. While the score is on its way, the card
   reads "Checking fit against your profile…". When every card has resolved,
   the list reorders once by fit, instead of shuffling as each score lands. A
   scored card shows:
   - one of five bands: Strong match, Good match, Possible match, Weak match,
     or Not a match
   - **Matched in this posting**: skills from your profile that appear in the
     posting's text
   - **Not mentioned in this posting**: skills from your profile that a role
     like this would typically value but that the posting's text doesn't
     mention. It never says "missing". The app sees only a 500-character
     excerpt, so the card adds: "This posting only shows part of the
     description, so this is not a confirmed gap."
   - a short written explanation of the band, addressed to you
   - a visa sponsorship badge, when the posting states a position either way
4. **See what a second check found.** A second model, from a different vendor,
   checks each matched skill against the same excerpt. A skill it cannot find
   is removed from the card, and the card says so: "Removed from matched
   skills, a second check could not find these in the excerpt shown: …". The
   explanation is left exactly as written, with a line above it saying part of
   it could not be checked. If the check itself could not run, the card keeps
   its skills and says "Could not verify skill matches for this listing." A card
   whose score failed says "Could not score this listing right now." instead of
   showing a low score.
5. **Apply, and record it.** "View the posting" opens the real posting on the
   source site. JobHunt does not fill in or submit anything for you. Opening a
   posting records nothing, and I made "Mark as applied" a separate button,
   because looking at a job is not applying to it. That button records the
   application and changes to "Applied" without reloading the results, so it
   doesn't use up one of your weekly searches. Recorded applications are listed
   at `/applications`, each with a link back to the posting and a way to
   remove it.

## Four things worth a closer look

**Spend caps enforced inside Postgres.** Every outside call (the Adzuna search
and both model vendors) first goes through one Postgres function. It checks the
caller's weekly cap and the app's daily and monthly caps in a single
transaction, and takes its counter row locks in a fixed order. Each counter row
keeps two numbers: `attempt_count` counts every call that reached the gate, and
`consumed_count` counts only the calls it allowed. I kept them apart so a
refused call still leaves a trace, and a window that is being refused never
looks like a quiet one. The integration suite checks this under real
concurrency on every run. Thirty calls against an account cap of 25 let
exactly 25 through, and 15 accounts against a global cap of 5 let exactly 5
through, leaving the counter at 15 attempts and 5 consumed.
[Spec 0011](docs/specs/0011-usage-gating-and-kill-switch/index.md)

**One file knows the vendors.** Code that needs a model asks for a tier,
`ai_scoring` or `ai_check`, and never names a vendor, a model or a generation
setting. Those live only in [`src/lib/ai/tiers.ts`](src/lib/ai/tiers.ts), and
[`callTier()`](src/lib/ai/client.ts) is the only way to reach them. It checks
the usage gate before any vendor sees the request. A unit test walks every
non-test file under `src/` and fails if any file other than those two imports
`ai` or an `@ai-sdk/*` package, in any of four import forms. I fixed retries at
zero, so one gated call is one billed vendor call.
[Spec 0012](docs/specs/0012-model-client-router/index.md)

**A second vendor checks the first.** The scorer (OpenAI) claims which of your
skills a posting mentions. Google Gemini then checks each claimed skill against
the same excerpt the scorer saw, built by the same function and judged by the
same written rule, which both prompts read from one shared constant. I put the
check on a different vendor because a model checking its own work shares its
blind spots. A skill the check cannot find in the text is removed from the
card, and a note names it. I tested it against the real Google API by adding
COBOL to the scorer's list for a posting that never mentions it. Gemini flagged
COBOL and left the two genuine skills alone.
[Spec 0019](docs/specs/0019-cross-vendor-self-check/index.md)

**An eval set that found a mistake in itself.** `pnpm eval` runs sixteen
fictional candidate and posting pairs through the real scorer, five times each.
A pair passes only if at least 3 of its 5 runs succeed and most of those land
in the expected band. One pair failed both of the first two full runs, 4 to 1
and then 5 to 0. When I reviewed it against the rubric's unchanged text, the
ground-truth entry turned out to be the thing I had got wrong, not the model. I
changed only that pair's expected band; the rubric and the other fifteen pairs
stayed as they were.
[Specs 0016](docs/specs/0016-eval-ground-truth-set/index.md),
[0017](docs/specs/0017-eval-harness-runner/index.md),
[0018](docs/specs/0018-band-anchor-review/index.md)

## Current state

As of 2026-09-10.

- **Built:** 20 of the 33 features in [the scope](docs/scope/scope.md). That
  covers the foundation, slice 1 (profile, search, usage gating, apply and
  record) and slice 2 (the model router, fit scoring, the eval set and harness,
  and the cross-vendor check). All 19 specs are accepted.
- **Not built:** feature 18 (structured search filters), feature 19 (listing
  data quality) and feature 20 (guided application capture). Together they make
  up v1's own slices 3 and 4, and I haven't designed any of them yet. For now,
  search takes a title and a location only.
- **Where it has run:** on 2026-09-10 I ran the full loop on the deployed site.
  With a real profile I searched real listings on usejobhunt.dev, saw them
  ranked with the reasoning shown, and used it to apply to two real jobs, one
  scored good_match and one strong_match. Before that I had only driven it end
  to end on a local production build. I haven't yet seen a card showing a skill
  flagged by the cross-vendor check outside tests. The check itself is proven
  by tests and by a probe against the real Google API.
- **Checks:** 1,221 unit tests and 132 integration tests pass. Another 8 are
  skipped on purpose, because they spend real vendor money. Lint, typecheck and
  format are clean. `main` is protected by three required checks: lint,
  typecheck and build; the migration apply; and the full test job. The rule
  applies to admins too.

## Deliberate limitations

- **Scoring reads a 500-character excerpt, not the full posting.** That excerpt
  is all Adzuna's search API returns. Fetching full postings would need a
  headless browser, plus a compliance call that Adzuna's terms don't settle.
  So in [spec 0015](docs/specs/0015-fit-scoring-with-shown-reasoning/index.md)
  I chose to score the excerpt and label the result to match. The second skill
  list reads "not mentioned in this posting", never "missing".
- **The written explanation is not cross-checked.** Gemini receives only the
  claimed skill names, and the explanation renders exactly as the scorer wrote
  it. If the scorer invented something only in that text, nothing would catch
  it. I left that gap open by design and named it in spec 0019.
- **The eval measures consistency with the rubric, not accuracy.** The pairs
  came from reading the rubric. Passing them shows the model reads the rubric
  the way a careful person would, not that the rubric judges fit well. Showing
  that would take a blind second opinion, and I have no source for one. The
  corrected pair now passes 3 to 2, the smallest margin the harness accepts,
  and I haven't taken a full sixteen-pair run since the correction.
- **No spend, token or product telemetry.** The gate counts calls, not tokens
  or dollars, and I read vendor spend by hand from two dashboards. Spend
  visibility and product analytics are features 28 and 29, both planned for
  v1.5. Only 2 of the 23 named Sentry spans have an alert. The scoring pipeline
  and every product write have none yet, a sequencing call I recorded in
  [spans.md](docs/observability/spans.md).
- **No end-to-end browser test runner.** Playwright is my recorded choice. It
  goes in with the first feature that needs it, not as an empty config. Until
  then, browser behaviour is checked in a real browser and written down in each
  spec's `verify.md`, which makes it careful but not repeatable. Examples are
  the single reorder of results and an apply that must not spend a search call.
- **Application tracking is thin.** An application is one recorded row and a
  list at `/applications`. Statuses and the guided capture questions come later,
  in features 23 and 20.

## How I ran the build

I set the direction and the quality bar. Agents did much of the
implementation. Before any code existed I wrote down how the work would be
governed: every load-bearing decision laid out with its alternatives and
approved by me before it was built, and code reviewed on a different model
from the one that wrote it. I also keep a file of standing rules: each
mistake worth remembering becomes a one-line rule, so the same correction
does not have to be given twice. All of it is in the repo:

- **[docs/specs/](docs/specs/)** holds nineteen specs, one per load-bearing
  decision. I approve each one before code is built from it. Each has three
  files:
  - `index.md`: the decision and its acceptance criteria.
  - `rationale.md`: the options I weighed.
  - `verify.md`: what was actually proved, and how. A step that was skipped is
    marked descoped, never passed.

  Start with [0001](docs/specs/0001-stack-and-architecture/index.md). Every
  later spec inherits its binding rules.
- **[docs/reviews/](docs/reviews/)** holds code reviews for 15 of the 20
  finished features, some over several rounds. The five without one are the
  scaffold, tooling, deployment, terms and privacy, and the band anchor
  review. Each review runs on a different model from the one that wrote the
  code, by design, and names its reviewing model at the top. The folder also
  holds the [v1 readiness audit](docs/reviews/2026-09-10-audit-v1-readiness.md)
  I had run before calling this v1. The claims in this README trace back to it.
- **[docs/reflexes.md](docs/reflexes.md)** holds 35 standing rules, one line
  each. Most were written right after a specific mistake in this project, mine
  or an agent's, and carry its date and what happened. Two examples:
  - A shell check ending in `|| echo "none"` prints the same reassuring word for
    a mistyped path as for a clean result.
  - A formatter running inside a commit hook can silently undo a test's proof
    after that proof was confirmed.

  Every agent session in this repo loads the file before changing anything.
- **[docs/scope/scope.md](docs/scope/scope.md)** is the living plan: all 33
  features, each with a status and a "Done when" clause, plus a deferred list
  that gives the reason for each deferral.
- **[docs/overview.md](docs/overview.md)** is the long-form reference: what the
  product is, why it exists, and each decision in plain prose.

## Stack

- TypeScript in strict mode, on Node 24
- Next.js 16.3 App Router and React 19.2, server-first: the codebase has no
  browser Supabase client at all
- Supabase: Postgres, plus Auth with Google and GitHub OAuth and no password
  path. Accessed through `@supabase/ssr`, with no ORM. Schema and policies are
  hand-written SQL migrations.
- Nine tables, with row level security forced on all nine and 23 per-row
  policies over the six that hold user data.
  [`isolation.test.ts`](test/integration/isolation.test.ts) proves it with two
  freshly minted accounts. One writes a profile row, and the other, querying
  with no filter at all, gets nothing back.
  ([spec 0007](docs/specs/0007-auth-and-per-user-isolation/index.md))
- Vercel AI SDK 7 with the direct `@ai-sdk/openai` and `@ai-sdk/google`
  providers, and the Adzuna API for listings
- Zod 4 at every boundary, Tailwind CSS v4, Sentry
- Vitest, split into four projects: unit, integration (against the real local
  database), serial integration, and the paid eval
- Vercel hosting across three environments: local, a hosted development
  database that every preview reads, and a separate production database.
  GitHub Actions applies migrations.
  ([spec 0002](docs/specs/0002-deployment-and-environments/index.md))

## Running it locally

You need Node 24 (the version in `.nvmrc`), pnpm through corepack, and Docker
running for the local Supabase stack.

```bash
corepack enable pnpm
pnpm install

cp .env.example .env.local        # then fill it in, see below
cp .env.test.example .env.test    # what the test suites read
pnpm db:start                     # local Supabase in Docker, prints the URL and keys
pnpm db:reset                     # applies migrations, seeds three fixture users
pnpm dev
```

`src/env.ts` validates every variable at build and at boot, so a missing one
fails straight away rather than partway through a request. `.env.local` needs
the Supabase URL, publishable key and secret key that `pnpm db:start` prints. It
also needs an Adzuna app id and key, an OpenAI key and a Google AI Studio key.
All of them are required.

Signing in locally uses real OAuth, because the product has no password path.
The Supabase CLI reads the four provider variables from `supabase/.env`, not
from `.env.local`, and `.env.example` lists them. Placeholders are enough to
start the stack and run the tests. To sign in from a browser, you need real
Google or GitHub client credentials.

```bash
pnpm test               # unit suite, needs nothing running
pnpm test:integration   # against the local stack, needs pnpm db:start
pnpm lint && pnpm typecheck && pnpm format:check
pnpm eval               # PAID: 80 real vendor calls, never part of pnpm test
```

Before changing code, read [AGENTS.md](AGENTS.md) and
[spec 0001](docs/specs/0001-stack-and-architecture/index.md). Some examples of
its binding rules: one file may build the database secret key client, every
failure is a value rather than a throw, and authorisation is never decided in
the proxy. None of them is open to reinterpretation feature by feature.
