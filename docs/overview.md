# JobHunt

## What it is

JobHunt is a multi user job search web app. A person enters a profile, searches real job listings, sees them ranked with the reasoning behind each ranking shown rather than just a number, clicks through to the real posting to apply, and records that they applied. It is free, with no billing, built for one person's own job search, a few friends, and for recruiters or hiring managers evaluating it as a portfolio piece.

## Why it exists

JobHunt replaces an earlier project, JobPilot, on the author's resume and portfolio. Two audits of JobPilot's real codebase, not just its documentation, found specific and serious defects. A usage limiting database function returned a list of rows, the calling code read it as a single row instead, and every metered action was silently denied for every account for two weeks, a bug that went undetected because every test in the suite mocked the same wrong assumption the code made. Separately, the product's core scoring feature passed every test while returning a nearly constant, meaningless fit score, because no test checked the quality of the output, only its shape.

JobHunt's design answers both problems mechanically rather than by good intentions. Failures are values that the type system forces a caller to handle, never exceptions that can be silently swallowed. An alert watches the rate of failure, not just the count, because JobPilot's outage was correctly classified failure by failure and only looked wrong in aggregate. The fit scoring feature, JobHunt's actual differentiator, is built with a banded rubric, a check by a second model from a different vendor, and an eval harness with expected score ranges, specifically so a repeat of the constant score bug would be caught before it ever shipped.

## How it is built

One Next.js 16 application, App Router, TypeScript in strict mode, with the entire data path running on the server, no client side calls to the database at all. Postgres, hosted by Supabase, is the database, reached through `@supabase/ssr` with no object relational mapper in between; every query carries the caller's own token, so Postgres row level security, a rule enforced by the database itself, is the real guarantee that one user can never read another user's rows, rather than a check in application code that could be forgotten.

Authentication is Supabase Auth, through OAuth only, Google and GitHub, with no password anywhere in the product. The whole handshake runs on the server, so the pages carrying the sign in controls still ship no client JavaScript. A database level hook refuses to create a second account for an email address that already signs in with the other provider, so somebody who forgets which one they used first reaches their own data rather than a new empty account. Zod validates everything crossing a boundary: external API responses, model output, form input, and environment variables. Failures are values, a discriminated union built only through one function that reports itself to Sentry, tagged with a required severity and a closed set of failure kinds, which is what lets an alert group and count them reliably. Styling is Tailwind CSS v4. The eventual AI ranking calls will route through one thin, configuration driven client so a model or vendor swap is a config change, not a code change, and jobs data comes from the Adzuna REST API.

The database is six related tables keyed off a profile row whose primary key is the sign in user's id, with uniqueness, ranges, pairing rules and per user isolation all written as database constraints and policies rather than as checks in application code. The interface is built from a small closed set of base components over a token layer: colours, a fixed type scale and a three tier page rhythm live as CSS variables in one stylesheet, and the components are the only sanctioned way to render those patterns, which is what stops a page inventing its own spacing or its own idea of a card. Tests run on Vitest as two suites, one needing nothing and one driving the real local database with the real policies applied, and they use real dependencies rather than mocks, for a reason the next section explains.

The application is deployed on Vercel and split across three environments: a local Docker based Supabase stack for day to day development, a hosted development Supabase project that every preview deployment reads, and a separate hosted production Supabase project that only the live production URL ever touches. Preview URLs sit behind a Vercel login so nothing half built is reachable and no real personal data can land in the development project. Schema changes are hand written SQL migrations committed to git and applied by GitHub Actions, development on every pull request and production on merge to `main`. A single global kill switch, one row in Postgres, can stop every metered call with no redeploy: it is flipped from the Supabase dashboard, read only through the one module in the codebase allowed to hold the database's most privileged key, and if that read itself fails, the switch is treated as on rather than off.

## Main surfaces

The foundation is complete, a signed in user can fill in their own profile, and every outside job search call is gated before it can run. The search and apply loop itself, the part that actually calls the job listing source, is not built yet.

- `/` — the entry page, and the product's front door. Explains what JobHunt does, shows an example of a ranked result labelled as an illustration, and says plainly which features work today and which are only planned. Public, no session, and it ships no client JavaScript at all.
- `/opengraph-image` — a preview card generated once at build time, so a link pasted into a chat renders as a real product rather than a bare domain.
- `/ui-preview` — every base component at every variant, for accessibility and responsive checks. Off unless explicitly enabled, so it never appears in production.
- `/terms`, `/privacy` — public pages written against what this codebase actually stores and actually sends to which companies, not from a template. A typed registry of data recipients and a typed registry of stored fields, each guarded by a test, are what keep the two pages honest as later features add their own outside calls.
- `/sign-in` — the real sign in page, in every environment. Two controls, Google and GitHub, each an ordinary form submit that works with JavaScript switched off. When sign in fails it renders this product's own sentence for what went wrong, above both controls, never the provider's raw error text.
- `/auth/callback` — the return leg of the handshake, which exchanges the provider's code for a session. Every path through it ends in a redirect, so a failed sign in lands on a page that explains itself rather than on an error screen.
- `/go` — the door: the one place that reads a signed in visitor's session on `/`'s behalf, so the entry page itself can keep reading nothing and still stop inviting an already signed in visitor to sign in.
- `/profile` (signed in only, in the navigation) — the profile form, four independently saved sections (identity, skills, work history, preferences), each its own edit state named by a URL search parameter rather than client side toggle state. Where a signed in visitor with no profile row lands.
- `/search` (signed in only, in the navigation) — a real route under the app shell with a placeholder body: the page, the header, and the navigation all exist; feature 11 fills in the actual search. Where a signed in visitor who already has a profile lands.
- `/applications` (signed in only, reachable but not yet in the navigation) — the same real route, placeholder body pattern, waiting on feature 12.
- `/health` (signed in only, deliberately not in the navigation) — no longer where signing in lands; that decision now belongs to the one shared landing rule above. Kept as a diagnostic: it reads the signed in user's own profile row under row level security, proving isolation, and displays the kill switch's live value, proving the deployed app can read a flag with no redeploy.

