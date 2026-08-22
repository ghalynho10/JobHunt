# 0002. Deployment and environments: rationale

The reasoning behind [index.md](index.md). `/develop` does not read this file.

## Context

> ⚠️ Premise note: the scope's done when clause assumes the feature 1 thread can be re run against the live URL. It cannot, as the code stands. `signInWithDevPassword` refuses whenever `NODE_ENV !== "development"`, and every Vercel build runs as production, so `/health` sits behind the protected layout with no reachable session on any deployed URL. Left alone, this feature would have closed with the deployed leg proved by an unauthenticated page load, which proves the framework and nothing about the session or the row level policy, exactly the half that matters. The spec therefore replaces the `NODE_ENV` guard with an explicit opt in flag scoped to preview deployments. This is a change to feature 1's code inside feature 3, and it is deliberate.

JobHunt runs entirely on the local machine today. The scaffold boots, a protected page reads one row through the real server client under a real policy, lint and types and build are green, and none of it has ever been served from anywhere but `localhost`. Spec 0001 chose Vercel and Supabase and settled how the application is shaped; it deliberately did not settle how many real environments exist, where secrets live, how schema reaches a hosted database, or what a deploy actually consists of.

Three forces shape the decision. The first is cost. The author is unemployed and the brief says so plainly; a monthly bill is a real constraint, not a rounding error, and the whole usage gating feature exists because of it. The second is the named risk retention rule: anything in scope because of a specific named risk is removed only by deciding that risk is acceptable. The global kill switch is here under that rule, and this feature is where it stops being an idea and becomes a row someone can flip. The third is that later features have already been written against a production origin that does not exist. Feature 7 needs a stable OAuth callback origin. Feature 6 needs a canonical URL for page metadata and a social preview image. Both were sequenced on the assumption that feature 3 produces one.

There is also an unpaid debt. Spec 0001 binding rule 7 sets five conditions for connecting the Supabase MCP server, and the fifth, never pointed at a project holding real user data, is unenforceable until a development project distinct from production exists. Spec 0001 names feature 3 as the owner of that half. The risk is not theoretical: the brief documents a real disclosure where an agent holding credentials that bypass row level security followed instructions planted in user submitted text. JobHunt holds real resumes from Slice 1 onward.

Not deciding has a compounding cost. Every week the app is not deployed is a week where hosting, environment variables and the preview split get solved later, on top of auth, a real data model and real user data, instead of now while the whole application is one health page.

## Options considered

### Option 1: Vercel git integration, three environments, a separate development database

Link the repository to Vercel and let it deploy from git: `main` to production, every other branch to a preview. Two hosted Supabase projects, development and production, with local Docker underneath. Previews read development and are locked behind Vercel Authentication. Migrations reach both hosted projects through GitHub Actions.

**Pros**:
- Fits the free tiers exactly. Supabase gives two projects, which is the number needed, and Vercel Hobby covers the traffic.
- A preview can never write to a real resume, which is what makes binding rule 7's fifth condition true rather than merely stated.
- Preview deployments come free with the git integration and need no pipeline of our own.
- The repository stays the source of truth for schema, and a failed migration fails visibly in CI rather than silently on a laptop.

**Cons**:
- Two sets of secrets, two projects to keep in step, and a schema that can drift between them if a migration is applied to one and not the other.
- Vercel builds from git independently of GitHub Actions, so the deploy and the migration for the same commit race each other.
- A Supabase free project pauses after about a week of inactivity, so the development project will go down on its own and need restoring by hand.

### Option 2: Vercel git integration, one hosted database

The same deployment shape with a single hosted Supabase project serving both previews and production.

**Pros**:
- Half the secrets, half the projects, no schema drift possible, nothing to pause unnoticed.
- Fastest to stand up, and the second project can be split out later.

**Cons**:
- A preview deployment writes to production data. Every half built branch is one bad migration or one bad write away from real user rows.
- Binding rule 7's fifth condition becomes unenforceable, so either the MCP server is not connected at all or one of the five conditions is quietly dropped.
- The split gets done later under pressure, with real data in the table, which is the expensive time to do it.

### Option 3: Deploy from GitHub Actions only

Turn off Vercel's git integration. One pipeline runs lint, types, migrations and then `vercel deploy --prebuilt`, in that order.

**Pros**:
- Strict ordering. A migration always lands before the code that needs it, so the race disappears by construction.
- One pipeline to read, entirely in the repository.

**Cons**:
- Preview deployments per push stop being free and have to be built and wired by hand, including their comment and URL plumbing.
- Considerably more machinery for one developer to own and debug, for a problem that a migration discipline also solves.
- The build no longer runs in the environment that serves it, so a Vercel specific build failure surfaces later.

### Option 4: Supabase branching, a database per pull request

Use Supabase Branching so every pull request gets an ephemeral database seeded from the migrations, torn down on merge.

