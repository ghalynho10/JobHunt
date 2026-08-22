# Verify: deployment & environments · spec 0002 · updated 2026-08-21

_Steps derived from spec 0002's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Steps already proved during the build are ticked, with what proved them. Everything unticked needs either a dashboard, a hosted database, or a real deployed URL, none of which the build environment can reach.

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
- [x] `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=https://x@o1.ingest.sentry.io/1 NEXT_PUBLIC_VERCEL_ENV=preview pnpm build` → **fails**, naming `SENTRY_DSN`. The server pass demands it separately. *Proved 2026-08-21.* → **AC-4**, **AC-13**
- [x] `pnpm build` with no `NEXT_PUBLIC_VERCEL_ENV` → succeeds with no DSN set, so a fresh clone still runs. *Proved 2026-08-21.* → **AC-13**
- [x] `DEV_SESSION_ENABLED= pnpm build && DEV_SESSION_ENABLED= pnpm start` → `/` is 200, `/sign-in` is **404**, `/health` is 307. *Proved 2026-08-21.* → **AC-10**
- [x] Apply `supabase/seed.sql` three times to a freshly reset local database → counts stay 2, 2, 2. *Proved 2026-08-21.* → **AC-11**
- [ ] Open a pull request and watch **Apply migrations (development)** run green, then confirm the development project holds the two users and both scaffold rows. → **AC-11**
- [ ] Write a migration that cannot apply, push it, and confirm the workflow **fails visibly** rather than reporting success. Remove it afterwards. → **AC-11**
- [ ] Merge to `main` and watch **Apply migrations (production)** run green, then confirm production holds `app_settings` with one row and **no** `scaffold_check` rows and **no** fake users. → **AC-11**
- [ ] `git grep -rn "SKIP_ENV_VALIDATION"` → appears only in `src/env.ts`, `.github/workflows/ci.yml` and documentation, never in a deployed build's configuration. → **AC-4**

## UI and manual

### The deployment itself

- [ ] Merge to `main`, wait for the deploy, load `https://usejobhunt.vercel.app` over HTTPS with no manual step. → **AC-1**
- [ ] Push this branch, open its preview URL in a **private window**: Vercel Authentication asks for a login. → **AC-3**
- [ ] Load `https://usejobhunt.vercel.app` in a **private window**: it serves the page with no login. → **AC-3**
- [ ] In the Vercel project's environment variables, confirm the preview scope carries the **development** project's Supabase URL, publishable key and secret key, and that no production project value appears in any preview scoped variable. → **AC-2**
- [ ] Confirm the variable matrix matches spec 0002's Configuration required table, per environment, and that `SKIP_ENV_VALIDATION` is set in no scope at all. → **AC-4**
- [ ] Confirm both Supabase projects are in `us-east-1` and both have the Data API set **not** to expose new tables automatically. → **AC-2**
- [ ] Confirm the Vercel project has functions in `iad1`, Node 24, production branch `main`, and system environment variables enabled. → **AC-1**

### The feature 1 thread, on a real preview URL

- [ ] Sign in on the preview as `dev-one@example.test` / `devpassword123` → `/health` shows dev one's row. → **AC-5**
- [ ] Sign out, sign in as `dev-two@example.test` → `/health` shows a **different** row. Two users seeing the same note means the policy is not confining anyone. → **AC-5**
- [ ] Load `/health` on the preview with no session → redirected to `/sign-in`, not an empty page. → **AC-5**
- [ ] On **production**, load `/sign-in` → hard 404, because `DEV_SESSION_ENABLED` is absent there. → **AC-10**
- [ ] On **production**, POST to the sign in Server Action directly (browser devtools, or a replayed request) → refused. The page guard alone is not the proof; the action has its own. → **AC-10**

### The kill switch

- [ ] On a preview, `/health` shows the kill switch as **running**, with a `kill_switch_enabled` of `false` and an `updated_at`. → **AC-6**

  **Not yet proved, and briefly recorded as proved in error on 2026-08-22.** The page it was proved against was `localhost:3000`, not a preview: the displayed `updated_at` and `created_at` matched the local database to the microsecond, and all three preview builds had in fact failed. Recorded here rather than quietly deleted, because a verification that checked the wrong environment is exactly the failure shape this project is written against, and the tell was in the data on screen the whole time. **When checking a deployed page, confirm the host in the address bar before reading anything off it.**

- [x] **Regression the local run caught** (found while looking at what was believed to be a preview; it would have hit a preview identically). The scaffold read on the same page failed with `response_malformed` while the kill switch beside it succeeded. Cause: making the seed idempotent replaced `gen_random_uuid()` with hand written ids of the form `aaaaaaaa-aaaa-aaaa-…`, which Postgres accepts into a `uuid` column but Zod 4's `z.uuid()` rejects, because it checks the RFC version and variant nibbles. Fixed by using real version 4 identifiers (`aaaaaaaa-aaaa-4aaa-8aaa-…`), with a self healing delete so a shared project that already holds the bad rows repairs itself on the next seed run. **Any identifier invented by hand for this project has to survive `z.uuid()`, not just `::uuid`.** The `auth.users` fixture ids have the same defect, harmlessly for now, and are flagged in `supabase/seed.sql` for feature 8.
- [ ] In the Supabase dashboard, set `kill_switch_enabled` to `true` on the development project. Reload `/health` **without deploying**: it now reads **stopped**, and `updated_at` has moved (the trigger, not a hand edit). Set it back to `false`. → **AC-7**
- [ ] Break the read deliberately (rename the table, or revoke the grant) and reload `/health`: it renders the red failure block saying the value could not be read, showing its kind and severity. It must **not** render as a plain "stopped", or a deliberate flip and a broken read would look identical. Restore afterwards. → **AC-8**
- [ ] Confirm production's `app_settings` also holds exactly one row, arriving from the migration and not by hand. → **AC-6**

