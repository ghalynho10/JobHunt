# Verify: deployment & environments · spec 0002 · updated 2026-08-21

_Steps derived from spec 0002's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_The probes behind these results, with the exact commands, the answers, and the two that answered something other than what they were pointed at, are in [docs/experiments/0002-deployment-and-environments.md](../../experiments/0002-deployment-and-environments.md)._

Steps already proved during the build are ticked, with what proved them. Everything unticked needs either a dashboard, a hosted database, or a real deployed URL, none of which the build environment can reach.

**`/check verify` ran on 2026-08-22, after the merge, against the live production URL and a production build of the merged commit `c1750e4`.** It ticked nine more steps and left notes under several others. What is still owed falls into three groups: **a dashboard nobody but the engineer can open** (Sentry events and sampling, Sentry spend notifications, UptimeRobot's real check result, the Supabase pause emails, both Supabase projects' region and Data API setting), **an action that changes the repository** (a deliberately failing migration, a real direct push to `main`, adding the migration check to the required checks), and **production's own database**, which cannot be read at all while its secret key is Sensitive in Vercel and no deployed page reads it.

**A second session on 2026-08-23 closed most of what was left, and found a real bug doing it.** While gathering the Sentry evidence below, an escalating `database_unavailable` issue turned up on production. Root cause: a layout's `redirect()` only changes the response it sends, the page beneath it still renders concurrently, so `readScaffoldCheck()` and `readKillSwitch()` both ran on every anonymous `/health` hit regardless of the session guard. `anon` correctly has no grant on `scaffold_check`, so nothing was ever exposed, but every bot or crawler hit produced a misleadingly labelled, escalating failure. Fixed in `src/features/scaffold-check/queries.ts` to verify its own session first, reviewed, merged as PR #3 (`3c1c54f4b368`), and confirmed live with a clean `session_missing` event instead. The same session closed both repository changing checks below, added the required check, and confirmed most of the remaining dashboard items directly, including that production's secret key has in fact been exercised the whole time. Still owed: the recovery drill, half of AC-14's sampling proof, and Supabase's pause emails.

## Hand proofs owed against the hosted development project

These three come first, because later steps trust their answers. Run them in the Supabase SQL editor of the **development** project (never production), and write the answers back into spec 0002 where each says to.

### P-1 · The seed's write path (spec task 5, gates task 6)

The migration creates `scaffold_check` as `postgres` and forces row level security with no insert policy. A table owner under forced row level security does not bypass policies unless its role carries superuser or `BYPASSRLS`. The local Docker `postgres` is a superuser, so this can never surface locally, and whether the hosted `postgres` role carries `BYPASSRLS` is unconfirmed. Finding out through a red required check on an unrelated pull request is the expensive path.

Paste the whole of `supabase/seed.sql` into the SQL editor and run it. Then run it a second time.

- [x] First run succeeds → the workflow's seed step is sound. *Proved 2026-08-22 on the hosted development project. The hosted `postgres` role does bypass row level security for this insert, so the risk this step guarded against did not materialise.*
- [x] Second run succeeds and changes nothing: counts stayed at 2. *Proved 2026-08-22.*

```sql
select
  (select count(*) from auth.users)          as users,
  (select count(*) from auth.identities)     as identities,
  (select count(*) from public.scaffold_check) as scaffold_rows;
```

### P-2 · What `service_role` actually holds on `app_settings` (spec task 10)

This decides how to read a denial in P-3. Without it, three different causes look identical.

```sql
select
  has_table_privilege('service_role', 'public.app_settings', 'select') as service_role_select,
  has_schema_privilege('service_role', 'public', 'usage')              as service_role_schema_usage,
  has_table_privilege('anon',          'public.app_settings', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.app_settings', 'select') as authenticated_select;
```

- [x] `service_role_select` and `service_role_schema_usage` are both true; `anon_select` and `authenticated_select` are both false. *Confirmed 2026-08-22 on the hosted development project: t, t, f, f, matching local exactly.*
- [x] **The isolating query.** The result above does not answer whether the Data API setting withholds privileges from `service_role`, because that grant is explicit in the migration. `public.scaffold_check` is the table that answers it: granted to `authenticated` only, never to `service_role`.

  ```sql
  select has_table_privilege('service_role', 'public.scaffold_check', 'select') as service_role_on_ungranted_table;
  ```

  *Returned **false** on the hosted development project on 2026-08-22, matching local. The setting withholds from `service_role` too, so the `app_settings` grant was necessary and invariant 6 is load bearing. Recorded in spec 0002.*

