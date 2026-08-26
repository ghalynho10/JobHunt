# Rationale: Test foundation

## Context

The project has no test runner, no tests, and no fixture layer beyond the seeded users. Spec 0001 deliberately left the test runner decision to feature 8 and carried Vitest and Playwright forward with three must satisfy constraints: drive a Server Action without a browser, run against the local Supabase stack with the real policies applied (not a mock), and authenticate through a development only session mint. Feature 2 deferred the CI test job to this feature, and the workflow for every feature after this one runs `/check verify` then `/test`, so the foundation decides the shape all later tests share.

The strongest force is the reference project's worst bug: it shipped a scoring feature that returned a nearly constant meaningless number, and six passing tests all mocked the same wrong assumption, so nothing caught it. Any test layer built here has to make that failure mode structurally harder: real sessions, real policies, real recorded responses, never a hand written stub that encodes the assumption under test.

Two inherited obligations bind this feature. Spec 0003's follow-up hands feature 8 the job of replacing the seeded fixture users with identifiers that satisfy `z.uuid()`, because the current pair (`1111…`, `2222…`) violates the RFC version and variant nibbles and forces the profile parser to use the looser `z.guid()`. And binding rule 1 already reserves the secret key client for "the development only test session mint (feature 8), hard blocked outside development", so the mint is an expected caller with a closed allow list, never an ad hoc one.

Two constraints shape the design's room to move. The secret key client may not be imported from anywhere under `src/app` (binding rule 1), so the mint cannot be a route handler or a page; it must be a programmatic helper under `src/lib`. And feature 7 deletes the development password sign in folder (`src/features/dev-session`), so the mint must not depend on it.

The first of spec 0001's three constraints, driving a Server Action without a browser, is met later rather than here, deliberately. There is no Server Action worth driving yet: the only one in the repository is the development password sign in that feature 7 deletes, and the first real write path arrives with feature 9's profile form. The runner decision does not rest on it either, because the technique is a plain HTTP exchange against a running server and would work identically under any of the candidates, so nothing about the choice made here is left unproved by waiting. The deferral is written into the index's Follow-up with the technique recorded, and feature 9 owns it. Naming it there is the point: an obligation this project defers is always deferred by name.

Finally, `failure()` reports to Sentry inside its constructor (binding rule 2, spec 0001), so the very first test run would otherwise send noise and burn quota; spec 0001's follow-up names disabling the transport in the test environment as a required first step. Disabling is the floor rather than the goal, though. A transport that is simply never initialised makes every assertion about reporting pass without proving anything, which is the same shape of hollow green the reference bug wore, so the transport is replaced rather than switched off.

## Options considered

### Runner layers

**Option 1: Unit only, integration stays manual.** Vitest for unit tests; the real policy and session proofs remain manual against the hosted development project as they are today. Pros: fastest CI, least setup. Cons: the real isolation and session claims are never proven automatically, which is exactly the gap the reference bug exposed.

**Option 2 (chosen): Vitest integration against the real local stack.** Vitest drives unit and integration tests against the local Supabase stack in Docker with real policies. Playwright is named as the end to end runner and installed later, by the feature that first needs a browser. Pros: real sessions, real policies, real isolation, matching the constraints spec 0001 named that can be met now; CI runs the real stack via the Supabase CLI. Cons: CI needs Docker and pulls images; two test commands.

**Option 3: Playwright end to end proves the isolation thread now.** A real browser test signs in and reads. Pros: the done when proved through the real UI. Cons: heaviest to stand up at foundation time; the isolation claim is provable more cheaply at the integration layer, and no feature needs a browser yet.

### Record and replay tool

**Option 1: MSW (Mock Service Worker).** The standard way to intercept fetch in Vitest. Pros: well supported, active community, good docs. Cons: its headline model is per handler mock definitions, which is the hand written mock trap the scope warns against; record and replay are not its primary flow.

**Option 2: Polly.JS.** Purpose built to record and replay HTTP interactions to files. Pros: exactly the record once, replay forever model. Cons: lower maintenance activity lately; another dependency and another file format to learn.

**Option 3 (chosen): Bespoke fetch boundary recorder.** A small recorder that, in record mode, lets the real fetch hit the real service and saves the response to `test/fixtures/<service>/`, and in replay mode returns the recorded response. Pros: zero new dependencies; matches the app's single external boundary (calls wrapped in `attempt()`); records literally real responses; missing fixtures fail loudly. Cons: custom code to build and maintain; the format is ours to define and keep stable.

