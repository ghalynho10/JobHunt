# 0004. Test foundation

**Date**: 2026-08-25
**Status**: In Progress

## Summary

This feature stands up the project's whole test layer: the runner, the fixtures, a development only way to mint a real signed in session without a browser, and a way to replay real external responses. It decides the test runner (Vitest) that spec 0001 deliberately left open, and replaces the seeded fixture users with valid identifiers. The goal is tests that prove real behaviour against the real database, so a passing test can never hide the same wrong assumption twice. It also settles three details the first test run would otherwise walk straight into: how `server-only` resolves under Vitest, how a test drives the application's own request scoped client rather than a second one built in test code, and which environment each test project runs in.

## Requirements

**User stories**:
- As a developer writing a test, I want to sign in as any fixture user without driving a browser, so I can prove real isolation against the real policies.
- As a developer, I want external services exercised against a real recorded response, so a test cannot pass because it mocked the same wrong assumption twice.
- As an operator, I want the session mint hard blocked outside development, so the secret key path can never mint a session on a deployed site.
- As a reviewer, I want fixtures that carry no real personal identifier, so a committed test can never leak real data.

**Acceptance criteria** (the contract, each criterion is independently checkable):
- **AC-1**: A test can sign in as fixture user A, write data, switch to fixture user B, and prove B cannot read A's data. The write goes through the request scoped client, not through a Server Action; driving one of those without a browser is spec 0001's third constraint and is deferred by name in the Follow-up.
- **AC-2**: An external service call can be exercised against a real recorded response (captured once from the real service) rather than a hand written mock.
- **AC-3**: The session mint refuses to create a session whenever development is not explicitly enabled (`DEV_SESSION_ENABLED` absent or false), failing closed, and a test proves the refusal.
- **AC-4**: No fixture anywhere (seeded users, recorded responses, on demand mints) contains a real personal identifier; fixture identities are obviously fake and use the reserved `.test` domain.
- **AC-5**: Vitest runs unit and integration tests, and integration tests run against the local Supabase stack with the real policies applied, not a mock. No end to end runner is installed by this feature.
- **AC-6**: The seeded fixture pool is replaced with users whose ids satisfy `z.uuid()` (valid version and variant), the third fixture user with no profile row survives, and the profile parser tightens from `z.guid()` to `z.uuid()`.
- **AC-7**: CI runs the integration suite against a local Supabase stack started with the Supabase CLI in Docker.
- **AC-8**: Record and replay are toggled by an explicit mode; normal runs replay from files and never touch the network, and record mode is an opt in that warns.
- **AC-9**: Replay of a missing fixture fails loudly, naming the missing file and the command that records it, and never silently hits the live network.
- **AC-10**: Nothing leaves the process during a test run, and the reporting contract is proved rather than assumed. The test setup installs an in memory transport, and a test constructing a `failure()` asserts the captured event carries the `["failure", <kind>]` fingerprint, the `failure.kind` and `failure.severity` tags, and the level its severity implies (`error` for unexpected, `info` for expected). Leaving Sentry uninitialised does not satisfy this: every assertion would pass without proving the reporting works.
- **AC-11**: Tests that write data use a fresh on demand fixture user per test, so no test contaminates another.
- **AC-12**: `pnpm test` runs unit tests without requiring the stack, and `pnpm test:integration` runs the integration suite and fails with a clear message when the local stack is not running.
- **AC-13**: A recording committed to git never carries a credential. Record mode redacts at write time, keeping only the headers named on an allow list and replacing every other header value with a fixed placeholder, and scrubbing the credential carrying query parameters and body fields the service declares. A test proves a recording captured from a request carrying an API key, a bearer token and a `set-cookie` header comes out holding none of the three.

## Decision

**Chosen option**: Option 2 in rationale.md (Vitest integration against the real local stack), with Playwright named as the eventual end to end runner but not installed here. The sub decisions below follow the options marked chosen in rationale.md.

