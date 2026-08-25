# Verify: data model · spec 0003 · updated 2026-08-25

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## What has been proved, and where

**Development, 2026-08-25, on pull request [#9](https://github.com/ghalynho10/JobHunt/pull/9). Everything below passed except the two criteria that belong to the second pull request.**

- The whole **Commands** section ran as [verify.sql](verify.sql) against the **hosted development project**, one result set, zero failures. It had already passed identically against the local database.
- The three **UI / manual** sign in steps were driven on the real preview deployment: dev-one and dev-two each saw only their own profile, and dev-three, who has no profile row on purpose, saw the named `record_not_found` failure rather than an empty page.

`verify.sql` is safe to re run at any time. It does not depend on a rollback: every
successful write happens under a throwaway user that the last cascade test deletes, and
every refused write undoes itself. The final `clean` lines confirm the fixtures are
untouched.

**Production, 2026-08-25. AC-16 and AC-13 closed, in that order and on purpose.**

- Pull request #9 merged, its production migration run succeeded, and the production deployment built from that merge went live on `usejobhunt.vercel.app`. [verify-production.sql](verify-production.sql) confirmed the six tables, forced row level security, the twenty three policies and the privilege gate on the production database. That is **AC-16**, and only then was the drop written.
- Pull request [#10](https://github.com/ghalynho10/JobHunt/pull/10) dropped `scaffold_check`, merged as `3a56243`, its production migration run succeeded, and `verify-production.sql` then reported `scaffold_check on this database: gone`. Local and development report the same. That is **AC-13**.

All sixteen acceptance criteria are proved. Re run [verify-production.sql](verify-production.sql)
against any environment at any time: it is read only and safe on production.

Two acceptance criteria are deliberately **not** reachable in this pull request. AC-13 and
AC-16 are the drop of `scaffold_check`, and the drop belongs in a second pull request that
may only be written after production is confirmed serving `readOwnProfile()`. Anyone
closing them from a green preview has misread the gate.

## Commands

Run against the target database. Locally: `docker exec -i supabase_db_jobhunt psql -U postgres -d postgres`.

- [ ] All six tables exist in `public` with the specced columns, types and nullability → `select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' and table_name in ('profile','profile_skill','work_experience','job_preference','application','application_answer') order by 1,2;` matches the spec's data model sketch → AC-1
- [ ] Row level security is enabled **and forced** on all six → `select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public';` every one is `t/t` → AC-2
- [ ] Twenty three policies, four per table and three on `profile_skill` → `select tablename, count(*) from pg_policies where schemaname='public' group by 1;` → AC-2
- [ ] Each policy carries the clause its action permits: `select`/`delete` have `using` only, `insert` has `with check` only, `update` has both → `select tablename, cmd, qual is not null as has_using, with_check is not null as has_with_check from pg_policies where schemaname='public' order by 1,2;` → AC-4
- [ ] `authenticated` holds exactly the specced privileges and `anon` and `service_role` hold **nothing** on all six → `has_table_privilege` sweep over the three roles and six tables → AC-2
- [ ] A query as `anon` is refused with a hard permission denial, not an empty result → `set local role anon; select 1 from public.profile;` raises `42501 permission denied for table profile` → AC-2
- [ ] The constraint sweep below is refused at every line → AC-4, AC-7, AC-8, AC-9, AC-10, AC-11
- [ ] `updated_at` is the trigger's, not the caller's → `update public.profile set full_name='x', updated_at='2000-01-01' where id=<a user>;` then read it back: it holds the transaction time, not the year 2000 → AC-12
- [ ] Deleting the auth user empties all six for that user → seed a row in each of the six, `delete from auth.users where id=<user>`, then count across all six: zero → AC-5
- [ ] A user deleting their own `profile` empties the same subtree while the auth account remains → as that user `delete from public.profile where id=<self>`, count across the six is zero and `auth.users` still holds them → AC-6
- [ ] `pnpm db:types` output matches the applied schema and the tree typechecks → `pnpm db:types && pnpm typecheck` clean, no diff left in `src/lib/supabase/database.types.ts` → AC-15
- [ ] `scaffold_check` is gone from local, development and production, nothing references it in code, its seed rows are gone and its span line is off the registry → `select to_regclass('public.scaffold_check');` is null in all three, and `grep -r scaffold_check` finds nothing → AC-13 · **second pull request only**

### The constraint sweep

Each statement must be **refused**. Run as the owning user unless the line says otherwise.

```sql
-- AC-4, the with check clause, as dev-one
insert into public.work_experience (profile_id, company, title, started_on)
  values ('<dev-two>', 'Sneaky Co', 'Engineer', '2024-01-01');            -- 42501
update public.work_experience set profile_id = '<dev-two>' where id = '<own row>'; -- 42501

-- AC-7, the same listing applied to twice
insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url)
  values ('<dev-one>', 'adzuna', 'job-1', 'Engineer', 'Test Co', 'https://example.test/job-1'); -- 23505 on the second

-- AC-8, run as the OWNER so row level security is bypassed and the foreign key
-- is the only thing left to refuse it. As `authenticated` the insert policy
-- denies it first and the test passes without exercising the foreign key.
insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url)
  values ('<a profile that does not exist>', 'adzuna', 'job-2', 'E', 'C', 'https://example.test/2'); -- 23503
insert into public.application_answer (application_id, profile_id, question_key, answer)
  values ('<dev-one application>', '<dev-two>', 'why', 'Not mine.');      -- 23503, the composite key

-- AC-9, pay is raw, paired and ordered, in BOTH tables
... salary_min 50000 with no salary_currency                              -- 23514
... salary_currency 'EUR' with no figure at all                           -- 23514
... salary_min 90000 with salary_max 50000                                -- 23514
... salary_currency 'eur' lowercase                                       -- 23514
... job_preference minimum_pay 40000 with no minimum_pay_currency         -- 23514
... job_preference remote_preference 'from_the_moon'                      -- 23514

-- AC-10, a skill is unique per profile ignoring case
insert into public.profile_skill (profile_id, name) values ('<dev-one>', 'React');  -- accepted
insert into public.profile_skill (profile_id, name) values ('<dev-one>', 'react');  -- 23505
insert into public.profile_skill (profile_id, name) values ('<dev-two>', 'react');  -- accepted, different profile

-- AC-11, work history dates
... started_on '2024-01-15', a day other than the first                   -- 23514
... ended_on '2024-06-15', a day other than the first                     -- 23514
... started_on '2024-06-01' with ended_on '2024-01-01'                    -- 23514
... started_on '2025-03-01' with no ended_on, meaning current             -- accepted
```

One trap worth naming, because a test can pass for the wrong reason here. An **update
aimed at another user's existing row** is not refused, it changes **zero rows**: the
`using` clause hides the row and no error is raised. That is correct and safe, and it is
not what AC-4 claims. AC-4 is about **placing a row under another user's profile**, which
is the `with check` clause, and that one does raise `42501`. Assert the row count and the
victim row's contents, never just the absence of an exception.

## UI / manual

Run on a real preview deployment, which reads the hosted development project. A local run
proves the code; only the preview proves the deployment.

- [ ] Sign in as `dev-one@example.test` → `/health` shows that user's own profile (name, location, summary) and their auth user id → AC-3, AC-14
- [ ] Sign in as `dev-two@example.test` → `/health` shows a **different** profile, and never dev-one's line → AC-3, AC-14
- [ ] Sign in as `dev-three@example.test`, who has no profile row on purpose → `/health` shows a named failure, kind `record_not_found`, severity `expected`, in a `role="alert"` block, and never an empty page → AC-14
- [ ] The failure block above is reachable by keyboard and announced: it carries `role="alert"` and readable text, not colour alone → AC-14
- [ ] Production is serving `readOwnProfile()` and its migration run succeeded, confirmed on the production URL and in the migration workflow, **before** the drop migration is written → AC-16

## Value sourcing

One per row of the spec's Value sourcing table, so a value that is sourced from the wrong
place is caught even when the shape is right.

- [ ] `profile.id` comes from `auth.uid()` and never a supplied value → as dev-one, `insert into public.profile (id, full_name) values ('<dev-two>', 'X')` is refused `42501` → AC-4
- [ ] `full_name`, `location`, `summary` on a real write come from feature 9's form, parsed by Zod first, with the Zod rules mirroring the check constraints → **feature 9 owns this**; today assert only that the database refuses what Zod would: a blank or whitespace `full_name`, and a `full_name` over 200 characters, are both `23514` → AC-1
- [ ] The seed fixture's profile values are literal strings in `supabase/seed.sql`, obviously fake, and subject to the same checks a real write is → `pnpm db:reset` succeeds with the fixture in place, and no fixture value is a real personal identifier → AC-3
- [ ] `created_at` and `updated_at` come from the database default and the shared trigger, never from a caller → insert with no timestamps supplied and both are populated; see also the AC-12 command above → AC-12
- [ ] The profile the health page shows is selected **by policy**, not by an application filter → confirm `src/features/profile/queries.ts` carries no `eq` on the caller's id, then re run the two user isolation steps above. If a filter is ever added, AC-3 stops proving anything → AC-3, AC-14
- [ ] The "no profile yet" state comes from `record_not_found`, returned when the select matches no row → the dev-three step above → AC-14
- [ ] An application's `profile_id` comes from `auth.uid()` → covered by the AC-4 sweep → AC-4
- [ ] An application's `source` is the constant `adzuna`, set server side and never by the browser → any other value is refused `23514`; **feature 11 owns setting it** → AC-1
- [ ] The listing snapshot fields come from the listing object feature 11 parsed → **feature 11 and 12 own this**; today assert only that all of `source_job_id`, `job_title`, `company_name`, `job_location`, `job_url`, `job_description`, `posted_at`, `salary_min`, `salary_max`, `salary_currency` exist and accept a full listing → AC-1
- [ ] `applied_at` comes from the database default, and is distinct from `created_at` → insert with neither supplied, both populate, and the column pair is genuinely two columns → AC-1
- [ ] The duplicate refusal comes from the unique constraint, not from a caller side check → the AC-7 line above, run with no prior select → AC-7
- [ ] `question_key` comes from feature 20's preset set → **feature 20 owns the check constraint**; today the column only refuses blank → AC-1
- [ ] An answer's `profile_id` is the parent application's, and any other value is refused by the composite foreign key → the second AC-8 line above → AC-8
- [ ] Scoring reads `profile_skill.name` rows for the caller → **feature 14 owns this**; today assert a user sees only their own skills → AC-3
- [ ] The privacy notice's list of stored personal fields matches the spec's data model sketch → **feature 21 owns this**; today assert the sketch and the applied schema agree, which is the AC-1 command above → AC-1

## Acceptance-criteria coverage

- AC-1 · covered by the columns command, plus the per feature value sourcing rows that assert a column exists and accepts
- AC-2 · covered by the RLS enabled and forced command, the policy count, the privilege sweep and the `anon` denial
- AC-3 · covered by the two user isolation steps on a preview, and the seed fixture row
- AC-4 · covered by the policy clause command and the `with check` lines of the sweep, with the zero rows trap named
- AC-5 · covered by the auth user cascade command
- AC-6 · covered by the own profile delete command
- AC-7 · covered by the duplicate application line
- AC-8 · covered by the two foreign key lines, the second run as the owner
- AC-9 · covered by the six pay lines across both tables
- AC-10 · covered by the three skill lines
- AC-11 · covered by the four date lines
- AC-12 · covered by the `updated_at` trigger command
- AC-13 · **not reachable in this pull request**, it is the drop; second pull request only
- AC-14 · covered by the three sign in steps, including the missing profile failure and its announcement
- AC-15 · covered by the `db:types` and typecheck command, and the parse is exercised by every successful sign in step
- AC-16 · covered by the production confirmation step, which is the gate the drop may not be written before