- [ ] **Regression guard for feature 4 and after.** For every table created from now on, confirm the reading role actually holds the privilege, rather than assuming a new table is reachable:

  ```sql
  select has_table_privilege('<role>', 'public.<table>', 'select');
  ```

  A missing grant produces a permission denial rather than an empty result, which is the failure shape this project wants, but only if someone recognises it as one.

### P-3 · AC-9, a user's token cannot read the settings row

Proved, not asserted. The result must be a **permission denial**, never an empty result.

```sql
set local role authenticated;
select * from public.app_settings;
reset role;
```

- [x] Returns `42501 permission denied for table app_settings`. An empty result instead would mean the grant is wrong and the switch is readable by users. *Proved 2026-08-22 on the hosted development project, with the denial reported verbatim including the hint suggesting the grant that must never be made.* → **AC-9**

## Commands

- [x] `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build` → all clean. *Proved 2026-08-21.*
- [x] `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_VERCEL_ENV=preview pnpm build` → **fails**, naming `NEXT_PUBLIC_SENTRY_DSN`. *Proved 2026-08-21.* → **AC-4**, **AC-13**
- [x] **The same rule fired on a real Vercel build, unprompted.** *2026-08-22: the first preview deployment of this branch failed with `NEXT_PUBLIC_SENTRY_DSN is required on a deployed build`, because that variable had never been set in the Vercel project while `SENTRY_DSN` had. A real deployed build with no client DSN was stopped by name rather than shipping with error reporting switched off, which is exactly what AC-13 exists to guarantee, and it found a genuine configuration gap on its first outing rather than in a simulation.* → **AC-4**, **AC-13**
- [x] `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=https://x@o1.ingest.sentry.io/1 NEXT_PUBLIC_VERCEL_ENV=preview pnpm build` → **fails**, naming `SENTRY_DSN`. The server pass demands it separately. *Proved 2026-08-21.* → **AC-4**, **AC-13**
- [x] `pnpm build` with no `NEXT_PUBLIC_VERCEL_ENV` → succeeds with no DSN set, so a fresh clone still runs. *Proved 2026-08-21.* → **AC-13**
- [x] `DEV_SESSION_ENABLED= pnpm build && DEV_SESSION_ENABLED= pnpm start` → `/` is 200, `/sign-in` is **404**, `/health` is 307. *Proved 2026-08-21.* → **AC-10**
- [x] Apply `supabase/seed.sql` three times to a freshly reset local database → counts stay 2, 2, 2. *Proved 2026-08-21.* → **AC-11**
- [x] Open a pull request and watch **Apply migrations (development)** run green, then confirm the development project holds the two users and both scaffold rows. *Proved 2026-08-22 on PR #1: every step green, migrations pushed (both already applied, so skipped), seed applied, and `Apply migrations (production)` correctly skipped on a pull request.* → **AC-11**

  **It took three attempts, and all three were secret value shapes rather than workflow bugs.** The project ref must be the bare 20 letter subdomain; the direct connection host is IPv6 only while GitHub runners are IPv4, so the pooler is mandatory; and the pooler username must be `postgres.<project-ref>`, not bare `postgres`. The working shape is `postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres`. Full detail in the experiments file. **The production secrets have never been exercised and can fail the same three ways on merge.**
- [x] Write a migration that cannot apply, push it, and confirm the workflow **fails visibly** rather than reporting success. Remove it afterwards. *Proved 2026-08-23 on PR #4: a migration referencing `public.does_not_exist` failed `Apply migrations (development)` in 11 seconds with `ERROR: relation "public.does_not_exist" does not exist (SQLSTATE 42P01)` and exit code 1, a real Postgres error rather than a workflow bug. Migration removed and the PR closed without merging once confirmed.* → **AC-11**
- [x] Merge to `main` and watch **Apply migrations (production)** run green, then confirm production holds `app_settings` with one row and **no** `scaffold_check` rows and **no** fake users. → **AC-11**

  **Half proved on 2026-08-22, finished on 2026-08-23.** The workflow half: on the merge of PR #1 (run `32591293454`) the production job ran green and logged `Applying migration 20260820041006_scaffold_check.sql` and `Applying migration 20260821120000_app_settings.sql`, then `Finished supabase db push`. On the merge of PR #2 (run `32592343136`) it logged `Remote database is up to date`. The production job carries no seed step at all, so nothing in CI can put a fake user or a scaffold row there. **The row counts are now confirmed too**, read directly from production's own SQL editor rather than through the application: see the AC-6 step below.
