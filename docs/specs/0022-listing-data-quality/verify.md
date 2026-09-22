# Verify: Listing data quality · spec 0022 · updated 2026-09-21
_Steps derived from spec 0022 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Sign in, run a `/search` whose results include a description carrying `\n` (the PNC shape) → the card shows a line break or plain text, never the two characters backslash and `n`; the same holds on `/applications` after applying to it and on `/demo` after a refresh → AC-4, invariant 3
- [ ] Apply to a listing whose description had an escape, then read the new `application.job_description` through `psql` → it holds the decoded text, not the escape → AC-4 (stored, not only rendered)
- [ ] On `/search`, find or force (edited recording) two ids with equal company, title and location → one card renders; its "View the posting" link and apply control name the same id → AC-1
- [ ] Same pair, having applied to the SECOND id first (insert the `application` row by hand) → the one card shown is the second id, marked applied → AC-3
- [ ] Same pair with the applied ids read made to fail → the first id shows, not applied, and the `COPY-8` sentence is on screen → AC-3 failure case, invariant 6
- [ ] A listing with `salary_min` 109440.2 and `salary_max` 109440.4 → the card reads `$109,440`, never `$109,440 to $109,440`; `/applications` reads the same after applying → AC-6
- [ ] Run a `/demo` refresh (engineer only, spends real calls) → no two kept cards share company, title and location, and the Everpure pair, if Adzuna returns it again, shows as two cards → AC-8, AC-2

## Commands
- [ ] `pnpm vitest run --project unit src/lib/listing-dedup.test.ts` → the Everpure pair stays two results; break the key to drop `title` and both Everpure tests fail → AC-2 (the scope row's own test)
- [ ] `pnpm vitest run --project unit src/lib/listing-normalize.test.ts` → the backslash, backslash, `n` case and the `&amp;lt;` case each decode once; replace the single pass with chained `replaceAll` and both fail → AC-4
- [ ] Same file → a stray `\x` and a stray `&eacute;` each produce one warning level Sentry event carrying `sourceJobId`, `field` and the fragment, under one fixed message and fingerprint; an ordinary `&` and a trailing lone backslash produce none → AC-5
- [ ] `pnpm vitest run --project integration-serial test/integration-serial/search-listings.test.ts` → a title or company decoding to whitespace only is dropped and its neighbour kept; an absent description and location stay absent → AC-4
- [ ] `pnpm vitest run --project unit "src/app/(app)/search/page.test.ts"` → the dedup wiring block passes; against the page without `dedupeListings()` three of its tests fail → AC-1, AC-3
- [ ] `pnpm vitest run --project unit src/features/demo/refresh.test.ts` → the synthetic duplicate across the two searches keeps one id and the frontend search takes its next listing instead → AC-8
- [ ] `pnpm vitest run --project integration test/integration/decode-listing-text.test.ts` → every shared case agrees byte for byte between the SQL function and `decodeListingText()`; replace the live function with one missing `&#39;` and the entity case fails → AC-7, invariant 4
- [ ] Same file → the broken row's four columns decode, the clean row is byte identical including `updated_at`, the row count is unchanged, and a title that decodes to nothing is kept as stored → AC-7
- [ ] Same file → `has_function_privilege` is false for `anon`, `authenticated` and `service_role` → invariant 7
- [ ] Before the migration merges, run against production and record the number: `select count(*) from public.application where exists (select 1 from unnest(array[job_title, company_name, job_location, job_description]) as field (value) where field.value ~ '\\n|\\r|\\t|\\"|\\\\|&amp;|&lt;|&gt;|&quot;|&#39;');` plus `select count(*) from public.application;`, and record both numbers. After deploy, the total is unchanged, and every row the first query still matches is inspected. The matching count is not expected to be 0, because a correctly decoded row can still match: `&amp;lt;` decodes once to `&lt;`, and an escaped backslash followed by `n` decodes to a literal backslash and `n`, both of which the pattern matches. Each row that still matches is either such a once decoded double escape, or a title or company that would decode to blank and was kept as stored; any other matching row is a backfill defect → AC-7, Follow-up

## Value sourcing
- [ ] Dedup key source: vary only case and internal whitespace of company, title and location → still one card; vary the location → two cards; blank location on two different ids → two cards → AC-1, invariant 2
- [ ] Applied id source: the applied read is still asked about every raw id, not only the kept ones (`readAppliedJobIds` called with both ids) → AC-3
- [ ] Decoded value source: title, company, location and description are each decoded, with the field named in any Sentry report → AC-4, AC-5
- [ ] Salary display source: the one figure versus range decision follows the formatted strings, so `109440.4` and `109440.6` still render as a range (`$109,440 to $109,441`) → AC-6
- [ ] Backfill value source: the stored value after the migration equals what `decodeListingText()` (plus trim for title and company) produces for the same input → AC-7

## Acceptance-criteria coverage
- AC-1 covered by the dedup key and search wiring steps, and the value sourcing key step
- AC-2 covered by the Everpure unit step and the `/demo` refresh step
- AC-3 covered by the applied preference manual steps, the page wiring step, and the applied id sourcing step
- AC-4 covered by the escaped newline manual steps, the decoder unit step, and the search integration step
- AC-5 covered by the leftover fragment unit step
- AC-6 covered by the salary manual step and the salary sourcing step
- AC-7 covered by the parity, backfill and production count steps
- AC-8 covered by the `/demo` walk unit step and the `/demo` refresh step
