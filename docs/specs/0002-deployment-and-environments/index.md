# 0002. Deployment and environments

**Date**: 2026-08-21
**Status**: Proposed

## Summary

JobHunt goes live on Vercel with three environments and two hosted databases: local Docker for day to day work, a development Supabase project that every preview deployment reads, and a production Supabase project that only the live URL touches. Previews are locked behind a Vercel login so nothing half built is reachable and no real personal data can land in the development project, which is what finally makes spec 0001's rule about the database agent enforceable. The global kill switch stops being an idea and becomes one row in Postgres, readable only by the one module allowed to hold the secret key, flipped from a dashboard with no deploy, and failing closed when it cannot be read. Along the way this feature fixes a gap the scope did not see: the scaffold's sign in is blocked outside local development, so today there is no way to prove the end to end thread on a real URL at all.

## Requirements

**User stories**:
- As the author, I want a merge to `main` to reach a real public URL, so the portfolio link exists from week one instead of at the end.
- As the author, I want preview deployments reading a separate database, so a half built branch can never touch a real resume.
- As the author, I want one switch I can flip from outside the app, so I can stop spending money in seconds without waiting for a build.
- As the author, I want to know the site is down before a recruiter does.
- As a recruiter opening the link, I want the page to load.

**Acceptance criteria**:

- **AC-1**: A merge to `main` deploys automatically, and the production URL serves the application over HTTPS with no manual step.
- **AC-2**: A push to any branch other than `main` produces a preview deployment that reads the development Supabase project. No preview ever holds credentials for the production project.
- **AC-3**: A preview URL is not reachable without a Vercel login. The production URL is public.
- **AC-4**: Every secret is set per environment in Vercel and none is committed. A deployed build never sets `SKIP_ENV_VALIDATION`, so a missing or malformed variable fails the build by name rather than booting into a confusing runtime error.
- **AC-5**: The full feature 1 thread is proved against a real deployed URL, not locally: sign in, the protected layout's session check, a read of one row through the real server client under row level security, and the row rendered. Two different seeded users see two different rows.
- **AC-6**: The kill switch flag exists in both hosted databases, and its current value is displayed on the deployed scaffold check page, read through the secret key client.
- **AC-7**: Flipping the flag in the Supabase dashboard changes what the deployed page shows on the next request, with no deploy and no build.
- **AC-8**: A failed read of the flag is treated as switched on, and is rendered as a visible failure. It is never reported as "off".
- **AC-9**: A query carrying a user's token cannot read the settings row at all, proved against the real database rather than asserted.
- **AC-10**: Password sign in is impossible on production, in both places it is guarded: the sign in page does not render and the Server Action refuses to run. The enabling variable is absent there, both guards fail closed, and neither depends any longer on how a build labels `NODE_ENV`.
- **AC-11**: Migrations reach the hosted databases through CI: the development project on a pull request, production on merge to `main`. A migration that fails to apply fails the workflow visibly and does not silently leave the two projects on different schemas.
- **AC-12**: `main` cannot be pushed to directly. A merge requires a pull request and a green CI check.
- **AC-13**: Sentry receives events from both production and preview, each tagged with its environment and with a release matching the deployed commit, and a stack trace points at real source lines rather than bundled output. A deployed build with no DSN configured fails the build by name rather than deploying with reporting silently switched off.
- **AC-14**: Trace sampling is 1.0 in production and lower in preview, read from validated configuration rather than hardcoded in two files.
- **AC-15**: Sentry quota approaching exhaustion reaches a human before it is exhausted, because binding rule 4's alert going silent is the failure this project is written against.
- **AC-16**: Both ways this app can go dark reach a human. An uptime monitor running outside Vercel watches the production URL and notifies when it stops answering, and Supabase's pause warning emails for both projects arrive at an address that is actually read. The two are not interchangeable: the monitor watches Vercel and will report the site up while a database underneath it is paused.
- **AC-17**: The Supabase MCP server, if connected, is scoped to the development project with `read_only=true` and per call confirmation left on. No production project ref is configured anywhere.
- **AC-18**: A broken production deployment can be recovered by promoting the previous one, and the written procedure states plainly that promoting does not undo a migration.