- [x] `git grep -rn "SKIP_ENV_VALIDATION"` → appears only in `src/env.ts`, `.github/workflows/ci.yml` and documentation, never in a deployed build's configuration. *Proved 2026-08-22: the only code hits are `src/env.ts:141` and `.github/workflows/ci.yml:44`, everything else is spec and verify prose.* → **AC-4**

## UI and manual

### The deployment itself

- [x] Merge to `main`, wait for the deploy, load `https://usejobhunt.vercel.app` over HTTPS with no manual step. *Proved 2026-08-22: the merge commit `c1750e4` was pushed at 18:58:52Z, Vercel created production deployment `dpl_DzgqP15pkK5aJNr5otkgG5kVAyia` at the same second, GitHub's Production deployment record for `c1750e4` reads `success`, and `https://usejobhunt.vercel.app/` answers `200` over HTTPS. Nobody touched a dashboard in between.* → **AC-1**
- [x] Push this branch, open its preview URL in a **private window**: Vercel Authentication asks for a login. *Proved 2026-08-22 with an unauthenticated request carrying no cookies at all, which is stricter than a private window: the current preview returns `302` to `https://vercel.com/sso-api?url=…&nonce=…`, which is Vercel Authentication.* → **AC-3**
- [x] Load `https://usejobhunt.vercel.app` in a **private window**: it serves the page with no login. *Proved 2026-08-22, `HTTP 200` with no session. Standard protection leaves the generated production URL reachable, so AC-1 and AC-3 do not conflict, which was a real risk in this design rather than a given.* → **AC-3**

  Beware stale deployment URLs when checking this. A URL belonging to a deployment that failed to build returns `404`, which looks nothing like either expected answer and is easy to read as a broken protection setting. Take the URL from the deployment record of a **successful** build.

  Incidental, and useful to feature 6: preview responses carry `x-robots-tag: noindex` from Vercel already.
- [x] In the Vercel project's environment variables, confirm the preview scope carries the **development** project's Supabase URL, publishable key and secret key, and that no production project value appears in any preview scoped variable. *Checked 2026-08-22 with `vercel env ls` and `vercel env pull` per environment: preview points at `serbuc…`, production at `fvaae…`, two distinct projects. `DEV_SESSION_ENABLED` is present on Preview and absent from Production, as designed.* → **AC-2**
- [x] **Production's `SUPABASE_SECRET_KEY` is exercised on every unauthenticated hit, and has never been refused.** → **AC-2**, **AC-6**

  It is marked Sensitive in Vercel, which makes it write only: `vercel env pull` returns the literal string `[SENSITIVE]`, so the two environments' keys cannot be compared directly. Preview's key is proved correct by behaviour, because the kill switch read the development database from a preview.

  **Production's cannot be proved by inspection either, but it turns out to be exercised constantly, which this file wrongly assumed away twice.** An earlier version suggested checking `/health` reads *running* after the merge; that fails because `/health` sits inside the protected layout, which needs a session, and production has no sign in path until feature 7. But the layout's redirect only changes the *response*: the page beneath it still renders concurrently, so `readKillSwitch()`, sitting in the same `Promise.all` as the scaffold check, runs on **every** anonymous hit to `/health`, session or not. So "nothing deployed on production reads `app_settings`" was wrong. It reads constantly, just never through a route that shows the caller anything.

  **Confirmed 2026-08-23 by searching Sentry's `database_unavailable` issue for kill switch specific messages** (`The database refused the kill switch read.`, `Could not reach the database to read the kill switch.`), since a failed read would fingerprint into that same issue. Exactly two matches exist, both tagged `environment: development` on `localhost`, both the known deliberate AC-8 test. Zero are tagged production. A key belonging to the wrong project would fail as `401 Invalid API key`, reported as `database_unavailable`, which invariant 3 renders as switched on; none of that has happened on a real production request. The key is correct, with no need to wait for feature 7 or 10 to find out.