### Guardrails

- [ ] Trigger an error on a preview and on production; confirm each event in Sentry carries the right `environment` tag, a `release` matching the deployed commit sha, and a stack trace pointing at real source lines rather than bundled output. → **AC-13**
- [ ] Confirm the Sentry project shows trace sampling behaving as 1.0 in production and 0.1 in preview, and that neither file hardcodes it. → **AC-14**
- [ ] Turn on Sentry spend notifications (Settings → Subscription → Manage spend notifications), at 80% of reserved volume, to an address that is read. → **AC-15**
- [ ] Confirm the UptimeRobot monitor on `https://usejobhunt.vercel.app` has a **real check result**, not just a saved setting, and that the result reflects the application rather than a login page. → **AC-16**
- [ ] Confirm Supabase's pause warning emails for **both** projects go to an address that is actually read. → **AC-16**
- [x] `main` requires a pull request, requires `Lint, type check, build` green, includes administrators, and refuses force pushes and deletion. *Applied 2026-08-22, after the repository was made public; confirmed by reading the protection back from the API.* → **AC-12**
- [ ] Attempt a real direct push to `main` and confirm GitHub refuses it. A `--dry-run` push does not prove this: the pack is never sent, so the server side rule never runs. → **AC-12**
- [ ] Once the Actions secrets are set and P-1 has passed, add `Apply migrations (development)` to the required checks. Requiring it before then would block every pull request on a check that cannot pass. → **AC-12**
- [ ] If the Supabase MCP server is connected: scoped to the **development** project, `read_only=true`, per call confirmation on, and no production project ref configured anywhere. → **AC-17**
- [ ] Break production deliberately, promote the previous deployment, and confirm recovery. Confirm `docs/observability/README.md` says plainly that promoting does not undo a migration. → **AC-18**

## Value sourcing

One step per row of spec 0002's Value sourcing table, each exercising the edge that breaks if the source is wrong.

- [ ] **Which environment this is** ← `NEXT_PUBLIC_VERCEL_ENV`. Compare a preview, production, and local: three different answers, and absent locally. If this were sourced from `NODE_ENV` instead, preview and production would be indistinguishable, which is the bug this feature fixed. → **AC-13**
- [ ] **Canonical site URL** ← `NEXT_PUBLIC_SITE_URL`. On a **preview**, confirm it still reads the production origin, not the branch URL. It looking "wrong" on a preview is the correct behaviour.
- [ ] **Current request origin** ← the resolver in `src/lib/origin.ts`. On a preview it returns the branch URL **with** `https://` prepended (Vercel supplies no scheme); in production the canonical URL; locally `http://localhost:3000`. Feature 7's OAuth callback breaks if a preview ever returns the production origin.
- [ ] **Sentry environment tag** ← `NEXT_PUBLIC_VERCEL_ENV`, defaulting to `development`. Confirm a local error tags as `development`, not `production`.
- [ ] **Sentry release** ← inferred by the SDK from `VERCEL_GIT_COMMIT_SHA`. Confirm the release on a deployed event equals the deployed commit, and that it is set in exactly one place: nothing in this repository sets it.
- [ ] **Trace sample rate** ← `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`. Set it to a malformed value locally and confirm the build fails by name rather than silently falling back to 1.
- [ ] **The user's row** ← `public.scaffold_check` through the request scoped server client under row level security. Two users, two different rows (covered above). → **AC-5**
- [ ] **Kill switch state and when it changed** ← `public.app_settings`, through the secret key client only. Confirm the page renders `updated_at` raw, as stored, rather than a formatted string frozen at write time.
- [ ] **What the app assumes on a failed read** ← nothing read from anywhere: a failed read is *defined* as switched on. Confirm `isKillSwitchEngaged()` returns true for every failure kind, not just for a successful read of `true`.
- [ ] **What the page renders on a failed read** ← the failure's own `message` and `kind`. Covered by the AC-8 step above; the distinction it protects is that a deliberate flip and a broken read must never look the same.
- [ ] **Whether password sign in is permitted** ← `DEV_SESSION_ENABLED`, both guards. Set it to a malformed value (`DEV_SESSION_ENABLED=maybe`) and confirm the build fails rather than reading it as false: failing closed by accident is still the wrong reason.
- [ ] **The development database connection for the seed step** ← `SUPABASE_DB_URL_DEV`. Unset the secret and confirm the workflow fails with the named error rather than skipping the seed silently.
- [ ] **Which project the workflow pushes to** ← the triggering event, through two separate jobs. Confirm a pull request runs **only** the development job and a push to `main` runs **only** the production job. The two jobs exist precisely so an unset production secret can never fall back to the development project.

## Acceptance criteria coverage

- **AC-1** deployment steps · **AC-2** preview reads development, no production credentials in preview · **AC-3** private window, both URLs · **AC-4** the three build commands plus the variable matrix · **AC-5** the two user thread on a preview · **AC-6** kill switch displayed, both projects · **AC-7** dashboard flip with no deploy · **AC-8** deliberate break renders a visible failure · **AC-9** P-3 · **AC-10** production 404 plus the direct action POST · **AC-11** P-1, the three workflow runs, and the deliberately failing migration · **AC-12** blocked, see spec 0002's first follow-up box · **AC-13** DSN build failures plus the deployed event check · **AC-14** sampling from validated configuration · **AC-15** spend notifications · **AC-16** uptime monitor result plus both pause emails · **AC-17** MCP scoping · **AC-18** promote and recover.