## Decision

**Chosen option**: Option 1: Vercel git integration, three environments, a separate development database.

Deploy from git through Vercel with `main` as production and every other branch as a protected preview, backed by two hosted Supabase projects (development and production) plus local Docker, with schema delivered by GitHub Actions and the global kill switch stored as a single row in Postgres.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`) · `sentry-sdk-setup` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-sdk-setup/`)

## Rationale

Reasoning, the four options weighed, the landscape check behind the platform facts, and references: see [rationale.md](rationale.md).

## Feature design

### Environment topology

| Environment | Application | Database | Who can reach it | Sign in |
|---|---|---|---|---|
| Local | `pnpm dev` on `localhost:3000` | Local Supabase in Docker | You | Dev password sign in, enabled |
| Preview | Every branch that is not `main` | Development Supabase project, `us-east-1` | You, signed in to Vercel | Dev password sign in, enabled |
| Production | `main` | Production Supabase project, `us-east-1` | Anyone with the link | None until feature 7 ships OAuth |

Vercel functions run in `iad1` to sit beside both databases. Node 24, matching `.nvmrc` and `engines`. The runtime stays Node, never Edge, per spec 0001.

The development project holds synthetic data only. That is not a promise to keep in mind: it holds because previews are the only deployed surface reading it and previews require a Vercel login, so nobody but the author can enter anything into it. If preview protection is ever turned off, this guarantee and binding rule 7's fifth condition both fail together.

### Data model sketch

One new table, plus one existing table gaining a fixture path.

`public.app_settings`, the single row that holds the global kill switch.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `smallint` | not null | `1` | Primary key, with `check (id = 1)`. One row, enforced by the database rather than by convention. |
| `kill_switch_enabled` | `boolean` | not null | `false` | True means every gated call stops. |
| `updated_at` | `timestamptz` | not null | `now()` | Maintained by a trigger, so a flip made in the dashboard is timestamped without anyone remembering. |

Access, deliberately narrow:

- Row level security enabled and forced, with **zero policies**. A table with row level security on and no policy denies every action to every role that respects policies.
- No `grant` to `anon` and none to `authenticated`. Two independent gates, matching the pattern already used by `scaffold_check`.
- The only reader is a client built with the secret key, which carries `BYPASSRLS`. That is exactly the caller binding rule 1 already names.

`public.scaffold_check` is unchanged. Its rows carry a foreign key to `auth.users`, which is why the fixture reaches hosted projects the way described below rather than through a migration.

### How the scaffold fixture reaches a hosted project

This amends the interview answer, and the reason is a constraint the question missed: a `scaffold_check` row cannot exist without an owning user, and creating fake users in production through a migration would be a worse outcome than the problem it solves.

- **Schema** reaches every project through migrations, always.
- **The `app_settings` row** is inserted by its own migration, so it exists in every project including production. It has no foreign key and nothing fake about it.
- **The `scaffold_check` fixture and its two seeded users** stay in `supabase/seed.sql`, made idempotent, and the migration workflow applies that file to the **development project only**, never production. Production carries no fake users and no scaffold row, which is correct: production has no sign in path at all until feature 7, so the thread is proved on a preview against the development project.

The seed is applied with `psql "$SUPABASE_DB_URL_DEV" -f supabase/seed.sql`, a direct connection using a stored connection string, because `supabase db push` does not run seed files. `supabase db reset --linked` would run it but wipes the database first, which is not acceptable against a shared project even a development one.

Whether that insert is actually permitted on a hosted project is unconfirmed, which is why build task 5 proves it by hand before task 6 puts it in CI. The reasoning is in [rationale.md](rationale.md), under why the fixture is seeded rather than migrated.

### Site URL: two values, two jobs