### Session mint

**Option 1 (chosen): Admin magiclink exchange.** The secret client generates a magiclink token for a fixture user, and the request scoped client exchanges it with `verifyOtp` into an in memory cookie jar. Pros: a real session with no browser and no typed password; uses the secret key slot spec 0001 reserved; does not depend on the development password sign in feature 7 deletes. Cons: cookie jar plumbing in tests; the exact auth API surface must be verified against current Supabase docs at build time.

**Option 2: signInWithPassword with fixture credentials.** The request scoped client signs in with the fixture email and password, as the current development sign in does. Pros: simplest, mirrors existing code. Cons: does not use the secret key slot spec 0001 reserved for the mint, and ties the mint to known passwords.

### Fixture pool

**Option 1 (chosen): Fixed pool in seed.sql plus an on demand mint.** The three fixture users stay in `supabase/seed.sql`, re-minted with valid version 4 UUIDs, idempotent, applied locally and to the hosted development project only. A development only helper creates fresh users on demand for tests that write. Pros: matches the existing seed pattern and the spec 0003 follow-up; preview sign in keeps working; fresh per test users keep tests isolated. Cons: the old ids must be removed from the hosted development project; seed and helper are two sources of users to keep consistent.

**Option 2: Tests mint every user at setup.** No seed pool; every test run creates its users. Pros: fully self contained. Cons: breaks the preview sign in fixtures, diverges from the seed, and makes fixture identity less stable.

### Module resolution under Vitest

`server-only@0.0.1` maps the `react-server` condition to an empty file and every other condition to a module whose entire body is a `throw`. Vitest resolves the default condition, so `import "server-only"` throws at import time, and that line is the first statement of `src/lib/supabase/secret.ts`, `src/lib/supabase/server.ts` and `src/features/profile/queries.ts`, which is every module the integration thread needs.

**Option 1 (chosen): alias `server-only` to an empty module in the Vitest config.** Pros: one line, contained to the test config, nothing else resolves differently, and the marker keeps doing its real job in the application build. Cons: a test only divergence from how the application resolves that module, which has to stay written down or it reads as a mistake later.

**Option 2: add `react-server` to Vitest's `resolve.conditions`.** Pros: no alias, resolves the way the framework does. Cons: the condition is not scoped to one package, so React itself resolves to its server build inside every test. That changes far more than the marker package and would surprise the first component test rather than the person who set it.

**Option 3: keep the test layer away from every module that imports the marker.** Pros: no configuration at all. Cons: the modules carrying the marker are exactly the modules worth proving, so this amounts to a rule that only untested code may be tested.

### The request scoped client in tests

The mint has to leave a session somewhere a later read will find it, and `src/lib/supabase/server.ts` reads its cookies from `next/headers`, which throws outside a request scope.

**Option 1 (chosen): give `createClient()` an optional cookie adapter, defaulting to today's `next/headers` store.** Pros: the isolation proof drives the same module every page and Server Action drives, so a break in the application's client wiring breaks the test; the default keeps every existing caller untouched. Cons: production code gains a parameter that exists for the test layer.

**Option 2: build a second `createServerClient` in test code with an in memory jar.** Pros: no production code touched. Cons: it is a second implementation of the thing under test. That is the hand written mock encoding the same assumption that this entire feature exists to make impossible, and it would keep passing while the real client was broken.

**Option 3: mint the session and attach the access token to a plain `supabase-js` client.** Pros: the simplest of the three, and it does prove the policies. Cons: it proves the policies and nothing about the session path the application actually uses, and the cookie handling is the part of that path most likely to break.

### Test environment

**Option 1 (chosen): the integration project runs `node`, and jsdom appears only where a unit test renders a component.** Pros: `@t3-oss/env-nextjs` hands out a server variable only when it believes it is on the server, so the mint can read the secret key; an integration suite has no reason to want a DOM. Cons: two project configurations rather than one.

**Option 2: jsdom everywhere, as Next.js's own Vitest guide suggests.** Pros: one configuration, and it matches the published guide. Cons: the guide is written for component unit tests, not for this. Under jsdom `env.SUPABASE_SECRET_KEY` is unreachable, so the mint cannot be built at all, and the failure arrives as a confusing environment error rather than as a design decision.

### Where test files live