- [x] Confirm the variable matrix matches spec 0002's Configuration required table, per environment, and that `SKIP_ENV_VALIDATION` is set in no scope at all. *Proved 2026-08-22 with `vercel env ls` plus `vercel env pull` per environment. Production carries the ten variables the table names and Preview carries those ten plus `DEV_SESSION_ENABLED="true"`, which is the one intended difference. `NEXT_PUBLIC_SITE_URL` is `https://usejobhunt.vercel.app` in both. `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` is `1` in production and `0.1` in preview. `SKIP_ENV_VALIDATION` appears in no scope.* → **AC-4**
- [x] Confirm both Supabase projects are in `us-east-1` and both have the Data API set **not** to expose new tables automatically. *Confirmed 2026-08-23: both projects' Data API settings show "Automatically expose new tables" off, checked directly in each dashboard. Both regions confirmed `us-east-1`.* → **AC-2**
- [x] Confirm the Vercel project has functions in `iad1`, Node 24, production branch `main`, and system environment variables enabled. *Proved 2026-08-22: `vercel project inspect jobhunt` reads Node.js Version 24.x, `vercel inspect` on the live deployment lists every function built for `iad1`, the production deployment carries the `jobhunt-git-main` alias and only pushes to `main` produce Production deployments, and the pulled environments carry `VERCEL_ENV`, `VERCEL_TARGET_ENV` and `VERCEL_GIT_COMMIT_SHA`, which only appear when system environment variables are on.* → **AC-1**

### The feature 1 thread, on a real preview URL

- [x] Sign in on the preview as `dev-one@example.test` / `devpassword123` → `/health` shows dev one's row. *Proved 2026-08-22 on preview `f637586`: row `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`.* → **AC-5**
- [x] Sign out, sign in as `dev-two@example.test` → `/health` shows a **different** row. Two users seeing the same note means the policy is not confining anyone. *Proved 2026-08-22: row `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, a different note, same page, same deployment.* → **AC-5**

  **This is the whole point of feature 3.** Spec 0001 proved every leg of this thread locally and said plainly that the deployed leg could not be proved before a real URL existed. It now has been: framework, server client, session, row level security policy, deployment and error path, all connecting on real infrastructure, with two users confined to their own rows.
- [ ] Load `/health` on the preview with no session → redirected to `/sign-in`, not an empty page. → **AC-5**

  **Proved on production instead, on 2026-08-22**: an unauthenticated `GET https://usejobhunt.vercel.app/health` returns `307` to `https://usejobhunt.vercel.app/sign-in`, so the protected layout redirects rather than rendering an empty page. The preview version of the same check stays open because Vercel Authentication answers a cookieless request before the application ever sees it, which is AC-3 working as designed.
- [x] On **production**, load `/sign-in` → hard 404, because `DEV_SESSION_ENABLED` is absent there. *Proved 2026-08-22, after the merge and with the running commit confirmed first: the live alias serves deployment `dpl_DzgqP15pkK5aJNr5otkgG5kVAyia`, whose GitHub Production deployment record names `c1750e4`, the merge commit that carries this branch. So the 404 comes from the new guard reading `DEV_SESSION_ENABLED`, not from the old `NODE_ENV` check. `/` is `200`, `/sign-in` is `404`, and `vercel env ls` shows `DEV_SESSION_ENABLED` set on Preview only.* → **AC-10**

  **Do not tick this on the current 404, which is a trap.** Production already returns 404 for `/sign-in`, and did so before this feature existed, because the old guard read `process.env.NODE_ENV !== "development"`. Two different mechanisms give the identical answer, so the check only means anything **after this branch is merged and deployed to production**. Confirm the running commit first, then check the route. AC-10's whole point is that neither guard depends on how a build labels `NODE_ENV` any more, and a 404 alone cannot tell you which mechanism produced it.

  For reference, production on 2026-08-22 while still running `0ea8103`: `/` is 200, `/sign-in` is 404, `/health` is 307.