One sentence: Test foundation uses Vitest for unit and integration, a development only session mint through the admin magiclink exchange, a bespoke recorder that replays real recorded responses from files, a re-minted fixture pool with valid ids, fresh on demand users for write tests, an in memory Sentry transport the test can read rather than a disabled one, and a CI job that runs integration against the local Supabase stack.

Sub decisions, all binding for the build:
- **Runners**: Vitest for unit and integration. Playwright is the recorded choice for end to end and is **not installed by this feature**. A config with no test proves nothing today, has to be kept current across several features before anything runs it, and forces CI to decide what to do with an empty suite. The choice is binding whether or not the file exists, so the first feature that genuinely needs a browser stands the tool up alongside its first real test.
- **Fixture pool**: the three fixture users stay in `supabase/seed.sql`, re-minted with valid version 4 UUIDs, idempotent, applied locally and to the hosted development project only. The third user keeps no profile row. A development only helper mints additional users on demand for tests that write.
- **Session mint**: a development only helper under `test/helpers/` that uses the secret client (binding rule 1, caller 1) to generate an admin magiclink for a fixture user and exchanges it with `verifyOtp` through the request scoped client into an in memory cookie jar. Guarded by `DEV_SESSION_ENABLED` (default false, fails closed). Programmatic only, no HTTP route. It does not depend on the development password sign in that feature 7 deletes.
- **Record and replay**: a bespoke recorder at the fetch boundary. Record mode (explicit opt in, warns) saves a real response to `test/fixtures/<service>/`. Replay mode returns recorded responses and never touches the network. A missing fixture fails loudly, naming the file and the record command. Proven now against GitHub's public REST API (`https://api.github.com/repos/vercel/next.js`), chosen as the stand in because it is genuinely external, free, needs no credential, is about as stable as anything on the internet, and answers with a real header set including rate limit and caching headers, so the redaction in AC-13 is exercised against real headers rather than invented ones. Record mode reaches it exactly once. Adzuna and the model router record their own fixtures later.
- **Test isolation**: tests that write data use a fresh on demand user per test; the fixed pool serves the read only isolation proof.
- **Sentry**: the test setup replaces the transport with an in memory one rather than leaving the SDK uninitialised. Nothing reaches Sentry, and the test can read what `failure()` produced, so the reporting contract (fingerprint, tags, level) is asserted rather than assumed. A transport that never existed would make every such assertion pass while proving nothing.
- **Commands**: `pnpm test` (unit, no stack) and `pnpm test:integration` (needs `pnpm db:start`, clear error if the stack is down). Both are `vitest run`, never bare `vitest`, which watches by default and would hang the pre commit hook the follow-up below considers.
- **CI**: a test job runs `supabase start` in Docker (image caching) then the unit and integration suites.
- **Where test files live**: unit tests are colocated beside the code they prove (`src/features/profile/queries.test.ts`), following the folder by feature rule, since a feature's tests are that feature's code. Everything else lives in a top level `test/` tree: `test/integration/` for tests that span features and belong to no single one, `test/helpers/` for the mint and the on demand user helper, and `test/fixtures/` for the replay store. Putting the helpers there rather than under `src/lib/testing` is the load bearing half, see the Security model below.
- **Module resolution under Vitest**: the Vitest config aliases `server-only` to an empty module. `server-only@0.0.1` maps the `react-server` condition to an empty file and every other condition to a module whose whole body is a `throw`, and Vitest resolves the default condition, so `import "server-only"` fails at import time. That line is the first statement of `src/lib/supabase/secret.ts`, `src/lib/supabase/server.ts` and `src/features/profile/queries.ts`, which is every module the integration thread needs. The alias is chosen over adding `react-server` to `resolve.conditions`, which is not scoped to one package and would pull React's own server build into every test.
- **The request scoped client takes an injected cookie adapter**: `createClient()` in `src/lib/supabase/server.ts` gains an optional cookie adapter, defaulting to the `next/headers` store it reads today. Tests pass an in memory jar. The isolation proof therefore drives the same module every page and Server Action drives, rather than a second Supabase client hand built in test code, which would be exactly the mock encoding the same assumption as the code under test that this feature exists to make impossible.
- **Test environments**: two Vitest projects. The integration project runs the `node` environment and may not run jsdom, because `@t3-oss/env-nextjs` refuses to hand out a server variable when it believes it is on the client, so `env.SUPABASE_SECRET_KEY` would be unreachable inside the mint. The unit project runs jsdom only where a test renders a component. Next.js's own Vitest guide suggests jsdom throughout; it is written for component tests and does not fit the integration half.
- **Driving a Server Action without a browser**: deferred to feature 9, deliberately and named rather than dropped. Spec 0001 makes it one of three must satisfy constraints on the runner and this feature meets the other two. See the Follow-up, which records both the reasoning and the technique.