| Value | What it is | Where it comes from | Used by |
|---|---|---|---|
| Canonical site URL | Always the production origin, in every environment | `NEXT_PUBLIC_SITE_URL`, validated in `src/env.ts` | Page metadata, canonical links, the social preview image (feature 6) |
| Current origin | The origin this request is actually being served from | A resolver: the branch URL on a preview, the canonical site URL in production, `http://localhost:3000` locally | OAuth redirect callbacks (feature 7), any absolute link back to the running deployment |

Neither can quietly stand in for the other. A canonical link that points at a preview is wrong; a redirect that points at production from a preview is broken.

### API surface

No new HTTP endpoint. Binding rule 6 forbids route handlers under `src/app/api/` from touching user data, and nothing here needs one: the uptime monitor watches the public marketing page, which is a truer signal than a route that only reports on itself.

| Surface | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/` (marketing page) | GET | none | The page | public | none; a non 200 is what the uptime monitor reports on |
| `/health` (scaffold check) | GET | session cookie | The user's row, plus the kill switch value and its `updated_at` | authenticated, session verified in the protected layout | no session redirects to `/sign-in`; a database failure renders a visible failure block |
| `readKillSwitch()` in `src/lib/kill-switch.ts` | server function | none | `Result<{ enabled: boolean; updatedAt: string }>` | secret key client, server only | `database_unavailable`, `record_not_found`, `response_malformed`, each returned as a failure meaning "switched on" |

### Value sourcing

| Action | Value produced or displayed | Source |
|---|---|---|
| Any deployed request | Which environment this is | `NEXT_PUBLIC_VERCEL_ENV`, parsed as an optional value in `src/env.ts`; absent means local |
| Page metadata (feature 6) | Canonical site URL | `NEXT_PUBLIC_SITE_URL`, set to the production origin in all three environments |
| OAuth callback (feature 7) | Current request origin | Resolver: `NEXT_PUBLIC_VERCEL_BRANCH_URL` on a preview, `NEXT_PUBLIC_SITE_URL` in production, `http://localhost:3000` locally. None of these carry a protocol scheme except the last, so the resolver adds `https://` |
| Sentry init | Environment tag | `NEXT_PUBLIC_VERCEL_ENV`, defaulting to `development` |
| Sentry init | Release identifier | `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` |
| Sentry init | Trace sample rate | `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, validated as a number between 0 and 1, defaulting to 1 |
| Scaffold check page | The user's row | `public.scaffold_check`, through the request scoped server client under row level security |
| Scaffold check page | Kill switch state and when it changed | `public.app_settings.kill_switch_enabled` and `.updated_at`, through the secret key client only |
| Kill switch read failure | What the app assumes | Not a value read from anywhere: a failed read is defined to mean switched on |
| Dev sign in guard, page and action alike | Whether password sign in is permitted | `DEV_SESSION_ENABLED`, a validated server variable defaulting to false |
| Migration workflow | The development database connection for the seed step | `SUPABASE_DB_URL_DEV`, a GitHub secret holding the pooler connection string |
| Migration workflow | Which project to push to | `SUPABASE_PROJECT_ID_DEV` or `SUPABASE_PROJECT_ID_PROD`, chosen by the triggering event, from GitHub secrets |

### Key invariants

1. **Destructive migrations are asymmetric.** A migration may add in the same commit as the code that uses it. A migration may drop only after a previous deploy has already stopped reading the thing being dropped. Never add and drop in one commit. Vercel and GitHub Actions build the same commit in parallel, so an additive migration arriving late causes a brief visible error that self heals, while a drop arriving early breaks running code with nothing to catch it. Feature 4 owns the real schema and must carry this rule in its own spec, not inherit it by memory.
2. **`SKIP_ENV_VALIDATION` is never set on a deployed build.** It exists for the CI job that holds no secrets, and nowhere else.
3. **The kill switch fails closed.** Anything other than a successful read of `false` means gated calls stop.
4. **Only `src/lib/kill-switch.ts` reads `app_settings`,** and it is the module that holds binding rule 1's named kill switch caller. Pages under `src/app` reach it through that module and never import `src/lib/supabase/secret.ts` directly, which is what the existing lint rule enforces.
5. **Production and development schemas are the same schema.** Both come from `supabase/migrations/`. A change applied to one project by hand is drift, and the workflow is the only sanctioned path.
6. **No secret is ever committed.** `.gitignore` already excludes every `.env*` except the template; `.env.example` stays the complete record of what has to be set.

### Security model

- **Preview deployments**: Vercel Authentication, standard protection. Only the account owner reaches them. Production stays public.
- **`app_settings`**: unreadable and unwritable by any user token. Readable by the secret key client, which is constructible in exactly one file. Writable in practice only through the Supabase dashboard or a direct database connection, which is the point: flipping the switch requires access to the deployment, not a privilege inside the product.
- **`scaffold_check`**: unchanged, one row per user under an ownership policy, `anon` deliberately ungranted so a request without a session gets a hard denial rather than an empty result.
- **Dev password sign in**: enabled by an explicit variable that defaults to false, set only on the Vercel Preview environment and locally. Production never carries it. Feature 7 deletes the whole feature folder.
- **Supabase MCP**: scoped with `project_ref` to the development project, `read_only=true`, per call confirmation on, no other MCP server connected alongside it, and the production ref configured nowhere. This closes the environment half of binding rule 7 that spec 0001 assigned to this feature.
- **Personal data**: none in the development project by construction, since previews are the only surface that reads it and they require a Vercel login.

### Configuration required

Set in **Vercel**, per environment. Nothing here is committed.

| Variable | Production | Preview | Local `.env.local` | Purpose |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production project | development project | local Docker | Supabase endpoint |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | production project | development project | local Docker | Browser safe key |
| `SUPABASE_SECRET_KEY` | production project | development project | local Docker | `sb_secret_…`, read only by `src/lib/supabase/secret.ts` |
| `NEXT_PUBLIC_SITE_URL` | production origin | production origin | production origin | The canonical URL, same everywhere by design |
| `DEV_SESSION_ENABLED` | **not set** | `true` | `true` | Enables the development password sign in. Defaults to false |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | `1` | `0.1` | `1` | Binding rule 4 needs 1.0 where the ratio alert runs; previews must not compete for that quota |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | **required** | **required** | optional | Required on any deployed build, optional locally so a fresh clone still runs |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | set | set | unset | Build time only, for source map upload |
| System environment variables | enabled | enabled | n/a | Provides `VERCEL_ENV`, `VERCEL_BRANCH_URL`, `VERCEL_GIT_COMMIT_SHA` and their framework prefixed forms |

New entries in `src/env.ts`, all parsed by Zod like everything else:

- `DEV_SESSION_ENABLED` (server, boolean from string, default `false`)
- `NEXT_PUBLIC_SITE_URL` (client, URL, required)
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (client, number between 0 and 1, default `1`)
- `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_BRANCH_URL`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (client, all optional, absent when running locally)

One change to existing entries: `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` stop being plainly optional. They become **conditionally required**: optional when `NEXT_PUBLIC_VERCEL_ENV` is absent (local work, and a fresh clone before anyone has a Sentry project), required when it is present. Without this, a deployed build with no DSN succeeds and ships with error reporting silently off, which is the failure shape the whole error model exists to prevent, and it would leave AC-13 passing on paper while nothing reported.

Set as **GitHub Actions secrets**, for the migration workflow only:

- `SUPABASE_ACCESS_TOKEN`: a personal access token for the Supabase CLI
- `SUPABASE_PROJECT_ID_DEV`, `SUPABASE_PROJECT_ID_PROD`: the two project refs
- `SUPABASE_DB_PASSWORD_DEV`, `SUPABASE_DB_PASSWORD_PROD`: the two database passwords, used by `supabase db push`
- `SUPABASE_DB_URL_DEV`: the development project's connection string, used only by the seed step

**Prerequisites before coding begins**, each producing values the build then needs:

- A Vercel account (confirmed to exist).
- Two Supabase projects in `us-east-1`, development and production. Each yields a project URL, a publishable key, a secret key, a project ref, a database password and a connection string.
- A Sentry account with an organisation and a project. Yields `SENTRY_ORG`, `SENTRY_PROJECT`, the DSN, and an auth token for source map upload. Nothing in this feature creates these, and four required variables come from them.
- A free uptime monitoring account.

### Critical test scenarios

- Happy path: a merge to `main` deploys and the production URL serves the marketing page, verifies **AC-1**.
- Happy path: on a preview URL, signing in as `dev-one` shows dev one's row, and signing in as `dev-two` shows a different row, verifies **AC-5**.
- Failure case: with `app_settings` unreachable, the deployed page renders a visible failure and the app treats the switch as on, verifies **AC-8**.
- Failure case: flip the flag in the dashboard, reload the deployed page, and the displayed value changes with no deploy, verifies **AC-7**.
- Failure case: a migration written to fail is pushed, and the workflow fails visibly rather than reporting success, verifies **AC-11**.
- Auth/permission: a query with a signed in user's token against `app_settings` returns a permission denial, not an empty result, verifies **AC-9**.
- Auth/permission: an anonymous request to a preview URL is stopped by Vercel Authentication, verifies **AC-3**.
- Auth/permission: a POST to the sign in action on production is refused because `DEV_SESSION_ENABLED` is absent, verifies **AC-10**.

## Build plan

Ordered as a Tracer Bullet: get one thin thread serving from a real URL before thickening any part of it. Tasks 1 to 4 are the thread; everything after widens it.

1. Create the two Supabase projects in `us-east-1`, development and production. Record, for each: project URL, publishable key, secret key, project ref, database password and connection string. Task 3 and task 5 both need these, not just the refs. Satisfies **AC-2**.
2. Add `NEXT_PUBLIC_SITE_URL`, `DEV_SESSION_ENABLED`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` and the three optional Vercel system values to `src/env.ts` and `.env.example`, and make the two Sentry DSN values conditionally required as described above, so a missing variable fails the build by name before any deploy exists to be confused by it. Satisfies **AC-4**, **AC-13**.
3. Create the Vercel project from the GitHub repository: production branch `main`, Node 24, system environment variables enabled, functions in `iad1` if the plan allows the region to be chosen (confirm at build time; if it is fixed, take the default and record which region it is). Set the full variable matrix per environment. Never set `SKIP_ENV_VALIDATION`. Satisfies **AC-1**, **AC-4**.
4. Turn on Vercel Authentication with standard protection, so previews are private from the first one. Satisfies **AC-3**.
5. **Prove the seed's write path by hand against the real development project, before any of it goes into CI.** The migration creates `scaffold_check` as `postgres`, so `postgres` owns it, and it forces row level security with no insert policy. A table owner under `force row level security` does not bypass policies unless its role carries superuser or `BYPASSRLS`. The local Docker `postgres` is a superuser, so this can never surface locally; whether the hosted `postgres` role carries `BYPASSRLS` is unconfirmed. Run the seed manually once the project exists. If it is refused, the fix is small (insert the rows through the secret key client, or add a narrowly scoped insert policy), but finding out through a red required check on an unrelated pull request is the expensive path. Satisfies **AC-5**, **AC-11**.
6. Add `.github/workflows/db-migrate.yml`: `supabase db push` to the development project on `pull_request` (`opened`, `synchronize`, `reopened`), to production on a push to `main`, failing the run visibly on a failed migration. Make `supabase/seed.sql` idempotent and apply it to the development project only, in the same workflow, with `psql "$SUPABASE_DB_URL_DEV" -f supabase/seed.sql`. Correct that file's header comment while you are in it: it currently reads "Local development seed. Runs on `pnpm db:reset`, never against a real project", which this workflow makes untrue. Satisfies **AC-11**.
7. Replace the `NODE_ENV` guard with the validated `DEV_SESSION_ENABLED` check, failing closed, in **both** places it lives: `src/features/dev-session/actions.ts` and the page guard in `src/app/(marketing)/sign-in/page.tsx`. Fixing only the action leaves the sign in page returning a not found on every preview, so the thread stays unreachable and AC-5 cannot be run. Satisfies **AC-10**.
8. Add the current origin resolver beside the canonical site URL, so features 6 and 7 have both values named and neither has to be invented later. Satisfies **AC-5**.
9. Re run the whole feature 1 thread against a real preview URL as two different users, and record the steps in `verify.md`. Satisfies **AC-5**.
10. Add the `app_settings` migration: the table, the single row check, the `updated_at` trigger, row level security enabled and forced with no policies, and no grants. Insert the single row in the same migration. Satisfies **AC-6**, **AC-9**.
11. Add `src/lib/kill-switch.ts` reading the flag through the secret key client, opening the `kill_switch.read` span as its first statement, parsing the row with Zod, and returning a failure that means switched on. Register the span in `docs/observability/spans.md`. Satisfies **AC-6**, **AC-8**.
12. Render the flag's value and `updated_at` on the deployed scaffold check page, then prove a dashboard flip changes it with no deploy. Satisfies **AC-6**, **AC-7**.
13. Wire Sentry per environment: environment tag, release from the commit sha, sampling from the validated variable, source map upload in the Vercel build. Satisfies **AC-13**, **AC-14**.
14. Turn on Sentry's quota notifications and record the threshold in `docs/observability/README.md`, alongside a note that a silent rate alert is the failure mode this protects. Satisfies **AC-15**.
15. Set up the external uptime monitor against the production URL and record it in `docs/observability/README.md`, together with what it does not cover: it watches Vercel, so a paused database leaves it reporting the site up. Satisfies **AC-16**.
16. Confirm Supabase's pause warning emails reach an address that is actually read, for **both** projects, and record in `docs/observability/README.md` that this, not the uptime monitor, is the pause detection mechanism. Satisfies **AC-16**.
17. Protect `main`: pull request required, CI check required. Satisfies **AC-12**.
18. **A human step, not a `/develop` step.** Connect the Supabase MCP server scoped to the development project with `read_only=true` and per call confirmation, and confirm no production ref exists in any configuration. MCP authorisation needs an interactive session (`claude mcp` or `/mcp`) and cannot be completed inside an ordinary build pass, the same constraint spec 0001 already records for the Vercel MCP server. Satisfies **AC-17**.
19. Correct spec 0001's binding rule 1 allow list and the matching comment in `src/lib/supabase/secret.ts`, so both say the kill switch read is built in feature 3 and lives in `src/lib/kill-switch.ts`. Binding rule 1 says its allow list is closed and changing it means editing the spec, so this is an edit the rule itself requires, not a tidy up to defer. Satisfies **AC-6**.
20. Write the rollback procedure into `docs/observability/README.md`: promote the previous deployment first, revert in git after, and note plainly that promoting does not undo a migration. Satisfies **AC-18**.