- [x] Confirm the sign in Server Action refuses when `DEV_SESSION_ENABLED` is absent, proved on a production shaped build since a genuine production POST needs an action id this repository cannot obtain before feature 7 renders a real sign in page. → **AC-10**

  **This step is not executable as written, and the reason is worth keeping.** A Server Action is addressed by an action id, and the id is **not stable across build locations**. Two builds of this same commit in two directories on one machine produced two different ids for the same function (`603f6650c9…` at `~/Documents/Work/Personal/jobhunt`, `60b0645fdd…` at a scratch copy), while two builds in the same directory produced identical ids. Vercel builds somewhere else again, so an id read locally is the wrong id on production. Browser devtools cannot supply the right one either: on production the sign in page never renders, so its action id is never sent to a browser.

  What was actually established on 2026-08-22, all on the merged commit `c1750e4`:

  1. **Production refused the replayed request.** `POST https://usejobhunt.vercel.app/sign-in` carrying the locally read id answered `404` with `x-nextjs-action-not-found: 1` and the body `Server action not found`. Nothing ran, nothing was set. This is a refusal, but it does not prove **which** mechanism refused, because a wrong id looks the same.
  2. **The action's own guard refuses when the variable is absent, proved by running it.** A production shaped build of the same commit (`DEV_SESSION_ENABLED=` at build and at start, port 3001), posted with that build's own id, ran the action and returned exactly `{"error":"Password sign in is not enabled in this environment."}` with no session cookie and no redirect. The same call against a build with the variable set returned `303` to `/health` with a session.
  3. **Production is in that same state**: `DEV_SESSION_ENABLED` is absent from the Production scope, confirmed in the variable matrix step above.

  So the guard is proved on a real build and production's configuration is proved to be the blocked one. **A direct exercise of the deployed action against production itself is deferred to feature 7**, since that is the first point a production build renders a real sign in page and exposes a genuine, production valid action id. The step above was rewritten on 2026-08-23 to target what is actually provable now rather than describe a proof this repository cannot yet perform.

### The kill switch

- [x] On a preview, `/health` shows the kill switch as **running**, with a `kill_switch_enabled` of `false` and an `updated_at`. *Proved 2026-08-22 on preview deployment `f637586`, signed in as dev two. The secret key client reached `app_settings` from a deployed build against the hosted development project.* → **AC-6**

  **How this one was checked, after an earlier claim of the same thing was wrong.** An identical looking screen was recorded as proving this earlier the same day, and it was `localhost:3000`: the displayed `updated_at` and `created_at` matched the local database to the microsecond, and every preview build had in fact failed. The correction is kept rather than deleted, because a verification that checked the wrong environment is exactly the failure shape this project is written against, and the tell was sitting in the data on screen the whole time.

  So the tick above rests on three independent checks, not on the page looking right: the GitHub deployment record for that commit reads `Preview / success`, the displayed timestamp differs from the local database, and the sign in worked, which only happens where `DEV_SESSION_ENABLED` is set. **Confirm the host before reading anything off a deployed page, and prefer a value that differs between environments as the proof.**

- [x] **Regression the local run caught** (found while looking at what was believed to be a preview; it would have hit a preview identically). The scaffold read on the same page failed with `response_malformed` while the kill switch beside it succeeded. Cause: making the seed idempotent replaced `gen_random_uuid()` with hand written ids of the form `aaaaaaaa-aaaa-aaaa-…`, which Postgres accepts into a `uuid` column but Zod 4's `z.uuid()` rejects, because it checks the RFC version and variant nibbles. Fixed by using real version 4 identifiers (`aaaaaaaa-aaaa-4aaa-8aaa-…`), with a self healing delete so a shared project that already holds the bad rows repairs itself on the next seed run. **Any identifier invented by hand for this project has to survive `z.uuid()`, not just `::uuid`.** The `auth.users` fixture ids have the same defect, harmlessly for now, and are flagged in `supabase/seed.sql` for feature 8.
- [x] In the Supabase dashboard, set `kill_switch_enabled` to `true` on the development project. Reload `/health` **without deploying**: it now reads **stopped**, and `updated_at` has moved (the trigger, not a hand edit). Set it back to `false`. *Proved 2026-08-22 on preview `f637586`: the page read **stopped** with the flag `true`, and `updated_at` moved from `04:35:57.426521` to `06:42:59.952915` without anyone setting that column, which is the trigger firing. No deploy and no build were involved, which is the entire claim.* → **AC-7**
- [x] Break the read deliberately (rename the table, or revoke the grant) and reload `/health`: it renders the red failure block saying the value could not be read, showing its kind and severity. It must **not** render as a plain "stopped", or a deliberate flip and a broken read would look identical. Restore afterwards. *Proved 2026-08-22 on a production build of `c1750e4`, broken a third way: the same build was started twice against the same local database, once with the real secret key and once with `SUPABASE_SECRET_KEY=sb_secret_deliberately_wrong_for_ac8`, and the same signed in session loaded `/health` on both. With the real key: "Gated calls are **running**", flag `false`, `updated_at` `2026-08-22T05:24:14.700279+00:00`. With the wrong key: the red `role="alert"` block, "Could not read the kill switch, so gated calls are treated as stopped", "The database refused the kill switch read", `Kind database_unavailable, severity unexpected`. The word "stopped" never appears on its own, and the scaffold row beside it still rendered, so the failure was the switch read and not the page. The same check **on a deployment** is still owed, and belongs to whoever first reads the switch on production.* → **AC-8**
- [x] Confirm production's `app_settings` also holds exactly one row, arriving from the migration and not by hand. *Confirmed 2026-08-23, read directly from production's own SQL editor: `select * from app_settings` returns exactly one row, `id 1`, `kill_switch_enabled false`, a real `updated_at`. `select count(*) from scaffold_check` is `0`, and `select count(*) from auth.users` is `0`, both expected since no sign in path exists on production and the production job carries no seed step.* → **AC-6**