**Option 1 (chosen): unit tests colocated, everything else in a top level `test/` tree.** Unit tests sit beside the code they prove, following the folder by feature rule, since a feature's tests are that feature's code. Integration tests, the helpers and the fixture store go to `test/`. Pros: the helpers leave `src/` entirely, so the mint is not in the application's module graph and no module under `src/app` can reach the secret key client through it, which closes a hole in binding rule 1's enforcement structurally rather than by extending a lint pattern list; integration tests that span features get a home that does not pretend they belong to one. Cons: two conventions to learn rather than one.

**Option 2: everything under a top level `test/` tree, mirroring `src/`.** Pros: the same structural benefit for the helpers, and nothing test shaped anywhere in `src/`. Cons: a unit test for `queries.ts` lives four directories from it, and colocation is what most people reach for first.

**Option 3: everything colocated, helpers stay at `src/lib/testing`.** Pros: the most literal reading of the folder by feature rule, and no change to the mint's location. Cons: the mint stays inside the application's module graph, so `src/app/**` can import the secret key client transitively through it, and the only defence available is adding patterns to `@typescript-eslint/no-restricted-imports` and keeping that list complete forever. A rule you must remember to extend is weaker than a path that cannot exist.

### The stand in endpoint for the first recording

The recorder has to be proved on something before Adzuna exists. The candidate has to be real, free, unauthenticated, and stable enough that a committed fixture stays meaningful.

**Option 1 (chosen): GitHub's public REST API.** Pros: genuinely external, free, no credential, extremely stable, and it answers with a real header set including rate limit and caching headers, so redaction is exercised against real headers rather than invented ones. Cons: record mode reaches the internet once, and a public API can rate limit an unauthenticated caller.

**Option 2: the local Supabase stack's own REST endpoint.** Pros: no third party at all, and always available whenever the integration suite runs. Cons: it is not really external, so it proves the least of the three about the thing the recorder exists for. No unfamiliar headers, no real latency, no service that can change shape underneath you.

**Option 3: Adzuna now, the service the recorder actually exists for.** Pros: the most honest fixture, and it would be reused rather than thrown away at feature 11. Cons: it pulls feature 11's credential setup forward into feature 8, so this feature could not finish until an Adzuna account existed.

### Whether to scaffold Playwright here

**Option 1 (chosen): name Playwright and install it later.** The first feature that needs a browser installs, configures and writes the first real test together. Pros: nothing inert in the tree, no dependency carried unused across several features, no empty suite for CI to reason about, and the runner decision is binding because it is written here rather than because a config file exists. Cons: someone reading the tree rather than the spec cannot see the choice.

**Option 2: scaffold the config now with no test.** Pros: the decision is visible in the repository, and the later feature adds a test rather than standing up a tool. Cons: a config nothing runs is a config nothing keeps current, and it will be stale by the time it is first used.

## Rationale

The dominant force is the reference bug: six passing tests that all mocked the same wrong assumption. Every choice here is shaped by making that failure mode impossible. Tests run against the real local stack with real policies (the Vitest integration path), sessions are minted through the real admin API rather than mocked, and external responses are real recordings rather than hand written stubs. The bespoke recorder is preferred over MSW precisely because MSW's handler model invites writing the mock by hand again, which is the exact pattern the scope names as the failure. The same reasoning decides the cookie adapter: a test that built its own Supabase client would be a second implementation of the thing under test, so `createClient()` takes an adapter instead and the isolation proof drives the module the application drives. And it decides the shape of the Sentry work, where the transport is replaced by one the test can read rather than merely switched off, so the assertion has something real to assert against. The admin magiclink mint is preferred over `signInWithPassword` because spec 0001 reserved the secret key slot for exactly this, and it removes the dependency on the password sign in that feature 7 deletes.

The seed pool stays rather than minting everything at setup because the hosted development project needs stable, idempotent fixtures for preview sign in, and the spec 0003 follow-up explicitly hands the pool rewrite to this feature. Fresh on demand users per test handle isolation without shared state. The Sentry transport is replaced in tests, rather than merely switched off, because `failure()` reports inside its constructor and an uninitialised SDK would let every assertion about that reporting pass on an empty room. The CI job runs the real stack because a test against a mock or against shared hosted data would not prove the policy claim, which is the whole point of the isolation proof.

The engineer confirmed a new spec rather than editing spec 0001, because 0001 delegated the decision to this feature and the two specs govern different scope rows. The overlap is a delegation pointer, not a made decision.
