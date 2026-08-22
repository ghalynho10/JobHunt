# Experiments: deployment and environments · spec 0002

Run 2026-08-21 and 2026-08-22, during `/develop deployment & environments`.

Environments referred to below:

- **local**: Supabase in Docker, `127.0.0.1:54321`, `postgres` is a superuser there
- **development**: the hosted Supabase development project, reached through its dashboard query editor
- **production**: the hosted Supabase production project, untouched by everything here
- **preview**: Vercel preview deployments of `feat/deployment-and-environments`

---

## 1. Does a deployed build with no Sentry DSN fail, or ship silently?

**Why it matters.** AC-13 exists because a build that succeeds with reporting switched off looks exactly like a healthy build. The rule had to be proved to fire, on both the client and the server pass, because env core builds the two shapes separately.

```bash
SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN= NEXT_PUBLIC_VERCEL_ENV=preview pnpm build
SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=https://x@o1.ingest.sentry.io/1 NEXT_PUBLIC_VERCEL_ENV=preview pnpm build
pnpm build
```

**Result.** The first fails naming `NEXT_PUBLIC_SENTRY_DSN`, the second fails naming `SENTRY_DSN`, the third succeeds with neither set. So the rule fires per pass and stays out of the way locally.

**Then it fired for real, unprompted.** The first preview deployment of this branch failed with `NEXT_PUBLIC_SENTRY_DSN is required on a deployed build`. That variable had never been set in the Vercel project, while `SENTRY_DSN` had. The gap had existed the whole time and nothing before this would have reported it: the previous build succeeded and would have shipped with browser error reporting off.

**Conclusion.** AC-4 and AC-13 hold, and the criterion earned its place on its first real outing rather than in a simulation.

---

## 2. Is the dev sign in guard actually closed when the flag is absent?

**Why it matters.** AC-10 requires the guard to stop depending on how a build labels `NODE_ENV`. A preview is a production build by that label, which is why the old guard made the thread unprovable on the one environment it had to be proved on.

```bash
DEV_SESSION_ENABLED= pnpm build && DEV_SESSION_ENABLED= pnpm start --port 3112
```

**Result.** `/` is 200, `/sign-in` is **404**, `/health` is 307.

**What this probe taught beyond its answer.** A first attempt restarted the server without rebuilding and got 200. `/sign-in` is statically prerendered, so its guard is settled at build time for each environment, while the Server Action's guard runs per request. Both are closed on production; only the action reacts to a variable changed after a deploy. Proving the page half means rebuilding, not restarting.

**Not yet proved on production**, and there is a trap there: production already returns 404 for `/sign-in` and did so before this feature existed, from the old `NODE_ENV` guard. Two mechanisms, one answer. The check means nothing until this branch is merged and the running commit is confirmed.

---

## 3. Does `app_settings` deny a user token, or return an empty result?

**Why it matters.** Invariant 3 defines a failed read as "switched on". A denial and an empty result would be read as opposite things by the application, so the difference is the whole security model, not a detail.

Local, by role:

```sql
set role authenticated; select * from public.app_settings;
set role anon;          select * from public.app_settings;
```

Local, through the Data API, which is the path the application actually uses:

```bash
curl "$LOCAL/rest/v1/app_settings?id=eq.1&select=kill_switch_enabled,updated_at" \
  -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET"     # the intended reader
curl "$LOCAL/rest/v1/app_settings?id=eq.1&select=kill_switch_enabled,updated_at" \
  -H "apikey: $PUBLISHABLE" -H "Authorization: Bearer $PUBLISHABLE"
```

**Result.** Both roles get `42501 permission denied for table app_settings`. The secret key returns the row. The publishable key gets the same `42501`, never an empty array.