**Pros**:
- The cleanest isolation available. No shared development project to drift, pause, or accumulate junk.
- Migrations are exercised from empty on every pull request, which catches an unrunnable migration immediately.

**Cons**:
- Requires a paid Supabase plan, which is recurring money against an explicitly stated cost constraint.
- Adds a second deployment concept, per branch databases, to a project whose whole architecture note is that one developer must be able to operate it.

## Rationale

Option 1 is chosen because it is the only shape that satisfies all three forces at once. It costs nothing, since two Supabase projects and Vercel Hobby are exactly what the free tiers give. It makes the isolation real rather than promised, which is what unblocks the MCP decision spec 0001 handed to this feature. And it gets a stable production origin existing this week, which is what features 6 and 7 were sequenced against.

Option 2 was the tempting one, because it is genuinely simpler and the project has no users yet. It was rejected on the named risk retention rule: the isolation is in scope because of a specific documented attack shape, so dropping it needs an explicit decision that the risk is acceptable, and there is no reason to accept it when the alternative is free. Option 4 is the technically best answer and is rejected purely on cost. It is worth revisiting the moment this project has a budget. Option 3 solves a real problem, the deploy and migration race, but it pays for it by rebuilding preview deployments by hand. The same problem is solved for free by a migration discipline, which is written into the spec as a named constraint rather than left as a habit.

On the race specifically: the engineer's instruction is the right one. An additive migration arriving after the deploy causes a brief visible error and self heals; a destructive one arriving before the deploy breaks running code with nothing to catch it. So the rule is asymmetric by design, and it belongs in feature 4's spec too, since that is where the real schema gets written.

On the kill switch, a Postgres row beat Vercel Edge Config despite Edge Config being faster and free at this volume. Binding rule 1 already names the kill switch read as one of exactly three callers permitted to build a secret key client. Choosing Edge Config would leave that allow list entry describing a caller that never gets written, and would put the single most important operational control on a second platform. One control plane for one switch.

On sampling, the engineer's amendment is correct and load bearing. Binding rule 4's entire error model rests on the failure ratio being computed from unsampled attempts in production. If preview traffic, which is where deliberate breakage happens while hand driving a branch, competes for the same finite quota, the environment that loses is the one the alert depends on. Hence 1.0 in production and lower on previews, and hence quota exhaustion being treated as a visible failure: an alert that cannot fire is the exact failure this project's observability design was written against, and discovering it when an alert does not arrive is discovering it too late.

## Why the scaffold fixture is seeded rather than inserted by a migration

Written down because the migration approach is the obvious one and will be proposed again otherwise.

`public.scaffold_check.user_id` is `not null references auth.users (id)`. A migration therefore cannot insert a scaffold row: migrations run against a fresh project before any user exists, so there is no owner to point at, and the insert fails on the foreign key. The only way to make it work inside a migration is to create fake users in `auth.users` from the migration itself, which would then run against production too. Fake users in the production authentication table is a worse outcome than the problem being solved, and production has no sign in path at all until feature 7, so it has no use for the fixture.

Hence the split: schema by migration everywhere, the `app_settings` row by migration everywhere (it has no foreign key and nothing fake about it), and the scaffold fixture by seed against the development project only.

There is a second, unconfirmed wrinkle in the same area, which is why the spec makes proving the seed by hand a build task of its own rather than a step inside the workflow. The scaffold migration runs `alter table ... force row level security` and defines no insert policy. `force` makes policies apply to the table's owner as well, and the owner is `postgres` because the migration created the table. A role only escapes that with superuser or `BYPASSRLS`. The local Docker `postgres` is a superuser, so the seed inserts happily and always will locally; whether the hosted project's `postgres` role carries `BYPASSRLS` was not confirmed during this design. If it does not, the seed is refused on the hosted project and the fix is small, but only if it is found deliberately rather than as a red required check on an unrelated pull request.

## Landscape check, 2026-08-20

Run once during the design conversation, on this thread, official documentation first. These are the facts that changed the options.

- **Supabase free plan gives two active projects**, so development plus production fits at zero cost. Paused projects do not count against the limit.
- **A Supabase free project is paused when it has not had sufficient database activity over the previous week**, and Supabase's guidance is that roughly a few user requests a day across that week is what prevents it. That is a daily bar, so a burst on merge day does not clear it, and it applies to both projects rather than only the development one. Supabase warns by email about a week ahead and confirms once paused; restoring is a manual step in the dashboard. Accepted rather than worked around.
- **Vercel Hobby pauses the project when free tier usage is exceeded.** The configurable spend cap is a Pro feature, so on Hobby the hard stop is the default rather than something to switch on. That matches the named risk rule, and the gap is noticing, which is what the uptime monitor covers.
- **Vercel Authentication is available on Hobby** and protects preview deployments while the production domain stays public. Password protection is Pro only. Documented caveat: `VERCEL_URL` cannot be used together with Standard Protection.
- **`VERCEL_PROJECT_PRODUCTION_URL` is set even inside a preview build** and holds the production domain with no protocol scheme. `VERCEL_BRANCH_URL` holds the per branch preview domain, also with no scheme.
- **Vercel environment variables scope to production, preview and development**, and a preview variable can be pinned to one branch, overriding the general preview value.
- **`supabase db push` compares the migrations directory against the migration history table** and applies only what is missing. It does not run `seed.sql`. In CI it needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and the project ref.
- **Vercel Edge Config on Hobby** includes 100,000 reads and 100 writes a month, which would have been ample. Rejected on the control plane argument, not on limits.

