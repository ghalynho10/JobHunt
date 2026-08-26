# Verify: Test foundation · spec 0004 · updated 2026-08-26

Steps `/check verify` runs against the acceptance criteria in index.md. Each step names the criterion it proves. Run against the local stack (`pnpm db:start`) and the real seed.

## AC-1, AC-5, AC-11, AC-12: the isolation thread on the real stack

1. Start the local stack with `pnpm db:start`, then `pnpm db:reset`.
2. Run `pnpm test:integration`. The isolation test must pass: it mints a session for dev one, writes a profile, mints for dev two, and asserts dev two cannot read dev one's profile.
3. Confirm the suite ran against the local stack, not a mock, and confirm it precisely. The test calls `createClient()` from `src/lib/supabase/server.ts` itself, passing an in memory cookie jar where the `next/headers` store normally goes, so the module under test is the same one every page and Server Action uses. The policies are the real ones and the URL is the local stack's. Grep the test tree: no second Supabase client is constructed anywhere in it.
4. Confirm the adapter's default changed nothing for the application: `pnpm build` passes, and the health page still reads a profile through `createClient()` called with no argument.
5. Run `pnpm test` with the stack down. Unit tests pass; `pnpm test:integration` fails with the named message telling the engineer the stack is not running.

## AC-2, AC-8, AC-9: record and replay

1. Inspect `test/fixtures/` in git: it holds a real recorded response from the stand in endpoint (status, headers, body), not a hand written stub.
2. Run the replay test. It passes without touching the network.
3. Delete one fixture file, run the replay test again. It fails loudly, naming the missing file and the command that records it. Restore the file.
4. Confirm record mode is an explicit opt in (`TEST_FIXTURE_MODE=record`) and that it warns; normal runs are replay only.

## AC-3: session path hard blocked outside development

1. Run the mint test with `DEV_SESSION_ENABLED` unset or false. The mint refuses with the expected failure.
2. Run the same test with `DEV_SESSION_ENABLED=true`. The mint succeeds against the local stack.
3. Confirm no deployed environment sets the variable (previews and production fail closed, as with the development sign in guard in spec 0002).

## AC-4, AC-6: fixture integrity

1. Confirm every seeded fixture id passes `z.uuid()` (version and variant) and that `src/features/profile/queries.ts` now uses `z.uuid()` rather than `z.guid()`.
2. Confirm dev three has no profile row. Then check the missing profile path **by hand in a browser**, signed in as dev three: the page must render the named expected failure rather than an empty page. This step is manual on purpose and stays manual until Playwright has its first real test. The page is an async Server Component, and Next.js's own testing guide (`node_modules/next/dist/docs/01-app/02-guides/testing/index.md`) states that those are not supported by Vitest and recommends an end to end test instead, which this feature deliberately does not build yet. Recording it as manual is the honest version; leaving it in a list of automated steps would imply an automated home that does not exist.
3. Grep the fixtures (seed, recorded responses, on demand users) for real personal identifiers: real names, real addresses, non `.test` emails. Nothing may match; all fixture emails end in `.test`.

## AC-7: CI

1. Push a branch (or open a pull request). The CI test job starts the local Supabase stack with the Supabase CLI in Docker and runs unit and integration suites.
2. Confirm the job is green on a passing commit and that a deliberately broken test fails the job.

## AC-10: Sentry transport in tests

1. Confirm the test setup installs an in memory transport rather than leaving Sentry uninitialised. This is the load bearing step: with no SDK initialised, every assertion below passes while proving nothing, which is the same hollow green the reference bug wore.
2. Run a test constructing an `unexpected` failure. The transport holds one event, fingerprinted `["failure", <kind>]`, carrying the `failure.kind` and `failure.severity` tags, at level `error`.
3. Run a test constructing an `expected` failure. Same fingerprint and tags, at level `info`.
4. Confirm nothing left the process: no request reached a Sentry ingest host during the run.

## AC-13: recordings carry no credential

1. Record a response from a request carrying an API key in a query parameter, an `authorization: Bearer …` header, and a response `set-cookie` header.
2. Read the written file. The allow listed headers are present verbatim, every other header value is the fixed placeholder, and neither the key nor the bearer token appears anywhere in the file.
3. Sweep the whole of `test/fixtures/` for credentials: nothing matches `sb_secret_`, `sb_publishable_`, `Bearer `, or any value present in `.env.test`.
4. Confirm redaction runs at write time rather than at read time, so a credential is never written to disk at all. A file that is scrubbed on the way out has already leaked once, into git history.