Ranked results and application tracking are designed in `docs/scope/` and not built.

## Decisions that shaped it

- One Next.js application on Supabase and Vercel, server first, no object relational mapper, with Postgres row level security as the real multi user guarantee. A monolith is the only pattern that is cheap to build, debug, and operate for one developer with an audience in the tens. See [0001](specs/0001-stack-and-architecture/index.md).
- Failures are values, built only through one function that reports itself to Sentry, never thrown and possibly swallowed. JobPilot's own spec asked for this and it was skipped; a swallowed failure was the direct cause of its two week silent outage. See [0001](specs/0001-stack-and-architecture/index.md).
- Expected failures are alerted on by rate, not by raw count. Every denial in JobPilot's outage was correctly classified as expected, and the absolute count stayed small throughout with only a handful of users, so a volume threshold would have stayed silent for the whole two weeks. See [0001](specs/0001-stack-and-architecture/index.md).
- Three separate environments, local, a hosted development database every preview reads, and a separate hosted production database only the live URL touches, with previews locked behind a login. This is what makes it structurally impossible for a half built branch to reach real personal data. See [0002](specs/0002-deployment-and-environments/index.md).
- A single kill switch, one row in Postgres, read only through the one module allowed to hold the database's most privileged key, flippable from a dashboard with no redeploy, and treated as on if it cannot even be read. The named risk is uncontrolled API cost while the author is unemployed, and stopping it can never wait on a build. See [0002](specs/0002-deployment-and-environments/index.md).
- Every rule the data has lives in Postgres as a constraint or a policy, not in application code. A rule written in the application holds only for the code paths that remember it; a rule written in the database holds for every caller, including a future one nobody has thought of. See [0003](specs/0003-data-model/index.md).
- Tests run against real dependencies, never a mock that encodes the same assumption as the code it is testing. This is the direct answer to JobPilot's two week outage, where every test passed because each one mocked the same misreading the code made. The integration suite drives a real local database with the real policies applied. See [0004](specs/0004-test-foundation/index.md).
- The component API is the enforcement mechanism for the interface, not a style guide people are asked to follow. A hand rolled composition duplicating a base component is a review finding, and one such case, a rounded bordered container built by hand, is caught by the linter. See [0005](specs/0005-design-system-and-ui-foundation/index.md).
- The sign in handshake runs entirely on the server, so the public entry page can carry real sign in controls and still ship no client JavaScript. Both controls are ordinary form submits rather than click handlers, which is what keeps that true. See [0007](specs/0007-auth-and-per-user-isolation/index.md).
- A second account for an email that already signs in with the other provider is refused by the database, not by application code, and the refusal fails closed: if the check itself errors it still refuses rather than admitting a silent empty account. The development only password sign in was deleted outright rather than switched off, so no environment is one setting away from accepting a password. See [0007](specs/0007-auth-and-per-user-isolation/index.md).
- The front door says only what is true. Nothing appears as working that has not shipped, and no control that cannot work is rendered as a link, so a visitor is never offered something that does nothing. The prototype it was built from failed both tests. See [0006](specs/0006-entry-page-and-link-metadata/index.md).
- Exactly one function decides where a signed in visitor lands, imported by every caller that needs the answer (the door, the sign in bounce, the OAuth callback), so the three never quietly disagree. It reads profile row existence only, never whether that profile is good enough to score against, which is a different question with a different owner. A deep link followed while signed out survives sign in through a request header the proxy echoes, then a query parameter, then a short lived cookie, in that order. See [0008](specs/0008-app-shell-and-navigation/index.md).
- The two legal pages are generated from the same typed facts the codebase already keeps about itself (a stored fields registry, a data recipients registry), rather than written once from a template and left to drift. A test fails the moment a new outside call is added without a matching recipient entry, which is what a later feature's own key addition already trips today. They exist to unblock Google's OAuth console as much as to be honest with a reader: an app stuck in Testing is capped at 100 users for its whole lifetime. See [0009](specs/0009-terms-and-privacy-notices/index.md).
- The profile form is view first, not a wizard filled once: four sections, each its own Server Action, its own edit state, and its own save, so a mistake in one section never risks the other three. See [0010](specs/0010-profile-entry/index.md).
- Every outside job search call passes through one atomic database function first, checking the caller's own weekly count and the app's daily and monthly counts together, in one statement, so a burst of concurrent calls can never slip past a limit that only checked itself once. A cap reached is reported as a successful decision whose answer is no, never as a failure, so a working refusal cannot itself corrupt the failure rate alert built alongside it, this project's first, proven to fire with a real forced test rather than only written down. See [0011](specs/0011-usage-gating-and-kill-switch/index.md).