## What was checked after the accounts existed, 2026-08-21

The design was written before any account existed, so several of its values were descriptions rather than facts. These were checked afterwards by the engineer, in the dashboards and in a browser, and the results are recorded in `index.md` under What is actually provisioned. Nothing in the build environment can read Vercel or Supabase state, since the Vercel CLI is not installed and the Vercel MCP server is unauthorised, so each of these rests on that check and not on a tool reading live state.

- **Standard protection leaves the generated production URL public.** `https://usejobhunt.vercel.app` served the scaffold in a private window with no Vercel session. This confirms the landscape check above, which already recorded it, and it was worth confirming because the opposite would have broken AC-1, AC-3 and the uptime monitor together and would have forced the deferred custom domain immediately.
- **A Vercel project name and its subdomain are claimed separately.** `jobhunt-app` was available as a project name while its subdomain was not. Hence project `jobhunt` on `usejobhunt.vercel.app`. Worth writing down because it is the kind of detail that looks like a typo later.
- **The Data API was set not to expose new tables, on both projects.** The `scaffold_check` migration was already written against exactly that assumption, with an explicit `grant select ... to authenticated` and a comment saying so, so the setting makes an existing comment true rather than changing anything already applied. It did surface one gap the design missed, which is that `app_settings` needs its own grant to `service_role`; see the data model sketch.
- **The framework prefixed variable names are still unconfirmed.** System environment variables are enabled, but nobody has checked that the three `NEXT_PUBLIC_VERCEL_*` names reach the client bundle. The follow up box stays open and task 3 carries the fallback.

## References

**Project sources** (verifiable, in this repo):
- Spec [0001](../0001-stack-and-architecture/index.md): hosting on Vercel with the Node runtime, environment config validated by `@t3-oss/env-nextjs`, binding rule 1 (the secret key has one home, and the kill switch read is a named caller), binding rule 4 (rate alerts and 1.0 sampling), binding rule 6 (authorisation never in the proxy), binding rule 7 (the five MCP conditions, environment half owed to this feature).
- Root `AGENTS.md`: pnpm 11.22, Node 24, the functional and immutable rules, errors as values through `failure()`.
- `.github/workflows/ci.yml`: the existing lint, format, typecheck and build job, whose `SKIP_ENV_VALIDATION` comment already names feature 3 as the owner of the deployed build.
- `docs/scope/scope.md`, feature 3 and the standing rules, in particular the named risk retention rule and no silent failures.
- `docs/jobhunt-carry-forward.md`, feature 3 section: the MCP attack shape and Supabase's own mitigations.
- `src/features/dev-session/actions.ts`: the `NODE_ENV` guard this spec replaces.
- `supabase/migrations/20260820041006_scaffold_check.sql` and `supabase/seed.sql`: the scaffold thread's schema and its fixture, and the foreign key to `auth.users` that shapes how the fixture reaches a hosted project.

**Practices & standards**:
- Expand then contract for schema change, so a migration is safe against both the old and the new code.
- Fail closed for a control whose purpose is to stop spending.
- Least privilege at the database: row level security enabled with no policies, so only a credential that bypasses policies can read the row.
- Independent monitoring: the thing that watches for an outage does not run on the platform that would be down.
- Configuration validated at the boundary rather than read raw from the environment.

**Links** (web verified during the landscape check above):
- Vercel system environment variables: https://vercel.com/docs/environment-variables/system-environment-variables
- Vercel environment variables and per environment scoping: https://vercel.com/docs/environment-variables
- Vercel deployment protection: https://vercel.com/docs/deployment-protection
- Vercel Authentication: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- Vercel spend management: https://vercel.com/docs/spend-management
- Vercel Edge Config limits and pricing: https://vercel.com/docs/edge-config/edge-config-limits
- Supabase pricing and the free plan project limit: https://supabase.com/pricing
- Supabase billing, free plan projects: https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase database migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase managing environments: https://supabase.com/docs/guides/deployment/managing-environments
- Supabase branching: https://supabase.com/docs/guides/deployment/branching