## Consequences

**Positive**

- A real public URL exists from week one, which is what features 6 and 7 were sequenced against and what makes the portfolio claim real rather than pending.
- Binding rule 7's fifth condition becomes enforceable, so the Supabase MCP server can be connected without dropping one of its five conditions.
- The kill switch exists before the first external call, which is the ordering the named risk rule asks for.
- A gap the scope did not see is closed: the deployed leg of the feature 1 thread was unprovable, and is now provable.
- Both hosted environments are free. Nothing here introduces a monthly bill.

**Negative and tradeoffs**

- Two hosted projects means two sets of secrets and a schema that can drift if anyone applies a migration by hand. The workflow is the mitigation; the discipline is still a discipline.
- **Both hosted projects will pause, and production is the more exposed of the two.** Supabase's free plan pauses a project that has not had sufficient database activity over the previous week, and their guidance is that this means roughly a few user requests a day across that week. That is a daily bar, not a weekly one, so a burst of activity on merge day does not clear it. Production is worse off than development here: nothing touches the production database at all until feature 7 ships a way to sign in, so it will pause while being perfectly healthy. Development is exposed too whenever a few days pass with no previews.

  The consequences differ by project. A paused **development** project first breaks **CI**, not previews: the migration workflow's push fails, and with `main` behind a required check, an unrelated pull request goes red for a reason that does not look like the cause. A paused **production** project leaves the marketing page serving normally while anything touching data fails, which is precisely the shape of failure this project's error model exists to make visible.

  Detection is Supabase's own email, not the uptime monitor. Supabase sends a warning roughly a week before pausing and a confirmation once paused. The uptime monitor watches Vercel and will happily report the site up with a paused database underneath it. Accepted rather than worked around, on the same reasoning as before: the fix is a dashboard restore, and a scheduled keep awake job was declined.