**Repeated on development** (this is AC-9's real proof, the local run only being a rehearsal): the same `42501`, including the hint helpfully suggesting the exact grant that must never be made.

---

## 4. Does the Data API setting withhold privileges from `service_role` as well?

**Why it matters, and this is the most valuable result here.** Spec 0002 wrote `grant select on public.app_settings to service_role` defensively, while recording that the evidence leaned the other way: the installed `supabase` skill describes the "do not expose new tables" setting as affecting `anon` and `authenticated` only. If that description were right, the grant would be harmless clutter. If wrong, its absence would refuse the kill switch read, and invariant 3 would render that as a switch stuck permanently on.

The first query asked cannot answer this:

```sql
select has_table_privilege('service_role', 'public.app_settings', 'select');   -- true
```

It returns true on both local and development, but the migration grants that privilege explicitly, so the answer says nothing about the default. The isolating table is `scaffold_check`, granted to `authenticated` only and never to `service_role`:

```sql
select has_table_privilege('service_role', 'public.scaffold_check', 'select');
```

**Result: `false`, on both local and development.**

**Conclusion.** The setting withholds privileges from `service_role` too. The skill's description is wrong, or at least incomplete, for a project configured this way. The defensive grant was necessary: without it the deployed kill switch would have read as permanently engaged, with the visible failure block rendering exactly as designed and nothing pointing at a missing grant. Invariant 6 is load bearing, and every table feature 4 creates needs its own grant to the role that actually reads it.

---

## 5. Does the hosted `postgres` role bypass row level security for the seed?

**Why it matters.** `scaffold_check` forces row level security and has no insert policy. A table owner under forced row level security does not bypass policies unless its role carries superuser or `BYPASSRLS`. Local `postgres` is a superuser, so the question cannot be asked locally at all.

Ran the whole of `supabase/seed.sql` against development, twice, then:

```sql
select (select count(*) from auth.users)            as users,
       (select count(*) from auth.identities)       as identities,
       (select count(*) from public.scaffold_check) as scaffold_rows;
```

**Result.** Both runs succeeded, counts stayed at 2, 2, 2.

**Conclusion.** The hosted `postgres` role does bypass row level security for that insert, so the risk this probe existed to catch did not materialise. The `app_settings` migration's deliberate insert **before** `force row level security` is therefore belt and braces rather than the load bearing ordering it was written as. It stays: it costs nothing, and the next hosted project is not guaranteed to answer the same way.

---

## 6. Is the seed genuinely idempotent?

```bash
pnpm db:reset
docker exec -i supabase_db_jobhunt psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seed.sql   # twice more
```

**Result.** Three applications, counts stay 2, 2, 2.

**Caveat found later.** Idempotent is not the same as correct. See below.

---

## 7. Why did a deployed page render `response_malformed`?

**The symptom.** On `/health`, the kill switch block rendered correctly while the scaffold block beside it failed with `response_malformed`. Same page, same request, two different clients.

**The cause, and it was introduced by this build.** Making the seed idempotent replaced `gen_random_uuid()` with fixed identifiers, so `on conflict` had something to infer on. The identifiers chosen were `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa` and `bbbbbbbb-…`, which Postgres accepts into a `uuid` column without complaint.

```js
z.uuid().safeParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")        // false
z.guid().safeParse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")        // true
z.uuid().safeParse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")        // true
z.uuid().safeParse("11111111-1111-1111-1111-111111111111")        // false
```

Zod 4's `z.uuid()` validates the RFC version and variant nibbles. `a` is not a version between 1 and 8. `z.guid()` is the lenient form.

**Conclusion.** The schema was right and the fixture was not a UUID. Fixed to real version 4 identifiers, with a self healing delete in the seed so a shared project already holding the bad rows repairs itself on the next run. **Any identifier invented by hand for this project has to survive `z.uuid()`, not just `::uuid`.** The `auth.users` fixture ids carry the same defect, harmlessly for now since nothing parses a user id, and are flagged in `supabase/seed.sql` for feature 8.

**Why it was not caught before deploying.** After changing the identifiers, the page that parses them was never rendered again. The kill switch path was checked by hand and the scaffold path was assumed untouched. The verification that would have caught it took one command and was skipped because nothing looked like it had changed.

---

## 8. Which environment is that page actually showing?

**The failure.** A screen showing the kill switch working was recorded as proving AC-6 on a preview. It was `localhost:3000`.

**The tell, which was on screen the whole time.** Two independent timestamps matched the local database to the microsecond:

```
on screen   2026-08-22T05:24:14.717098+00:00   2026-08-22T05:24:14.700279+00:00
local db    2026-08-22 05:24:14.717098+00      2026-08-22 05:24:14.700279+00
```

Two separate databases do not agree to the microsecond. A `pnpm db:reset` had run at 05:24 while fixing the seed.

**Corroboration.** Every preview build up to that point had in fact failed:

```bash
gh api repos/ghalynho10/JobHunt/deployments --jq '.[] | "\(.environment) \(.ref)"'
gh api repos/ghalynho10/JobHunt/deployments/$ID/statuses --jq '.[] | "\(.state) \(.environment_url)"'
```

**Conclusion, and the reason this file exists.** A verification pointed at the wrong environment returns a perfectly real result about the wrong thing, and it reads as success. Confirm the host before reading anything off a deployed page, and prefer a value that **differs between environments** as the proof. When AC-6 was later ticked for real, it rested on three independent checks rather than on the page looking right: the deployment record read `Preview / success`, the displayed timestamp differed from local, and the sign in worked, which only happens where `DEV_SESSION_ENABLED` is set.

**A second version of the same trap.** A build log pasted as evidence of a failure was from a successful build of the old commit, reached by redeploying an older deployment. And a preview URL that returned 404 belonged to a deployment that had never built. Deployment URLs are not interchangeable; take them from the record of a successful build.

---

## 9. Is preview protection really on, and is production really public?

**Why it matters.** The entire environment split rests on this, and the two halves can break each other: raising protection to cover all deployments would take production private and break AC-1, AC-3 and the uptime monitor in one move.

```bash
curl -sI https://jobhunt-<preview>.vercel.app/    # no cookies at all
curl -sI https://usejobhunt.vercel.app/
```

**Result.**

```
preview      302 → location: https://vercel.com/sso-api?url=…&nonce=…
production   200
```

Stricter than a private window, since curl carries no session of any kind. Incidental find: preview responses already carry `x-robots-tag: noindex`, which feature 6 needs.

---

## 10. Does the kill switch flip a live deployment with no build?

**Result.** Set `kill_switch_enabled` to `true` in the development project's dashboard and reloaded the preview. The page read **stopped**, and `updated_at` moved from `04:35:57.426521` to `06:42:59.952915` with nobody setting that column, which is the trigger firing. No deploy, no build, no code change. Set back to `false` afterwards, confirmed 2026-08-22.

---

## 11. Does each environment point at its own Supabase project?

Run once the Vercel CLI was installed and the project linked, which made this checkable directly instead of by asking.

```bash
vercel env ls production ; vercel env ls preview
vercel env pull "$TMP/preview.env" --environment=preview --yes
```

**Result.** The variable matrix matches spec 0002's Configuration required table, including the one that matters most: `DEV_SESSION_ENABLED` is present on Preview and **absent** from Production. Preview points at `serbuc…`, production at `fvaae…`. Two distinct projects.

**A false alarm worth recording, because the method produced it rather than the system.** Fingerprinting `SUPABASE_SECRET_KEY` from both pulls gave an identical hash, which was read as preview holding production credentials, a direct AC-2 violation. It was not. That variable is marked **Sensitive** in Vercel, which makes it write only: `vercel env pull` returns the literal string `[SENSITIVE]`, eleven characters, for every sensitive variable. The same placeholder hashed twice is the same hash.

The tell that something was wrong with the reading, before the shape was checked: the key failed to authenticate against **both** projects, while the kill switch had demonstrably read the development database from a preview an hour earlier. A result that contradicts a working system is usually a broken measurement.

**What follows for verification.** Production's secret key cannot be checked by inspection at all. A key from the wrong project fails as `401 Invalid API key`, which the kill switch reports as `database_unavailable`, which invariant 3 renders as switched on. So it is provable only by behaviour, on the first production deploy, by confirming `/health` reads **running**.

---

## 12. Why was CI red on `main` before any of this?

Found while checking whether the CI job was safe to make a required check.

```
src/app/(app)/layout.tsx(14,55): error TS2304: Cannot find name 'LayoutProps'.
```

Reproduced locally by moving `.next` aside. `LayoutProps` is generated into `.next/types/routes.d.ts`; locally it exists because you have built, and in CI `pnpm typecheck` runs before `pnpm build`. Fixed with Next.js 16's own command for this, `next typegen && tsc --noEmit`, verified from a tree with no `.next` at all.

Outside spec 0002's build plan, and fixed anyway: AC-12 asks for a green CI check, and without this there was no such thing.

---

## 13. Can `main` actually be protected?

```bash
gh api repos/ghalynho10/JobHunt/rulesets
gh api repos/ghalynho10/JobHunt/branches/main/protection
```

**Result.** Both returned `403 upgrade to GitHub Pro or make this repository public`. The repository was private on the free plan, so AC-12 was unreachable as written.

**Resolved** by scanning the full history for secrets first (no `.env` file was ever committed, and every `sb_secret_` match was the literal placeholder in documentation), then making the repository public, then applying protection: pull request required, `Lint, type check, build` required, administrators included, force pushes and deletion refused.

**One check deliberately not required yet.** `Apply migrations (development)` is left out until the Actions secrets are set and the seed's write path is proved, because a required check that cannot pass blocks every pull request, which is a worse failure than the one it guards.

**Note on testing it.** `git push --dry-run` is not a test of branch protection. The pack is never sent, so the server side rule never runs, and the dry run happily reports the push would succeed.
