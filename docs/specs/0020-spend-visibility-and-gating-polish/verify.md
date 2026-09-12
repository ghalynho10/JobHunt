# Verify: spend visibility and gating polish · spec 0020 · updated 2026-09-11
_Steps derived from spec 0020 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Sign in, visit `/search` with no query string → the line `Searches used this week: N of 25.` renders above the search form, before any search has been run → AC-1
- [ ] From that page, run a search → the same line still renders, now above the results, and `N` has gone up by exactly one → AC-1, AC-2
- [ ] Reload `/search` twice without searching → `N` does not move, and no Adzuna call is spent → AC-3
- [ ] Sign in as a second, freshly created account and visit `/search` → it shows `0 of 25`, not the first account's number → AC-7
- [ ] With the app running, `update public.usage_cap set cap_value = 40 where call_type = 'job_search' and scope = 'account' and period = 'week';` then reload `/search` → the line reads `of 40` with no deploy and no restart. Put the value back afterwards → AC-5
- [ ] Break the read (stop the database, or `alter function public.get_job_search_usage_summary() rename to _tmp;`) and reload `/search` → the page shows `We couldn't load your search count just now. You can still search.` with `role="alert"`, the search form still renders underneath, and no number and no zero is shown → AC-6
- [ ] Delete one of `job_search`'s three `usage_cap` rows and reload `/search` → the failure notice renders rather than a number, matching the gate's own all or nothing rule. Restore the row → AC-6
- [ ] Tab through `/search` with the keyboard → the ordinary usage line is not announced as an alert and is not a focus stop; the failure notice is announced → AC-6
- [ ] Read `/privacy` → the `usage_cap` entry and the `usage_gate_counter.call_type` entry both name the AI scoring and checking calls, not job search alone → AC-10

## Commands

- [ ] `pnpm vitest run --project integration-serial test/integration-serial/usage-summary.test.ts` → 9 passed (AC-1 through AC-8) → AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8
- [ ] `pnpm vitest run --project integration test/integration/usage-cap-arithmetic.test.ts` → 7 passed; a failure here means an operator changed a cap or `RESULTS_PER_PAGE` moved, and the decision to show `job_search` alone needs a fresh look rather than the assertion being adjusted → AC-9
- [ ] `pnpm vitest run --project unit "src/app/(app)/search/page.test.ts"` → 69 passed, including the six under "the weekly usage line (spec 0020)" → AC-1, AC-2, AC-5, AC-6
- [ ] `docker exec supabase_db_jobhunt psql -U postgres -d postgres -c "select proacl from pg_proc where proname='get_job_search_usage_summary';"` → `{postgres=X/postgres,authenticated=X/postgres}`, no `anon` → AC-7
- [ ] `docker exec supabase_db_jobhunt psql -U postgres -d postgres -c "select grantee, privilege_type from information_schema.role_table_grants where table_name='usage_gate_counter' and grantee in ('anon','authenticated','service_role');"` → no rows → AC-8
- [ ] `grep -c "insert\|update\|delete" supabase/migrations/20260911120000_job_search_usage_summary.sql` counted against the file: the function body contains no write statement of any kind → AC-3

## Value sourcing

One step per row of spec 0020's Value sourcing table, each exercising the source rather than the rendered result.

- [ ] Seed a counter row with `attempt_count` and `consumed_count` deliberately far apart (for example 19 and 4), reload `/search` → the line shows 4. `attempt_count` counts refused attempts that spent no budget, so showing it would overstate the spend → AC-2
- [ ] Compare the `period_start` the page reports against the one `check_usage_gate` actually wrote to `usage_gate_counter` for the same caller → identical. This is the row that breaks at a week boundary if the two expressions ever drift → AC-4
- [ ] `select pg_get_functiondef(oid) from pg_proc where proname in ('check_usage_gate','get_job_search_usage_summary');` → both bodies contain the same `pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'utc')::date` text, character for character → AC-4
- [ ] Call the RPC as one account while a second account holds a different count → each gets its own, proving the account comes from `auth.uid()` inside the function and not from anything the caller supplies → AC-7
- [ ] Call `getJobSearchUsageSummary()` with an empty cookie jar → `session_missing`, refused by the `getClaims()` check before the RPC → AC-7
- [ ] Confirm the notice is rendered above the `hasQuery` conditional in `src/app/(app)/search/page.tsx`, not inside either branch → a placement below it would show the line for the first time only after the search that spent one → AC-1

## Acceptance-criteria coverage

- AC-1 covered by the bare visit, the with results visit, and the placement check
- AC-2 covered by the seeded divergence step and its integration counterpart
- AC-3 covered by the reload step, the no row created integration test, and the no write statement check
- AC-4 covered by the written `period_start` comparison and the byte identical expression check
- AC-5 covered by the live cap change step
- AC-6 covered by the broken read step, the unconfigured cap step, and the keyboard step
- AC-7 covered by the second account step, the grant check, and the no session step
- AC-8 covered by the `usage_gate_counter` grant check and the direct select refusal test
- AC-9 covered by `test/integration/usage-cap-arithmetic.test.ts`
- AC-10 covered by reading `/privacy`