**Implementation skills**: `supabase` (supabase/agent-skills, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (supabase/agent-skills, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-nextjs-sdk` (getsentry/sentry-for-ai, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning and options: see rationale.md.

## Feature design

**Data model sketch**:
The feature adds no product tables. It changes fixture data in the auth schema and adds a file based replay store.
- `auth.users` (existing): the fixed fixture pool of three users, re-minted with valid version 4 UUIDs and emails on the `.test` domain, with idempotent inserts in `supabase/seed.sql`. Dev one and dev two each have a profile row in `public.profile`; dev three has none (the missing profile path from spec 0003).
- On demand fixture users: created by a development only helper through the admin API (secret client), each with a generated UUID and a unique email, for tests that write.
- Replay store: files under `test/fixtures/<service>/<name>.json` in git, holding the recorded request shape, status, headers, and body of a real external response.

**State transitions**: none. The feature introduces no state machine.

**API surface**:
The surfaces are programmatic helpers in test code, not HTTP endpoints. The session mint cannot be a route under `src/app` (binding rule 1 forbids importing the secret client from there), and it must not live in `src/features/dev-session` (feature 7 deletes that folder). Both helpers live under `test/helpers/`, outside `src/` entirely. `tsconfig.json` already includes `**/*.ts`, so they are type checked, and the `@/` alias still resolves for their imports.

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `mintSession(email)` | dev only helper | email (string, required) | session cookies on an in memory jar | secret client, dev only | refused outside dev, user not found |
| `mintFixtureUser(prefix)` | dev only helper | prefix (string, optional) | email, user id | secret client, dev only | refused outside dev |
| `recordedFetch(service, name)` | replay helper | service, fixture name | parsed recorded response | none | missing fixture (loud) |
| record mode env | config | `TEST_FIXTURE_MODE` | record or replay | none | none |
| `createClient(cookieAdapter?)` | existing application client, one new optional parameter | an optional cookie adapter, default the `next/headers` store | the request scoped Supabase client | the caller's own token, unchanged | unchanged |

**Value sourcing** (every value each action produces or displays names where it comes from):
| Action | Value produced or displayed | Source |
|---|---|---|
| isolation test | A's written row | a DB column in `public.profile`, written by A's session |
| isolation test | proof B cannot read A's row | the row level security policy (spec 0003), applied by the real local stack |
| session mint | the session | Supabase auth: admin `generateLink` then `verifyOtp` against the local stack |
| hard block | the refusal | `env.DEV_SESSION_ENABLED` (default false) |
| record and replay | the replayed response | `test/fixtures/<service>/<name>.json`, recorded once from the real service |
| fixture pool | the user ids | valid version 4 UUIDs, minted in `seed.sql` or by the admin API |
| fixture integrity | no real personal identifier | the fixture convention (`.test` domain, fake identities) and review |

**Key invariants**:
- Only the allowed callers use the secret key client (binding rule 1); the session mint is caller 1, and no new caller is added without editing spec 0001.
- The session mint never runs unless `DEV_SESSION_ENABLED` is explicitly true.
- Fixtures never carry a real personal identifier; fixture emails use the reserved `.test` domain.
- Fixture user ids always satisfy `z.uuid()`.
- Replay never touches the network; only record mode does, and it is an explicit opt in.
- Tests that write data use a fresh user per test.
- The test layer lives outside `src/` except for colocated unit tests, so no application module can import a test helper, and the secret key client stays unreachable from `src/app` by construction rather than by lint pattern.
- The test layer builds no Supabase client of its own. It drives `src/lib/supabase/server.ts` with a different cookie adapter, so a break in the application's client wiring breaks the test rather than passing against a parallel implementation.
- The integration project runs the `node` environment. Under jsdom the mint cannot read the secret key at all.
- A recording committed to git holds no credential.

**Security model**:
- The session mint is a secret key caller (binding rule 1, slot 1), hard blocked outside development, and lives under `test/helpers/`, outside `src/` entirely. That location is a security decision, not a filing preference. The `@typescript-eslint/no-restricted-imports` override in `eslint.config.mjs` blocks `src/app/**` from importing `**/supabase/secret` directly, and it would not have blocked `src/app/**` from importing a mint under `src/lib/testing`, which imports that module transitively. Rather than extend the rule to chase that path, the mint is kept out of the application's module graph, where the path cannot exist to be blocked. A structural guarantee beats a pattern list that has to be kept complete.
- No HTTP route exposes the mint; tests call it directly.
- The mint does not depend on the development password sign in from feature 1, which feature 7 deletes.
- Record mode warns when it records, so a human reviews the committed file before it is merged.
- No new compliance scope; fixtures hold no real personal data by construction and by review.

**Configuration required**:
- `DEV_SESSION_ENABLED`: already exists (default false); the mint reuses the same guard as the development sign in.
- `TEST_FIXTURE_MODE`: test only, values `record` or `replay` (default replay). Read by the recorder module and parsed with a small Zod schema at its boundary. It is test only, so it stays out of `src/env.ts`, which describes the application's environment contract.
- `.env.test`: the values a test run reads (the local stack's URL and keys, `NEXT_PUBLIC_SITE_URL`, `DEV_SESSION_ENABLED=true`). It exists because `src/env.ts` validates the whole contract on import and the mint genuinely needs the secret key present. `SKIP_ENV_VALIDATION` is not an alternative here: it would let a run start with `SUPABASE_SECRET_KEY` undefined and fail later inside the mint, which is the silent failure shape the error model exists to prevent. Not committed; a `.env.test.example` records the shape.
- No new secrets or third party credentials. The local stack's keys are fixed development values, not secrets.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: mint a session for dev one, write a profile, mint for dev two, assert dev two cannot read dev one's profile, against the real local stack, verifies **AC-1**
- Failure case: replay a missing fixture fails loudly, naming the file and the record command, verifies **AC-9**
- Auth and permission: the mint refuses when `DEV_SESSION_ENABLED` is false, verifies **AC-3**
- Fixture integrity: every seeded id passes `z.uuid()`, dev three has no profile row, no fixture carries a real personal identifier, verifies **AC-4**, **AC-6**
- Record and replay: record a real response from GitHub's public REST API once, commit it, replay it, verifies **AC-2**, **AC-8**
- CI: the integration job starts the local stack and runs the suite, verifies **AC-7**
- Sentry: a test constructs a `failure()` of each severity and asserts the in memory transport captured an event carrying the `["failure", <kind>]` fingerprint, both tags and the level that severity implies, and that nothing reached a Sentry ingest host, verifies **AC-10**
- Redaction: a recording captured from a request carrying an API key, a bearer token and a `set-cookie` header is written with all three replaced by the placeholder, verifies **AC-13**

## Build plan

Tracer Bullet: stand up the thinnest real thread first (a real session, a real read, real isolation), then thicken with record and replay, on demand mints, commands, and CI.

1. Scaffold Vitest as two projects: a unit project (jsdom only where a test renders a component) and an integration project (`node`, because `@t3-oss/env-nextjs` will not hand a server variable to code it believes runs on the client). Point the unit project at colocated `src/**/*.test.ts` and the integration project at `test/integration/**`. Alias `server-only` to an empty module, resolve `@/` with `vite-tsconfig-paths`, load `.env.test`, and install the in memory Sentry transport in the setup file. Add `pnpm test` as `vitest run`, satisfies **AC-5**, **AC-10**
2. Re-mint the fixture pool in `supabase/seed.sql` with valid version 4 UUIDs, keeping the three user shapes (dev one and dev two with profiles, dev three with none). The old `1111…` and `2222…` rows must be deleted earlier in the same file than the new rows are inserted, because `auth.users.email` is unique and the new pool reuses the addresses. Tighten the profile parser from `z.guid()` to `z.uuid()`, satisfies **AC-4**, **AC-6**
3. Give `createClient()` in `src/lib/supabase/server.ts` an optional cookie adapter, defaulting to the `next/headers` store it reads today, so a test can drive the application's own client with an in memory jar. No existing caller changes and no behaviour changes
4. Build the development only session mint under `test/helpers/`, guarded by `DEV_SESSION_ENABLED`, using the admin magiclink exchange into an in memory cookie jar passed to `createClient()`. Verify the exact Supabase auth API surface against current docs at build time (per the supabase skill), satisfies **AC-3**
5. Write the isolation integration test: mint as dev one, write, mint as dev two, prove isolation, against the local stack and through `createClient()`, satisfies **AC-1**
6. Build the bespoke record and replay recorder with an explicit record mode, replay from `test/fixtures/<service>/`, redaction at write time, and record the GitHub stand in response. Add `test/fixtures/` to `.prettierignore` in the same step, satisfies **AC-2**, **AC-8**, **AC-9**, **AC-13**
7. Build the on demand fixture user mint helper for fresh per test users, satisfies **AC-11**
8. Split the commands: `pnpm test` for unit, `pnpm test:integration` for integration with a clear error when the stack is down, satisfies **AC-12**
9. Add the CI test job that runs `supabase start` in Docker, then unit and integration, satisfies **AC-7**

## Consequences

**Positive**:
- Tests prove real isolation against real policies with real sessions, closing the class of bug the reference project suffered (six passing tests that all mocked the same wrong assumption).
- Recorded responses are real and reviewable in git, so a wrong assumption in a hand written mock cannot pass.
- The secret key session path is provably blocked outside development.
- The fixture pool becomes parser correct, so the profile read can tighten to `z.uuid()`.

**Negative and tradeoffs**:
- The bespoke recorder is custom code to build and maintain; there is no off the shelf tool doing exactly this.
- The CI integration job needs Docker and pulls Supabase images, so it is slower and more setup than a unit only job.
- The session mint needs cookie jar plumbing in tests, which is real test infrastructure to keep working as the framework moves.
- Integration tests are slower than unit tests, and the two command split is a new convention to learn.
- `createClient()` gains a parameter that exists for the test layer's benefit. It is optional and no existing caller changes, but it is production code shaped by testability, which is worth naming rather than hiding.
- The recorder now owns redaction as well as record and replay, so the custom code is larger than record and replay alone, and a service whose credential travels somewhere unusual needs its own declaration.

**Neutral**:
- No end to end runner exists yet. Playwright is chosen on paper and installed by the first feature that needs a browser, so nothing inert sits in the tree in the meantime.
- The development password sign in stays until feature 7 deletes it; the mint does not depend on it.
- The `server-only` alias is a test only concession. The marker still does its real job in the application build, where the `react-server` condition genuinely applies; the alias only stops it throwing in a runner that never resolves that condition.
- `pnpm db:start` remains the way the local stack runs.
- The dev only helpers open no named spans; they are not failure alerted operations, so `docs/observability/spans.md` is unchanged.

## Follow-up

- [ ] Verify the exact Supabase admin auth API surface (`generateLink`, `verifyOtp`, or the current equivalent) against current Supabase docs at build time, per the supabase skill's core principle that Supabase changes frequently. Do not trust training data for the session mint call shape.
- [ ] The old non RFC fixture ids (`1111…`, `2222…`) remain on the hosted development project. Plan a one time, idempotent removal in the seed rewrite so the new pool can own the fixture emails (the email unique constraint forbids a second row with the same address).
- [ ] The constraint and Zod drift test from spec 0003 (check constraint value lists agree with their Zod counterparts) was deliberately not a feature 8 target; revisit it when the first constraint carrying feature lands.
- [ ] Playwright is installed, configured and given its first real end to end test together, by the first feature that needs a browser (feature 9 onward). Two things are waiting on it: the missing profile path in this spec's verify list, which stays a manual browser check until then, and any later claim that only a real browser can prove.
- [ ] Adzuna (feature 11) and the model client router (feature 13) record their own fixtures when built, using the recorder and store this feature provides.
- [ ] Decide whether the pre commit hook (husky and lint-staged) should also run unit tests now that a test command exists; the hook currently runs lint, format, and type check only.
- [ ] **Driving a Server Action without a browser is deferred to feature 9, deliberately.** Spec 0001 names it as one of three must satisfy constraints on the test runner; this feature meets the other two (the local stack with the real policies, and the development only session mint). It is deferred rather than met because there is nothing honest to drive yet: the only Server Action in the repository is `signInWithDevPassword`, which feature 7 deletes, and the first real write path is feature 9's profile form. The runner choice does not rest on it either, because the technique is a plain HTTP exchange against a running server and would work identically under any candidate runner. Recorded here so it is not rediscovered a third time: fetch the page, read the hidden fields React renders on the form (`$ACTION_REF_1`, `$ACTION_1:0` carrying the action id, `$ACTION_1:1`, `$ACTION_KEY`), then post those plus the real form fields as multipart to the same route; a `303` carrying the session cookie means it ran. The `Next-Action` header path is fiddlier and silently loses the form fields. Action ids come from `.next/server/server-reference-manifest.json`, and an id is only valid for a build made at that same directory path, so an id read locally is the wrong id on Vercel. Feature 9 owns proving it, and its done when clause in the scope now says so.
- [ ] Add `test/fixtures/` to `.prettierignore` when the store is built (build step 6 above). `.lintstagedrc.json` runs `prettier --write` on every staged `*.json` and `pnpm format:check` runs in CI, so a recording committed as the service sent it would be rewritten on commit and would fail the check until it was. A reformatted recording is no longer byte for byte what the service sent, which is the one property the store exists to hold.
- [ ] Layer a hard refusal on `NEXT_PUBLIC_VERCEL_ENV === "production"` on top of the `DEV_SESSION_ENABLED` guard, in the mint and in the development sign in both. Today the whole claim that the secret key path can never mint a session on a deployed site rests on one variable never being set, and the verify step for AC-3 is a human confirming it. This is not the `NODE_ENV` check spec 0002 rejected for good reason: `VERCEL_ENV` separates a preview from production accurately, so the preview thread keeps working while production gains a guard in code rather than in configuration.
- [ ] The seed re-mint has an ordering constraint and a blast radius, both easy to miss. `db-migrate.yml` runs `supabase/seed.sql` against the hosted development project on every pull request with `ON_ERROR_STOP=1`, and `auth.users.email` is unique, so the old rows must be deleted earlier in the file than the new rows are inserted. Second effect: while this branch is open, any other open pull request still carrying the old seed will fail that workflow, because its old ids now collide on the emails the new pool owns. Land it when few branches are open, or expect to rebase them.
- [ ] The cookie jar's delete on empty value branch has no test. `setAll()` in `test/helpers/cookie-jar.ts` treats an empty cookie value as a deletion rather than storing an empty string, and nothing exercises that path, because no test signs out or clears a cookie. It is correct today by reading, not by a test that would fail if it regressed, and getting it backwards would leave a signed out jar still reading as though it held a session. Found by the fresh model `/check review` on pull request #18 and deliberately left unfixed in that round, since it is a different module from the recorder being repaired there. Six lines to close: set a cookie, `setAll` it to `""`, assert `names()` no longer lists it.
