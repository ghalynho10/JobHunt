# JobHunt

JobHunt is a job search app. You sign in with Google or GitHub, fill in a
profile, and search real listings. Each result is placed in one of five fit
bands, with the skills the posting mentions that match yours, the skills it did
not mention, and a short explanation written to you. You click through to the
real posting to apply, and the app records that you did. It is free: spend caps
stand in for billing.

**Live:** [usejobhunt.dev](https://usejobhunt.dev) · **State:** the v1 core loop
runs end to end on the deployed site, and three planned v1 features are not
([details](#current-state))

## Four things worth a closer look

**Spend caps enforced inside Postgres.** Every outside call (the Adzuna search
and both model vendors) first goes through one Postgres function. It checks the
caller's weekly cap and the app's daily and monthly caps in a single
transaction, and takes its counter row locks in a fixed order. Each counter
keeps `attempt_count`, which counts every call that reached the gate, apart
from `consumed_count`, which counts only the calls it allowed. That way a
refused call leaves a trace, and a window that is being refused never looks
like a quiet one. The integration suite checks this under real concurrency on
every run. 30 calls against an account cap of 25 let exactly 25 through, and 15
accounts against a global cap of 5 let exactly 5 through, leaving the counter
at 15 attempts and 5 consumed.
[Spec 0011](docs/specs/0011-usage-gating-and-kill-switch/index.md)

**One file knows the vendors.** Code that needs a model asks for a tier,
`ai_scoring` or `ai_check`, and never names a vendor, a model or a generation
setting. Those live only in [`src/lib/ai/tiers.ts`](src/lib/ai/tiers.ts), and
[`callTier()`](src/lib/ai/client.ts) is the only way to reach them. It checks
the usage gate before any vendor sees the request. A unit test walks every
non-test file under `src/` and fails if any file other than those two imports
`ai` or an `@ai-sdk/*` package, in any of four import forms. Retries are fixed
at zero, so one gated call is one billed vendor call.
[Spec 0012](docs/specs/0012-model-client-router/index.md)

**A second vendor checks the first.** The scorer (OpenAI) claims which of your
skills a posting mentions. Google Gemini then checks each claimed skill against
the same excerpt the scorer saw, built by the same function and judged by the
same written rule, which both prompts read from one shared constant. A skill
the check cannot find in the text is removed from the card, and a note names
it. In a deliberate test against the real Google API, the scorer's list was
padded with COBOL for a posting that never mentions it. Gemini flagged COBOL
and left the two genuine skills alone.
[Spec 0019](docs/specs/0019-cross-vendor-self-check/index.md)

**An eval set that found a mistake in itself.** `pnpm eval` runs sixteen
fictional candidate and posting pairs through the real scorer, five times each.
A pair passes only if at least 3 of its 5 runs succeed and most of those land
in the expected band. One pair failed both of the first two full runs, 4 to 1
and then 5 to 0. A review against the rubric's unchanged text found the
committed expectation was wrong, not the model. Only that pair's expected band
changed. The rubric and the other fifteen pairs were left as they were.
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
  up v1's own slices 3 and 4, and none of them has been designed yet. For now,
  search takes a title and a location only.
- **Where it has run:** on 2026-09-10 the full loop ran on the deployed site. A
  real profile searched real listings on usejobhunt.dev, saw them ranked with
  the reasoning shown, and recorded two real applications, one scored
  good_match and one strong_match. Before that it had only been driven end to
  end on a local production build. A card showing a skill flagged by the
  cross-vendor check has not yet been seen outside tests. The check itself is
  proven by tests and by a probe against the real Google API.
- **Checks:** 1,221 unit tests and 132 integration tests pass. Another 8 are
  skipped on purpose, because they spend real vendor money. Lint, typecheck and
  format are clean. `main` is protected by three required checks: lint,
  typecheck and build; the migration apply; and the full test job. The rule
  applies to admins too.

## Deliberate limitations

- **Scoring reads a 500-character excerpt, not the full posting.** That excerpt
  is all Adzuna's search API returns. Fetching full postings would need a
  headless browser, plus a compliance call that Adzuna's terms don't settle.
  So [spec 0015](docs/specs/0015-fit-scoring-with-shown-reasoning/index.md)
  scores the excerpt and labels the result to match. The second skill list
  reads "not mentioned in this posting", never "missing".
- **The written explanation is not cross-checked.** Gemini receives only the
  claimed skill names, and the explanation renders exactly as the scorer wrote
  it. If the scorer invented something only in that text, nothing would catch
  it. Spec 0019 names this as an accepted gap.
- **The eval measures consistency with the rubric, not accuracy.** The pairs
  were written by reading the rubric. Passing them shows the model reads the
  rubric the way a careful person would, not that the rubric judges fit well.
  Showing that would take a blind second opinion, and the project has no
  source for one. The corrected pair now passes 3 to 2, the smallest margin
  the harness accepts, and no full sixteen-pair run has been taken since the
  correction.
- **No spend, token or product telemetry.** The gate counts calls, not tokens
  or dollars, and vendor spend is read by hand from two dashboards. Spend
  visibility and product analytics are features 28 and 29, both planned for
  v1.5. Only 2 of the 23 named Sentry spans have an alert. The scoring pipeline
  and every product write have none yet, a sequencing call recorded in
  [spans.md](docs/observability/spans.md).
- **No end-to-end browser test runner.** Playwright is the recorded choice. It
  will be installed with the first feature that needs it, not as an empty
  config. Until then, browser behaviour was checked by hand and written down in
  each spec's `verify.md`, which makes it careful but not repeatable. Examples
  are the single reorder of results and an apply that must not spend a search
  call.
- **Application tracking is thin.** An application is one recorded row and a
  list at `/applications`. Statuses and the guided capture questions come later,
  in features 23 and 20.

## How to read the rest of the repo

- **[docs/specs/](docs/specs/)** holds nineteen specs, one per load-bearing
  decision. Each has three files:
  - `index.md`: the decision and its acceptance criteria.
  - `rationale.md`: the options that were weighed.
  - `verify.md`: what was actually proved, and how. A step that was skipped is
    marked descoped, never passed.

  Start with [0001](docs/specs/0001-stack-and-architecture/index.md). Every
  later spec inherits its binding rules.
- **[docs/reviews/](docs/reviews/)** holds a code review for each feature
  branch. Each review runs on a different model from the one that wrote the
  code, by design, and names its reviewing model at the top. The folder also
  holds the [v1 readiness audit](docs/reviews/2026-09-10-audit-v1-readiness.md),
  which the claims in this README trace back to.
- **[docs/reflexes.md](docs/reflexes.md)** holds 35 standing rules, one line
  each. Most were written right after a specific mistake in this project, and
  carry its date and what happened. Two examples:
  - A shell check ending in `|| echo "none"` prints the same reassuring word for
    a mistyped path as for a genuinely clean result.
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
