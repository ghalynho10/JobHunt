## Context

Feature 15 (spec 0016) authored sixteen profile and posting pairs with a band decided in advance from the rubric's own wording, and committed them as typed data under `src/features/scoring/eval/`. Nothing runs them yet. Spec 0016's own Follow up handed this feature three decisions it had to settle before it could be built: how many times a pair reruns before a mismatch counts as a real regression rather than ordinary model noise, since `ai_scoring` leaves `temperature` unset and the provider's own default is not guaranteed deterministic; what counts as a pass for the one pair tagged `stability-probe`, whose whole point is that a single run's band is not a confident answer; and what the `tags` values and the presence of `acceptableBands` should mean to this harness's own pass or fail logic, since spec 0016 defined the data's shape only, never its interpretation.

Two constraints outside that named list turned out to shape the build as much as those three did. First, the only real, application shaped way to call the scorer is `scoreListing()` (`src/features/scoring/score.ts`), and that function's whole call path runs through `checkUsageGate()`, which needs a real, verified session; the code that mints one for a test (`mintFixtureUser`, `mintSession`) lives under `test/`, deliberately outside `src/`, because root `AGENTS.md` forbids an application module importing a test helper. Whatever calls the real scorer for this feature has to live somewhere that can reach those helpers, or duplicate their session minting logic from nothing. Second, a full run of the committed set at multiple reruns per pair is a real, repeatable vendor spend (sixteen pairs times some number of reruns), which is small against `ai_scoring`'s own weekly account cap (500, `supabase/migrations/20260906120000_model_client_router_usage_cap.sql`) but not free, and the account cap was already exhausted once, during feature 14's manual verification on 2026-09-07, by repeated real calls in one session. Wherever this command lives, it must be impossible to trigger by accident from an existing free command, and cheap to run against one pair at a time while it is being debugged.

The consequence of not deciding any of this is that feature 15's authored data stays inert: spec 0015's own AC-2 (whether the five bands actually spread real listings) has no evidence to run against, and a future prompt or model change to the scorer has no check beside a human's fresh read of the output.

## Options considered

### Option 1: A new Vitest test file inside the existing `integration-serial` project

Add `test/integration-serial/eval-harness.test.ts`, reusing that project's existing real Supabase stack requirement and its `groupOrder` isolation from the ordinary `integration` project.

**Pros**:
- No new Vitest project to configure; the module resolution (`@/*` aliases, the `server-only` stub) and the stack requirement are already wired for this project.
- Sits beside `model-client-router-usage-cap.test.ts`, which already manipulates the real `usage_cap` table for `ai_scoring`, so the precedent for a file in this project spending real money under a gate is already there.

**Cons**:
- `integration-serial` exists for exactly one reason, per its own file comment: isolating tests that mutate a single shared global row (the kill switch) from the rest of the parallel `integration` project. This feature mutates nothing global; folding it in here borrows an isolation mechanism built for a different problem.
- `pnpm test:integration` runs both `integration` and `integration-serial` unconditionally. A file that spends 16 or more real vendor calls landing in either of those projects means the ordinary integration run, the one CI itself runs on every push, would start spending real money unless it were re gated behind its own separate flag anyway, which is a second safety mechanism layered onto a project this feature does not otherwise need.

### Option 2: A plain script under `test/`, run directly by Node

`test/eval/harness.ts`, invoked as `node --experimental-strip-types test/eval/harness.ts` or through the `tsx` dev dependency, with its own `pnpm eval` script.

**Pros**:
- Full, direct control over the run loop, the rerun ordering, and the report format, with no test runner's own scheduling model in between.
- No new Vitest project or config block to maintain.

**Cons**:
- Every module this feature needs to import, `scoreListing()`, `TIERS`, `mintFixtureUser`, transitively pulls in the `@/*` path aliases the whole application uses, and `scoreListing()` itself imports the `server-only` package, whose default export throws outside a React Server Component context. `vitest.config.mts` already solves both (`tsconfigPaths: true`, and an alias pointing `server-only` at a stub, with its own comment explaining why); a plain script re-solves both from nothing, either by duplicating that resolution logic or by pulling in a bundler.
- Node 24's own native TypeScript stripping (no flag needed as of 24.18, this project's pinned version) removes the case for `tsx` as a dependency, but does not remove the path alias or `server-only` problem above.

### Option 3: A dedicated `eval` Vitest project (chosen)

A fourth project in `vitest.config.mts` (`unit`, `integration`, `integration-serial` already exist), `test/eval/**/*.test.ts`, reusing the shared `resolve.alias`/`tsconfigPaths` config and the same `require-stack` global setup, run only through its own explicit `pnpm eval` script (`vitest run --project eval`).

**Pros**:
- Reuses every piece of module resolution and stack requirement Option 1 reuses, without inheriting `integration-serial`'s unrelated isolation reason or its place inside `pnpm test:integration`'s unconditional run.
- `pnpm test` (`--project unit`) and `pnpm test:integration` (`--project integration --project integration-serial`) both name their projects explicitly; a fourth project is invisible to both unless a project ever runs Vitest with no `--project` filter at all, which nothing in this repository does today (Follow up flags this as worth revisiting if that ever changes).
- The rerun and aggregate logic this feature needs (five sequential calls per pair, a majority vote, a cross pair consistency check) is an imperative loop with its own verdict function, not naturally sixteen independent assertions; a dedicated file free to shape its own `describe`/`it` structure (one `it.concurrent` per pair, an internal sequential loop for its five reruns) fits that better than either alternative forces it to.

**Cons**:
- One more project block in `vitest.config.mts` to read and maintain, on top of the three that already exist there.
- `it.concurrent`'s scheduling and `maxConcurrency` bound how many pairs run at once, not how many individual vendor calls are in flight at once across those pairs (an accepted, named trade off in the spec's Consequences), which a purpose built script (Option 2) could have controlled more precisely at the cost of everything Option 2's own Cons describe.

## Rationale

Option 3 wins primarily on reuse: it is the only option that gets the `@/*` alias resolution and the `server-only` stub for free (ruling out Option 2, whose real cost is re solving both from scratch, not the runner it uses) while not inheriting a project boundary built for an unrelated problem (ruling out Option 1, whose `integration-serial` isolation exists specifically for the kill switch's shared global row, and whose inclusion in `pnpm test:integration`'s unconditional run is exactly the accidental spend path this feature has to avoid). The one real cost Option 3 pays, a fourth Vitest project block, is small and one time, against a real, ongoing win: this feature can never be swept into an existing free command by accident, because no existing command names `--project eval`.

The three decisions spec 0016 itself asked this spec to settle (rerun count, the stability probe's pass rule, and what `tags`/`acceptableBands` mean to pass or fail) were not treated as a second, separate decision needing its own Options considered: they were settled directly, through the engineer's own review of each rule's actual cost and failure mode (a 5 rerun majority over an adaptive scheme, because the adaptive scheme was shown to make a genuinely borderline pair more likely to pass than fail; the stability probe's own `acceptableBands` reused rather than a general variance threshold, which the engineer's own check showed was miscalibrated against the real 2026-09-06 observation this pair reproduces), and are written directly into `## Feature design` and `## Requirements` as the settled contract, not re litigated here as alternatives.
