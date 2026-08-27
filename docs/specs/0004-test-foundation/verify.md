# Verify: Test foundation · spec 0004 · updated 2026-08-26

Steps `/check verify` runs against the acceptance criteria in index.md. Each step names the criterion it proves. Run against the local stack (`pnpm db:start`) and the real seed.

## AC-1, AC-5, AC-11, AC-12: the isolation thread on the real stack

1. Start the local stack with `pnpm db:start`, then `pnpm db:reset`.
2. Run `pnpm test:integration`. The isolation test must pass: it mints a session for dev one, writes a profile, mints for dev two, and asserts dev two cannot read dev one's profile.
3. Confirm the suite ran against the local stack, not a mock, and confirm it precisely. The test calls `createClient()` from `src/lib/supabase/server.ts` itself, passing an in memory cookie jar where the `next/headers` store normally goes, so the module under test is the same one every page and Server Action uses. The policies are the real ones and the URL is the local stack's. Grep the test tree: no second Supabase client is constructed anywhere in it.
4. Confirm the adapter's default changed nothing for the application: `pnpm build` passes, and the health page still reads a profile through `createClient()` called with no argument.
5. Confirm the test helpers are outside the application's module graph: `test/helpers/` holds the mint, nothing under `src/` imports from `test/`, and a grep for `lib/testing` finds nothing. This is what stands in for a lint rule on the transitive path to the secret key client.
6. Run `pnpm test` with the stack down. Unit tests pass; `pnpm test:integration` fails with the named message telling the engineer the stack is not running.

## AC-2, AC-8, AC-9: record and replay

1. Inspect `test/fixtures/` in git: it holds a real recorded response from GitHub's public REST API (status, headers, body), not a hand written stub.
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

## Proved during the build (2026-08-26)

Added by `/develop` after the build, alongside the steps above rather than replacing them. These are the concrete commands the steps above describe, plus two checks the design could not have named because they only exist once there is code to run.

### Commands, as they actually are

- [x] `pnpm test` · 24 unit tests pass, with the stack stopped and no network reached → AC-5, AC-10, AC-12
- [x] `pnpm test:integration` · 9 tests pass against the local stack → AC-1, AC-4, AC-5, AC-6, AC-11
- [x] `pnpm db:start` then `pnpm db:reset`, then `pnpm test:integration` · green from a clean seed → AC-6
- [x] Stop the stack, run `pnpm test:integration` · fails before any test runs, naming `pnpm db:start` → AC-12
- [ ] `TEST_FIXTURE_MODE=record` is the only way to reach the network, and it warns on the way → AC-8 · **NOT MET on 2026-08-27.** The mode gate half holds: replay never reaches the network. The warning half does not reach a human. `console.warn` in `record()` does fire, but Vitest's default console interception swallows it, so a normal `TEST_FIXTURE_MODE=record` run prints only the pass summary. Visible only with `--disableConsoleIntercept`. Not a security hole, redaction still runs at write time, but the prompt to review the file before committing never arrives

### The isolation test is not vacuous

The one check that separates a real isolation proof from a test that would pass against a broken policy. A green suite proves nothing on its own here: it has to go red when the thing it guards is removed.

- [x] `alter table public.profile disable row level security;` against the local database, then `pnpm test:integration` → AC-1
- [x] Five tests fail across both integration files, not four as first written here (the write leaks, the second user reads four rows instead of none, the cross user insert is no longer refused, dev three finds rows, and the fixtures test's `maybeSingle()` then errors `PGRST116` on multiple rows). Count corrected 2026-08-27 from an observed run
- [x] `alter table public.profile enable row level security;` to restore, then confirm green again

Run this again whenever the isolation test is edited. A test that stays green with the policy off has stopped proving anything and needs fixing rather than trusting.

### The recording survives the tooling

`.lintstagedrc.json` runs `prettier --write` on every staged `*.json`, so the store's one property (byte for byte what the service sent) is one config change away from being lost silently.

- [x] Hash `test/fixtures/github/repos-vercel-next-js.json`, commit it, hash it again · identical → AC-2, AC-13
- [x] `pnpm format:check` passes with the recording present, so CI does not demand a rewrite

### Value sourcing, one step per row

Each row of the spec's Value sourcing table, exercised at the edge that breaks if the source is wrong.

- [x] A's written row comes from `public.profile`, written by A's own session, not by the admin client · the isolation test writes through `createClient()` and the write fails if the insert policy is wrong → AC-1
- [x] The proof B cannot read A's row comes from the policy, not from a filter · there is no `eq` on the reading select, and a targeted `eq` on A's id also returns nothing → AC-1
- [x] The session comes from `generateLink` then `verifyOtp`, not from a hand built token · `mintSession()` throws if no cookie reaches the jar, so a session that never persisted cannot pass as one that did → AC-1
- [x] The refusal comes from `env.DEV_SESSION_ENABLED` defaulting to false · proved with the variable absent, not merely set to `"false"`, since absent is the state production is actually in → AC-3
- [x] The replayed response comes from the committed file, never the network · a missing fixture fails loudly and no `fetch` is made on the way → AC-2, AC-9
- [x] The fixture ids are valid version 4 UUIDs · checked against the real rows with the same `z.uuid()` the application parses with, not by reading the seed as text → AC-6
- [x] No fixture carries a real personal identifier · every seeded and minted address ends in the reserved `.test` domain → AC-4

### Still manual, and still owed

- [x] The missing profile path for dev three, DRIVEN IN A REAL BROWSER on 2026-08-27 via the Playwright MCP, not left owed. Signed in as dev three at `/sign-in`, landed on `/health`, and the page rendered the `role="alert"` block reading "Could not read your profile. / No profile exists for this user yet. / Kind `record_not_found`, severity `expected`", rather than an empty page. Dev one and dev two were driven the same way and each saw only their own profile, carrying the re-minted ids `1111...-4111-8111-...` and `2222...-4222-8222-...`, which also proves the tightened `z.uuid()` parser accepts the new pool in the real application. An automated version still waits on Playwright: the page is an async Server Component, which Vitest does not support, and this feature deliberately installs no browser runner. Feature 9 onward owns it, with Playwright.
