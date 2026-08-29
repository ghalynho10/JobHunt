# JobHunt

## What it is

JobHunt is a multi user job search web app. A person enters a profile, searches real job listings, sees them ranked with the reasoning behind each ranking shown rather than just a number, clicks through to the real posting to apply, and records that they applied. It is free, with no billing, built for one person's own job search, a few friends, and for recruiters or hiring managers evaluating it as a portfolio piece.

## Why it exists

JobHunt replaces an earlier project, JobPilot, on the author's resume and portfolio. Two audits of JobPilot's real codebase, not just its documentation, found specific and serious defects. A usage limiting database function returned a list of rows, the calling code read it as a single row instead, and every metered action was silently denied for every account for two weeks, a bug that went undetected because every test in the suite mocked the same wrong assumption the code made. Separately, the product's core scoring feature passed every test while returning a nearly constant, meaningless fit score, because no test checked the quality of the output, only its shape.

JobHunt's design answers both problems mechanically rather than by good intentions. Failures are values that the type system forces a caller to handle, never exceptions that can be silently swallowed. An alert watches the rate of failure, not just the count, because JobPilot's outage was correctly classified failure by failure and only looked wrong in aggregate. The fit scoring feature, JobHunt's actual differentiator, is built with a banded rubric, a check by a second model from a different vendor, and an eval harness with expected score ranges, specifically so a repeat of the constant score bug would be caught before it ever shipped.

## How it is built

One Next.js 16 application, App Router, TypeScript in strict mode, with the entire data path running on the server, no client side calls to the database at all. Postgres, hosted by Supabase, is the database, reached through `@supabase/ssr` with no object relational mapper in between; every query carries the caller's own token, so Postgres row level security, a rule enforced by the database itself, is the real guarantee that one user can never read another user's rows, rather than a check in application code that could be forgotten.

Authentication is Supabase Auth. The real product signs in through OAuth only, Google and GitHub; a development only password sign in exists today to prove the scaffold works and is deleted once real auth ships. Zod validates everything crossing a boundary: external API responses, model output, form input, and environment variables. Failures are values, a discriminated union built only through one function that reports itself to Sentry, tagged with a required severity and a closed set of failure kinds, which is what lets an alert group and count them reliably. Styling is Tailwind CSS v4. The eventual AI ranking calls will route through one thin, configuration driven client so a model or vendor swap is a config change, not a code change, and jobs data comes from the Adzuna REST API.

The database is six related tables keyed off a profile row whose primary key is the sign in user's id, with uniqueness, ranges, pairing rules and per user isolation all written as database constraints and policies rather than as checks in application code. The interface is built from a small closed set of base components over a token layer: colours, a fixed type scale and a three tier page rhythm live as CSS variables in one stylesheet, and the components are the only sanctioned way to render those patterns, which is what stops a page inventing its own spacing or its own idea of a card. Tests run on Vitest as two suites, one needing nothing and one driving the real local database with the real policies applied, and they use real dependencies rather than mocks, for a reason the next section explains.

The application is deployed on Vercel and split across three environments: a local Docker based Supabase stack for day to day development, a hosted development Supabase project that every preview deployment reads, and a separate hosted production Supabase project that only the live production URL ever touches. Preview URLs sit behind a Vercel login so nothing half built is reachable and no real personal data can land in the development project. Schema changes are hand written SQL migrations committed to git and applied by GitHub Actions, development on every pull request and production on merge to `main`. A single global kill switch, one row in Postgres, can stop every metered call with no redeploy: it is flipped from the Supabase dashboard, read only through the one module in the codebase allowed to hold the database's most privileged key, and if that read itself fails, the switch is treated as on rather than off.

## Main surfaces

The foundation is complete and the first real product surface is live; the search and apply loop is not built yet.

- `/` — the entry page, and the product's front door. Explains what JobHunt does, shows an example of a ranked result labelled as an illustration, and says plainly which features work today and which are only planned. Public, no session, and it ships no client JavaScript at all.
- `/opengraph-image` — a preview card generated once at build time, so a link pasted into a chat renders as a real product rather than a bare domain.
- `/ui-preview` — every base component at every variant, for accessibility and responsive checks. Off unless explicitly enabled, so it never appears in production.
- `/sign-in` — a development only password sign in, used to prove the scaffold works; blocked everywhere outside local development and deleted once real auth ships.
- `/health` (signed in only) — the first end to end thread: it reads the signed in user's own row from Postgres under row level security, proving isolation, and displays the kill switch's live value, proving the deployed app can read a flag with no redeploy.

Profile entry, job search, ranked results and application tracking are designed in `docs/scope/` and not built.

## Decisions that shaped it