## Where things live

```
src/
  app/            routes only
    (marketing)/  public routes, no session required: /, /sign-in, /terms,
                   /privacy, /ui-preview
    (app)/        protected routes, shared layout checks the session:
                   /profile, /search, /applications, /health
    go/           the door: reads the session on the static entry page's
                   behalf and sends a signed in visitor onward
    auth/         the OAuth callback
  features/       each feature's own actions, queries, components and schemas
    auth/         sign in, sign out, and the one account rule (has its own
                   AGENTS.md)
    entry-page/   the public page's section modules (has its own AGENTS.md)
    app-shell/    the shared header, the return path cookie machinery
    profile/      the four section profile form, its queries and actions
    legal/        the terms and privacy pages, and the two registries that
                   keep their claims true (has its own AGENTS.md)
  components/
    ui/           the design system: the only sanctioned way to render these
                   patterns (has its own AGENTS.md)
  lib/
    supabase/     the server and secret key clients (secret.ts is the only
                   file allowed to build a client with the database's most
                   privileged key; there is no browser client, on purpose)
    usage-gating/ checkUsageGate(), the kill switch pre-check, the copy for
                   every refusal reason
    result.ts     the Result union and the failure() constructor every
                   failure in the app is built through
    landing-rule.ts   the one function that decides where a signed in
                   visitor lands
    kill-switch.ts, origin.ts, return-path.ts, env.ts
  proxy.ts        refreshes the session cookie only; decides nothing
supabase/
  migrations/     hand written SQL, the source of truth for schema and policy
test/
  helpers/        session mint, the fetch recorder, a direct database
                   connection gated to local only, and a walker for the
                   element trees the server components return
  integration/    tests that need the real local database running
  integration-serial/  the one project for tests that mutate state every
                   other integration file also reads, so they cannot race
docs/
  scope/          the living plan: every feature, its status, what done means
  specs/          accepted decisions, one per numbered directory, each with a
                   verify.md recording what was actually proved and how
  observability/  alert rule and span name definitions, kept in git for review
  reviews/        fresh model code review findings, one file per branch
CHANGELOG.md      notable changes, written for a reader rather than from the
                   commit log
assets/           third party files committed with their licence beside them
```

A feature's own code lives entirely under `src/features/<feature>/`. Anything two features need to share moves to `src/lib` or, for shared UI, `src/components/ui`.

## Current state

The foundation is finished, and so is the first slice's safety net. Twelve features are done: the stack and architecture, coding standards and tooling, deployment and environments, the data model, the test foundation, the design system, the entry page with its link metadata, real sign in with per user isolation, the app shell and navigation, the terms and privacy notices, profile entry, and usage gating with the kill switch. The application is live on Vercel across three environments with two hosted Supabase projects, the migration pipeline runs in CI against both, and the kill switch, Sentry, an uptime monitor and branch protection are all proven, including a drill that broke production on purpose and recovered inside a minute.

What that means concretely: a signed in user can reach `/profile`, fill in identity, skills, work history and preferences, reload the page, and find it all still there and still editable, saved through row level security rather than through an application level check. Every outside job search call, once feature 11 starts making them, will pass through one atomic database function that checks three windows at once and cannot be slipped past under concurrent load, and this project's first failure rate alert exists behind it, proven to fire end to end with a real forced test rather than only written down. 767 unit tests and 73 integration tests back this, six tables in Postgres with the isolation rules enforced by the database, and a real person able to sign in with Google or GitHub on the live URL and reach a page that is theirs alone.

Next is job search and results list (feature 11), tagged as needing a decision: `/architect` first, since it owns the real attribution asset the app shell deliberately deferred to it and adds the search source as this codebase's first company data reaches. It must land before the apply redirect (feature 12), which is waiting on it.

Not built, and each waiting on the one before it: the apply redirect and application record, then the model client router and the fit scoring that is the product's actual differentiator, with its eval harness and cross vendor self check. After those come structured filters, listing data quality, and guided application capture.

Deliberately not built, by design rather than oversight: any AI or scoring code, which waits on a model client router that does not exist yet; an end to end browser test runner, which is chosen (Playwright) but arrives with the first feature that genuinely needs a browser rather than as an empty config; and billing of any kind, which this project rejects outright in favour of usage gating. A signed in user who already has a profile lands on `/search`, a real route wearing the shell with a placeholder body, because the search itself is what feature 11 still has to build. That is the tracer bullet working out loud rather than a defect.

---
*Last updated: 2026-09-04. Reference document, kept current by `/overview update`. Specs in `docs/specs/` are the source of truth for any decision.*