- Vercel and GitHub Actions build the same commit in parallel, so ordering between a migration and a deploy rests on invariant 1 rather than on machinery. A destructive migration written carelessly breaks production, and nothing will stop it.
- Production runs on Vercel Hobby, which pauses the whole project when free usage is exhausted. That is the intended hard stop, and it means the portfolio URL can go down without warning. The uptime monitor tells you; it does not prevent it.
- Preview trace sampling below 1.0 means a rare failure on a preview may not be sampled. Accepted: previews are hand driven, so a missed sample is noticed by the person driving.
- This feature edits feature 1's code (the sign in guard) and feature 10's future territory (the kill switch read). Both are deliberate and both are named in binding rule 1's allow list already, but it does mean feature 10 inherits a read path it did not write.
- Turning off preview protection later would silently break the guarantee that no real personal data reaches the development project. Nothing enforces the link between those two facts except this spec.

**Neutral**

- The canonical site URL is the production origin even locally, so a metadata check run on `localhost` shows production links. That is correct behaviour and it will look wrong the first time.
- Vercel's framework prefixed system variables (`NEXT_PUBLIC_VERCEL_*`) are used rather than the bare ones, because the client bundle needs them. Their exact availability should be confirmed at build time rather than assumed.
- `VERCEL_URL` is documented as incompatible with standard deployment protection. Nothing in this design uses it; the branch URL is used instead.
- The function region may not be a free choice on Hobby. If it is fixed, `us-east-1` for both databases is still the right pick, since Vercel's default region is in the same place. Confirm rather than assume, and record whichever region the project actually runs in.
- The production Supabase project will sit empty until feature 7 ships a way to sign in. That is expected, not a fault, though it is also the reason it will pause.