### Guardrails

- [x] Trigger an error on a preview and on production; confirm each event in Sentry carries the right `environment` tag, a `release` matching the deployed commit sha, and a stack trace pointing at real source lines rather than bundled output. → **AC-13**

  **Proved 2026-08-23, and it took a real fix along the way.** Source maps were not uploading at all: `SENTRY_AUTH_TOKEN` existed as a name in Vercel with no value ever set, so every build silently logged `No auth token provided. Will not create release` / `Will not upload source maps`, on both preview and production. Generated a real Sentry organisation auth token (Settings → Developer Settings → Organization Tokens) and set it, with `SENTRY_ORG` and `SENTRY_PROJECT`, on both environments. Redeployed both: the build log then read `Successfully uploaded source maps to Sentry`, `Release: c1750e41257175646dccd77af57da32f81515981` (the full sha of `c1750e4`), on both preview and production. A live production event's stack trace was then opened directly: it resolves to real project paths with inline source, `src/lib/result.ts:149` showing the actual `toError()` body, `src/features/scaffold-check/queries.ts:51` naming the real call site, library frames correctly collapsed behind "Show 5 more frames." Environment tag, release, and real source lines: all three proved on a genuine production event, not just the build log.
- [x] Confirm the Sentry project shows trace sampling behaving as 1.0 in production and 0.1 in preview, and that neither file hardcodes it. *Proved 2026-08-23, both halves on real events rather than inferred from configuration. Production's Trace Details read `Client Sample Rate: 1`, on a genuine production event. A preview event (from the earlier kill switch testing, `Cloud Resource: vercel/iad1` confirming genuine platform telemetry) reads `Client Sample Rate: 0.1`. Neither Sentry config file hardcodes the value: both read `env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`.* → **AC-14**
- [x] Turn on Sentry spend notifications (Settings → Subscription → Manage spend notifications), at 80% of reserved volume, to an address that is read. *Confirmed 2026-08-23: on, at 80%, the default threshold.* → **AC-15**
- [x] Confirm the UptimeRobot monitor on `https://usejobhunt.vercel.app` has a **real check result**, not just a saved setting, and that the result reflects the application rather than a login page. *Confirmed 2026-08-23: status Up, last check minutes old, checked every 5 minutes, 100% over the last 24 hours with 0 incidents, real response time data (103ms average) from a North America region. A real, running check, not an unconfigured monitor.* → **AC-16**
- [ ] Confirm Supabase's pause warning emails for **both** projects go to an address that is actually read. → **AC-16**
- [x] `main` requires a pull request, requires `Lint, type check, build` green, includes administrators, and refuses force pushes and deletion. *Applied 2026-08-22, after the repository was made public; confirmed by reading the protection back from the API.* → **AC-12**
- [x] Attempt a real direct push to `main` and confirm GitHub refuses it. A `--dry-run` push does not prove this: the pack is never sent, so the server side rule never runs. *Proved 2026-08-23: a real push of an empty commit straight to `main` was refused with `GH006: Protected branch update failed`, naming both reasons, "Changes must be made through a pull request" and the required status check. Real server side enforcement, not a settings readback.* → **AC-12**
- [x] Once the Actions secrets are set and P-1 has passed, add `Apply migrations (development)` to the required checks. Requiring it before then would block every pull request on a check that cannot pass. *Done 2026-08-23: both prerequisites confirmed (all six Actions secrets present, P-1 passed twice above), then added via the API. Read back: `contexts` now lists both `Lint, type check, build` and `Apply migrations (development)`.* → **AC-12**
- [x] If the Supabase MCP server is connected: scoped to the **development** project, `read_only=true`, per call confirmation on, and no production project ref configured anywhere. *Checked 2026-08-22: no MCP server is connected at all, globally or for this project, and there is no `.mcp.json` in the repository, so no production project ref is configured anywhere. The condition holds because nothing is connected, which matches root `AGENTS.md`. Recheck the moment one is added.* → **AC-17**
- [x] Break production deliberately, promote the previous deployment, and confirm recovery. Confirm `docs/observability/README.md` says plainly that promoting does not undo a migration. → **AC-18**

  **Proved 2026-08-23 on the live production origin, not simulated.** `/health` could not be used as the fault: it now requires a session (the PR #3 fix), and no sign in path exists on production until feature 7. `/`, the same page the uptime monitor watches, is public and was used instead. A one line PR (`f484d30`, merged as `61566f0`) made the homepage throw unconditionally, forced dynamic (`export const dynamic = "force-dynamic"`) so the throw happens per request rather than failing the build, which would only have proved CI catches bugs, not that the promote path recovers a live one. `pnpm build` first without the dynamic export failed at `Error occurred prerendering page "/"` and never shipped, confirming the forced dynamic export was necessary. **Break confirmed:** `curl -I https://usejobhunt.vercel.app/` returned a genuine `HTTP/2 500` within a minute of the merge. **Promoted** the prior production deployment (`dpl_H126wrYM2xrv5bBDHSfDqBCdbPD9`, the pre drill build) with `vercel promote`. **Recovery confirmed:** `curl` against `https://usejobhunt.vercel.app/` returned `200` with the original scaffold markup, and `vercel inspect https://usejobhunt.vercel.app` read back `id dpl_H126wrYM2xrv5bBDHSfDqBCdbPD9`, confirming the alias itself repointed rather than a stale cache serving old content. Total window between merge and confirmed recovery: under a minute. The throw was reverted immediately after in `5c00b20`. `docs/observability/README.md`'s "Rolling a bad production deployment back" section already states plainly, unchanged by this drill, that promoting does not undo a migration because the database is not part of the deployment.

## Value sourcing

One step per row of spec 0002's Value sourcing table, each exercising the edge that breaks if the source is wrong.

- [ ] **Which environment this is** ← `NEXT_PUBLIC_VERCEL_ENV`. Compare a preview, production, and local: three different answers, and absent locally. If this were sourced from `NODE_ENV` instead, preview and production would be indistinguishable, which is the bug this feature fixed. → **AC-13**

  **Half done on 2026-08-22.** What Vercel injects was compared and differs correctly: the Production scope carries `VERCEL_ENV="production"` and `VERCEL_TARGET_ENV="production"`, the Preview scope `VERCEL_ENV="preview"` and `VERCEL_TARGET_ENV="preview"`, and neither is present locally. What the **application** reads is still unwatched, because no page renders `NEXT_PUBLIC_VERCEL_ENV` and reading a Sentry event's environment tag needs the Sentry project. Close it with the Sentry step under Guardrails.
- [x] **Canonical site URL** ← `NEXT_PUBLIC_SITE_URL`. On a **preview**, confirm it still reads the production origin, not the branch URL. It looking "wrong" on a preview is the correct behaviour. *Confirmed 2026-08-22 from the Preview scope itself, since no page renders this value yet: `vercel env pull --environment=preview` returns `NEXT_PUBLIC_SITE_URL="https://usejobhunt.vercel.app"`, the production origin, identical to the Production scope.*
- [ ] **Current request origin** ← the resolver in `src/lib/origin.ts`. On a preview it returns the branch URL **with** `https://` prepended (Vercel supplies no scheme); in production the canonical URL; locally `http://localhost:3000`. Feature 7's OAuth callback breaks if a preview ever returns the production origin.

  **Cannot be exercised yet, and this is why.** `currentOrigin()` and `canonicalSiteUrl` have **no callers anywhere in `src/`** as of 2026-08-22, so nothing renders or logs either value in any environment. Feature 7 is the first caller, through the OAuth callback, and this step becomes runnable then. Until then the resolver is code that has never run outside a build.
- [ ] **Sentry environment tag** ← `NEXT_PUBLIC_VERCEL_ENV`, defaulting to `development`. Confirm a local error tags as `development`, not `production`.
- [ ] **Sentry release** ← inferred by the SDK from `VERCEL_GIT_COMMIT_SHA`. Confirm the release on a deployed event equals the deployed commit, and that it is set in exactly one place: nothing in this repository sets it.
- [x] **Trace sample rate** ← `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`. Set it to a malformed value locally and confirm the build fails by name rather than silently falling back to 1. *Proved 2026-08-22: `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=nonsense` fails the build with `❌ Invalid environment variables:` naming `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` and `expected number, received NaN`, exit 1. Neither Sentry config file hardcodes the value: `src/instrumentation-client.ts:19` and `src/sentry.server.config.ts:42` both read `env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`.*
- [x] **The user's row** ← `public.scaffold_check` through the request scoped server client under row level security. Two users, two different rows (covered above). *Proved on preview `f637586` on 2026-08-22 as both dev users, and read again on 2026-08-22 through a real session on a production build, which returned dev one's row `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` and its note.* → **AC-5**
- [x] **Kill switch state and when it changed** ← `public.app_settings`, through the secret key client only. Confirm the page renders `updated_at` raw, as stored, rather than a formatted string frozen at write time. *Proved 2026-08-22 on the AC-8 control run: `/health` printed `last changed 2026-08-22T05:24:14.700279+00:00`, the stored value to the microsecond with its offset, not a formatted date.*
- [ ] **What the app assumes on a failed read** ← nothing read from anywhere: a failed read is *defined* as switched on. Confirm `isKillSwitchEngaged()` returns true for every failure kind, not just for a successful read of `true`.

  **Not runnable yet**: `isKillSwitchEngaged()` has no caller in `src/` as of 2026-08-22, so no running code asks it anything. Feature 10's gate is the first caller and is where this belongs. The page side of the same assumption **was** watched: on a failed read `/health` rendered "gated calls are treated as stopped", so the rendering half already fails closed.
- [x] **What the page renders on a failed read** ← the failure's own `message` and `kind`. Covered by the AC-8 step above; the distinction it protects is that a deliberate flip and a broken read must never look the same. *Proved 2026-08-22 in the same pair of runs: the failure block carried the read's own message and `Kind database_unavailable, severity unexpected`, while the deliberate flip proved earlier on preview `f637586` read a plain "stopped" with the flag `true`. The two do not look alike on screen.*
- [x] **Whether password sign in is permitted** ← `DEV_SESSION_ENABLED`, both guards. Set it to a malformed value (`DEV_SESSION_ENABLED=maybe`) and confirm the build fails rather than reading it as false: failing closed by accident is still the wrong reason. *Proved 2026-08-22: `DEV_SESSION_ENABLED=maybe` fails the build with `❌ Invalid environment variables:` naming `DEV_SESSION_ENABLED` and listing the accepted words, exit 1. Both guards were watched separately on a production shaped build of the same commit: the page answered `404` and the action returned "Password sign in is not enabled in this environment."*
- [ ] **The development database connection for the seed step** ← `SUPABASE_DB_URL_DEV`. Unset the secret and confirm the workflow fails with the named error rather than skipping the seed silently.
- [x] **Which project the workflow pushes to** ← the triggering event, through two separate jobs. Confirm a pull request runs **only** the development job and a push to `main` runs **only** the production job. The two jobs exist precisely so an unset production secret can never fall back to the development project. *Proved 2026-08-22 by reading both real runs. Pull request run `32590646242`: development `success`, production `skipped`. Push to `main` run `32592343136`: production `success`, development `skipped`.*

## Acceptance criteria coverage

- **AC-1** deployment steps · **AC-2** preview reads development, no production credentials in preview · **AC-3** private window, both URLs · **AC-4** the three build commands plus the variable matrix · **AC-5** the two user thread on a preview · **AC-6** kill switch displayed, both projects · **AC-7** dashboard flip with no deploy · **AC-8** deliberate break renders a visible failure · **AC-9** P-3 · **AC-10** production 404 plus the direct action POST · **AC-11** P-1, the three workflow runs, and the deliberately failing migration · **AC-12** protection applied, both repository changing checks proved, required check added · **AC-13** DSN build failures plus the deployed event check · **AC-14** sampling from validated configuration · **AC-15** spend notifications · **AC-16** uptime monitor result plus both pause emails · **AC-17** MCP scoping · **AC-18** promote and recover.