- One Next.js application on Supabase and Vercel, server first, no object relational mapper, with Postgres row level security as the real multi user guarantee. A monolith is the only pattern that is cheap to build, debug, and operate for one developer with an audience in the tens. See [0001](specs/0001-stack-and-architecture/index.md).
- Failures are values, built only through one function that reports itself to Sentry, never thrown and possibly swallowed. JobPilot's own spec asked for this and it was skipped; a swallowed failure was the direct cause of its two week silent outage. See [0001](specs/0001-stack-and-architecture/index.md).
- Expected failures are alerted on by rate, not by raw count. Every denial in JobPilot's outage was correctly classified as expected, and the absolute count stayed small throughout with only a handful of users, so a volume threshold would have stayed silent for the whole two weeks. See [0001](specs/0001-stack-and-architecture/index.md).
- Three separate environments, local, a hosted development database every preview reads, and a separate hosted production database only the live URL touches, with previews locked behind a login. This is what makes it structurally impossible for a half built branch to reach real personal data. See [0002](specs/0002-deployment-and-environments/index.md).
- A single kill switch, one row in Postgres, read only through the one module allowed to hold the database's most privileged key, flippable from a dashboard with no redeploy, and treated as on if it cannot even be read. The named risk is uncontrolled API cost while the author is unemployed, and stopping it can never wait on a build. See [0002](specs/0002-deployment-and-environments/index.md).
- Every rule the data has lives in Postgres as a constraint or a policy, not in application code. A rule written in the application holds only for the code paths that remember it; a rule written in the database holds for every caller, including a future one nobody has thought of. See [0003](specs/0003-data-model/index.md).
- Tests run against real dependencies, never a mock that encodes the same assumption as the code it is testing. This is the direct answer to JobPilot's two week outage, where every test passed because each one mocked the same misreading the code made. The integration suite drives a real local database with the real policies applied. See [0004](specs/0004-test-foundation/index.md).
- The component API is the enforcement mechanism for the interface, not a style guide people are asked to follow. A hand rolled composition duplicating a base component is a review finding, and one such case, a rounded bordered container built by hand, is caught by the linter. See [0005](specs/0005-design-system-and-ui-foundation/index.md).
- The front door says only what is true. Nothing appears as working that has not shipped, and no control that cannot work is rendered as a link, so a visitor is never offered something that does nothing. The prototype it was built from failed both tests. See [0006](specs/0006-entry-page-and-link-metadata/index.md).

## Where things live

```
src/
  app/            routes only
    (marketing)/  public routes, no session required
    (app)/        protected routes; its layout checks the session
  features/       each feature's own actions, queries, components and schemas
    entry-page/   the public page's section modules (has its own AGENTS.md)
  components/
    ui/           the design system: the only sanctioned way to render these
                   patterns (has its own AGENTS.md)
  lib/
    supabase/     browser, server and secret key clients (secret.ts is the
                   only file allowed to build a client with the database's
                   most privileged key)
    result.ts     the Result union and the failure() constructor every
                   failure in the app is built through
    kill-switch.ts, origin.ts, env.ts
  proxy.ts        refreshes the session cookie only; decides nothing
supabase/
  migrations/     hand written SQL, the source of truth for schema and policy
test/
  helpers/        session mint, the fetch recorder, and a walker for the
                   element trees the server components return
  integration/    tests that need the real local database running
docs/
  scope/          the living plan: every feature, its status, what done means
  specs/          accepted decisions, one per numbered directory, each with a
                   verify.md recording what was actually proved and how
  observability/  alert rule and span name definitions, kept in git for review
  reviews/        fresh model code review findings, one file per branch
assets/           third party files committed with their licence beside them
```

A feature's own code lives entirely under `src/features/<feature>/`. Anything two features need to share moves to `src/lib` or, for shared UI, `src/components/ui`.

## Current state

The foundation is finished. Seven features are done: the stack and architecture, coding standards and tooling, deployment and environments, the data model, the test foundation, the design system, and the entry page with its link metadata. The application is live on Vercel across three environments with two hosted Supabase projects, the migration pipeline runs in CI against both, and the kill switch, Sentry, an uptime monitor and branch protection are all proven, including a drill that broke production on purpose and recovered inside a minute.

What that means concretely: there is a real front door at `/` that renders on the design system's own tokens and unfurls as a proper card when the link is pasted into a chat, a component set with 275 unit tests behind it, six tables in Postgres with the isolation rules enforced by the database, and one protected page proving the whole thread on a real URL.

Next is auth and per user isolation (feature 7), the last foundation piece. It replaces the development only password sign in with real Google and GitHub sign in, and it is the gate everything else waits behind: the profile, the search, and every screen that shows a user their own data. It needs both OAuth provider applications registered before the build starts.

Not built, and each waiting on the one before it: profile entry, job search against the Adzuna listings API, the apply redirect and application record, then the model client router and the fit scoring that is the product's actual differentiator, with its eval harness and cross vendor self check. After those come structured filters, listing data quality, guided application capture, and the terms and privacy notices.

Deliberately not built, by design rather than oversight: any AI or scoring code, which waits on a model client router that does not exist yet; real OAuth, which is feature 7's job and is why today's sign in is a hard blocked development password; an end to end browser test runner, which is chosen (Playwright) but arrives with the first feature that genuinely needs a browser rather than as an empty config; and billing of any kind, which this project rejects outright in favour of usage gating.

---
*Last updated: 2026-08-28. Reference document, kept current by `/overview update`. Specs in `docs/specs/` are the source of truth for any decision.*
