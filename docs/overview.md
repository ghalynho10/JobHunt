# JobHunt

## What it is

JobHunt is a multi user job search web app. A person enters a profile, searches real job listings, sees them ranked with the reasoning behind each ranking shown rather than just a number, clicks through to the real posting to apply, and records that they applied. It is free, with no billing, built for one person's own job search, a few friends, and for recruiters or hiring managers evaluating it as a portfolio piece.

## Why it exists

JobHunt replaces an earlier project, JobPilot, on the author's resume and portfolio. Two audits of JobPilot's real codebase, not just its documentation, found specific and serious defects. A usage limiting database function returned a list of rows, the calling code read it as a single row instead, and every metered action was silently denied for every account for two weeks, a bug that went undetected because every test in the suite mocked the same wrong assumption the code made. Separately, the product's core scoring feature passed every test while returning a nearly constant, meaningless fit score, because no test checked the quality of the output, only its shape.

JobHunt's design answers both problems mechanically rather than by good intentions. Failures are values that the type system forces a caller to handle, never exceptions that can be silently swallowed. An alert watches the rate of failure, not just the count, because JobPilot's outage was correctly classified failure by failure and only looked wrong in aggregate. The fit scoring feature, JobHunt's actual differentiator, is built with a banded rubric, a check by a second model from a different vendor, and an eval harness with expected score ranges, specifically so a repeat of the constant score bug would be caught before it ever shipped.

## How it is built

One Next.js 16 application, App Router, TypeScript in strict mode, with the entire data path running on the server, no client side calls to the database at all. Postgres, hosted by Supabase, is the database, reached through `@supabase/ssr` with no object relational mapper in between; every query carries the caller's own token, so Postgres row level security, a rule enforced by the database itself, is the real guarantee that one user can never read another user's rows, rather than a check in application code that could be forgotten.

Authentication is Supabase Auth. The real product signs in through OAuth only, Google and GitHub; a development only password sign in exists today to prove the scaffold works and is deleted once real auth ships. Zod validates everything crossing a boundary: external API responses, model output, form input, and environment variables. Failures are values, a discriminated union built only through one function that reports itself to Sentry, tagged with a required severity and a closed set of failure kinds, which is what lets an alert group and count them reliably. Styling is Tailwind CSS v4. The eventual AI ranking calls will route through one thin, configuration driven client so a model or vendor swap is a config change, not a code change, and jobs data comes from the Adzuna REST API.

The application is deployed on Vercel and split across three environments: a local Docker based Supabase stack for day to day development, a hosted development Supabase project that every preview deployment reads, and a separate hosted production Supabase project that only the live production URL ever touches. Preview URLs sit behind a Vercel login so nothing half built is reachable and no real personal data can land in the development project. Schema changes are hand written SQL migrations committed to git and applied by GitHub Actions, development on every pull request and production on merge to `main`. A single global kill switch, one row in Postgres, can stop every metered call with no redeploy: it is flipped from the Supabase dashboard, read only through the one module in the codebase allowed to hold the database's most privileged key, and if that read itself fails, the switch is treated as on rather than off.

## Main surfaces

Only the foundation has been built so far, so what is actually live today is small:

- `/` — a placeholder public homepage, no session required.
- `/sign-in` — a development only password sign in, used to prove the scaffold works; blocked everywhere outside local development and deleted once real auth ships.
- `/health` (signed in only) — the one real end to end thread built so far: it reads the signed in user's own row from Postgres under row level security, proving isolation, and displays the kill switch's live value, proving the deployed app can read a flag with no redeploy.

Every other surface the product is meant to have, profile entry, job search, ranked results, application tracking, is designed in `docs/scope/` but not built yet.

## Decisions that shaped it

- One Next.js application on Supabase and Vercel, server first, no object relational mapper, with Postgres row level security as the real multi user guarantee. A monolith is the only pattern that is cheap to build, debug, and operate for one developer with an audience in the tens. See [0001](specs/0001-stack-and-architecture/index.md).
- Failures are values, built only through one function that reports itself to Sentry, never thrown and possibly swallowed. JobPilot's own spec asked for this and it was skipped; a swallowed failure was the direct cause of its two week silent outage. See [0001](specs/0001-stack-and-architecture/index.md).
- Expected failures are alerted on by rate, not by raw count. Every denial in JobPilot's outage was correctly classified as expected, and the absolute count stayed small throughout with only a handful of users, so a volume threshold would have stayed silent for the whole two weeks. See [0001](specs/0001-stack-and-architecture/index.md).
- Three separate environments, local, a hosted development database every preview reads, and a separate hosted production database only the live URL touches, with previews locked behind a login. This is what makes it structurally impossible for a half built branch to reach real personal data. See [0002](specs/0002-deployment-and-environments/index.md).
- A single kill switch, one row in Postgres, read only through the one module allowed to hold the database's most privileged key, flippable from a dashboard with no redeploy, and treated as on if it cannot even be read. The named risk is uncontrolled API cost while the author is unemployed, and stopping it can never wait on a build. See [0002](specs/0002-deployment-and-environments/index.md).

## Where things live

```
src/
  app/            routes only
    (marketing)/  public routes, no session required
    (app)/        protected routes; its layout checks the session
  features/       each feature's own actions, queries, components and schemas
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
docs/
  scope/          the living plan: every feature, its status, what done means
  specs/          accepted decisions, one per numbered directory
  observability/  alert rule and span name definitions, kept in git for review
```

A feature's own code lives entirely under `src/features/<feature>/`. Anything two features need to share moves to `src/lib` or, for shared UI, `src/components/ui` once feature 5 builds it.

## Current state

Foundation is where the project stands. Stack and architecture (feature 1) and coding standards and tooling (feature 2) are done. Deployment and environments (feature 3) is done as of today: the app is live on Vercel across three environments with two hosted Supabase projects, the migration pipeline runs in CI against both, the kill switch works end to end, and Sentry, an uptime monitor, and branch protection are all proven, including a real drill that broke production on purpose, promoted the previous deployment, and confirmed recovery, all inside a minute. Two small items are intentionally still open there: Supabase's pause warning emails are not yet confirmed to reach a read address, and a handful of checks have no caller until auth or usage gating exist.

Everything else is not built. Data model, design system, the real entry page, auth, and a test foundation are still planned, each waiting on its own design decision. Nothing in the core search and apply loop, the ranking and scoring system that is the actual differentiator, or any feature past it exists yet. Today's deployed app is genuinely just the foundation scaffold described above: a placeholder homepage, a development only sign in, and one protected page proving the row level security and kill switch thread on a real URL.

Deliberately not built yet, by design rather than by oversight: any AI or scoring code, which waits on a model client router that does not exist; a component library, which waits on a design system decision; real OAuth sign in, which today is only a hard blocked development password; and billing of any kind, which this project rejects outright in favor of usage gating.

---
*Last updated: 2026-08-23. Reference document, kept current by `/overview update`. Specs in `docs/specs/` are the source of truth for any decision.*