## Follow-up

- [ ] **Feature 4 must carry invariant 1 in its own spec.** The expand then contract rule is written here, but feature 4 owns the real schema and is where a destructive migration will actually be written. A rule that lives only in the deployment spec is a rule the data model spec will not read.
- [ ] **Confirm the exact framework prefixed system variable names on Vercel at build time** (`NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_BRANCH_URL`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`) rather than trusting this spec. If any is unavailable in the client bundle, fall back to an explicit variable set per environment.
- [ ] **Confirm Sentry's current surface for quota notifications** when wiring AC-15. Spec 0001 already carries the same caution about the failure rate alert surface; both are worth doing in one sitting with the `sentry-sdk-setup` skill open.
- [ ] **Check whether `@sentry/nextjs` already infers the release on Vercel** before setting it explicitly, so the release is not configured twice with two different values.
- [ ] **A custom domain is deferred, not declined.** Moving from the `vercel.app` subdomain later means updating three redirect lists (Google, GitHub, Supabase) plus one Vercel setting. Cheapest to do before feature 7 wires OAuth, not after.
- [ ] **Supabase Branching is the better isolation answer and was rejected on cost alone.** Revisit if this project ever has a budget, or if the development project's pausing becomes a real drag.
- [ ] **The Vercel MCP server is present in the environment and unauthorised.** Binding rule 7 says Supabase MCP only, so connecting it is a deliberate decision that would amend that rule, not a default.
- [ ] Agent Skills and MCP discovery for Vercel and GitHub Actions was offered and declined, on the grounds that this environment already exposes Vercel skills. Record the decline in root `AGENTS.md` so it is not offered again.
- [ ] Once the production URL is claimed, write the real origin into this spec's configuration table so `NEXT_PUBLIC_SITE_URL` has one recorded correct value rather than a description of one.
