import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest, as three projects (spec 0004, AC-5 and AC-12; the third added spec
 * 0011, 2026-09-03).
 *
 * `pnpm test` runs the unit project and needs nothing running.
 * `pnpm test:integration` runs BOTH integration projects against the real
 * local Supabase stack, with the real policies applied: `integration` (the
 * ordinary one, files run in parallel by Vitest's own default) and
 * `integration-serial` (`test/integration-serial/`, `sequence.groupOrder: 1`,
 * so it starts only once every `integration` file has finished).
 *
 * WHY A SECOND INTEGRATION PROJECT EXISTS. `app_settings.kill_switch_enabled`
 * is a single global row (spec 0002), and `checkUsageGate()` reads it on
 * every call, from every file. Vitest's default file parallelism means any
 * committed test that flips that row races every OTHER integration file's
 * concurrent gate calls, not just one assertion in one file; this was tried
 * and reproducibly broke an unrelated test (spec 0011, Follow-up). Rather
 * than serialising the whole `integration` project with `fileParallelism:
 * false`, a real, ongoing cost paid by every file whether it needs isolation
 * or not, `groupOrder` isolates the files that actually need it from
 * `integration`'s own files: they run after that parallel group drains, so
 * nothing in `integration` races them. `groupOrder` is a real Vitest 4.1.11
 * option (verified in its own shipped types), not a workaround.
 *
 * WHAT `groupOrder` DOES NOT DO: isolate the files INSIDE `integration-serial`
 * FROM EACH OTHER. It orders projects, not files, and Vitest still schedules
 * this project's own files in parallel by default, the same as `integration`
 * does internally. Two files here raced each other on the first attempt
 * (confirmed 2026-09-03), which is why this project's own `fileParallelism:
 * false` was added below (2026-09-04, a second fresh model review): it forces
 * `integration-serial`'s `maxWorkers` to 1, so a second file here would run
 * after the first rather than beside it. The scenarios below still live in
 * one file, `test/integration-serial/shared-global-state.test.ts`, but that
 * is the simpler default now, not the only safe option: `fileParallelism`
 * makes a second file correct by construction, the comment does not have to
 * be the thing keeping it safe. See that file's own comment for the fuller
 * account.
 *
 * No end to end runner is configured here. Playwright is the recorded choice
 * (spec 0004) and is installed by the first feature that genuinely needs a
 * browser, together with its first real test. A config with no test proves
 * nothing today and would have to be kept current until something ran it.
 */

/**
 * Spec 0004, "Module resolution under Vitest". See the stub itself for why the
 * `server-only` marker has to be neutralised, and why an alias is used rather
 * than `resolve.conditions`.
 */
const serverOnlyStub = fileURLToPath(
  new URL("./test/stubs/server-only.ts", import.meta.url),
);

/**
 * Ordered, and the order is load bearing: `load-env` populates `process.env`
 * before `vitest-setup` (or anything it imports) can reach `src/env.ts`, which
 * validates the whole contract at import time.
 */
const setupFiles = ["./test/setup/load-env.ts", "./test/setup/vitest-setup.ts"];

export default defineConfig({
  resolve: {
    /**
     * Resolves the `@/*` paths from tsconfig.json, so a test imports the same
     * specifier the application does. Vite does this natively now and says so
     * out loud when the `vite-tsconfig-paths` plugin is present, which is why
     * that plugin is not installed.
     */
    tsconfigPaths: true,
    alias: {
      "server-only": serverOnlyStub,
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          /**
           * `node`, not jsdom, even though Next.js's own Vitest guide suggests
           * jsdom throughout. That guide is written for component tests. No
           * test here renders a component yet, and jsdom would only add a
           * dependency nothing uses. The first test that does render one opts
           * in per file with a `// @vitest-environment jsdom` docblock and
           * installs jsdom then, the same just in time rule the project applies
           * to every other library.
           */
          environment: "node",
          /**
           * Colocated with the code they prove, per the folder by feature rule:
           * a feature's tests are that feature's code. `test/helpers` is the
           * exception that proves it, since the helpers themselves live there.
           */
          include: ["src/**/*.test.{ts,tsx}", "test/helpers/**/*.test.ts"],
          setupFiles,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          /**
           * `node` IS REQUIRED HERE, not a preference. `@t3-oss/env-nextjs`
           * refuses to hand out a server variable when it believes it is on the
           * client, and jsdom is exactly what makes it believe that, so
           * `env.SUPABASE_SECRET_KEY` would be unreachable inside the session
           * mint and the whole integration thread would fail for a reason that
           * looks nothing like its cause.
           */
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          setupFiles,
          /**
           * AC-12: a stack that is not running has to say so once, clearly,
           * naming the command that fixes it, rather than surfacing as a wall
           * of `fetch failed` from every test at once.
           */
          globalSetup: ["./test/setup/require-stack.ts"],
          /**
           * These talk to a real database over a real socket. The default 5s is
           * enough until the stack is cold, and a timeout there reads as a test
           * failure rather than as the slow start it is.
           */
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "integration-serial",
          environment: "node",
          /**
           * A SEPARATE TOP LEVEL DIRECTORY, not a subfolder under
           * `test/integration/`: that project's own `include` is
           * `test/integration/**`, which would also match a subfolder and pull
           * every file here into both projects at once.
           */
          include: ["test/integration-serial/**/*.test.ts"],
          setupFiles,
          globalSetup: ["./test/setup/require-stack.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          /**
           * THE WHOLE REASON THIS PROJECT EXISTS. Group 0 is every other
           * project's implicit default; this project alone is group 1, so
           * Vitest runs it only after group 0 has fully finished. That orders
           * this project relative to `integration`, not its own files
           * relative to EACH OTHER: `include` above deliberately matches one
           * file, `shared-global-state.test.ts`, because Vitest still
           * schedules multiple files within one project in parallel by
           * default, and two files here raced each other on the first
           * attempt. See this file's own top comment and that file's own
           * comment for the fuller account.
           */
          sequence: {
            groupOrder: 1,
          },
          /**
           * THE MECHANICAL BACKSTOP `groupOrder` ABOVE DOES NOT PROVIDE.
           * Corrected 2026-09-04, a second fresh model review, after the
           * first review caught the missing enforcement: without this, the
           * one-file invariant this project depends on is prose only, since
           * `include` matches any file dropped in here, and a second one
           * would run in parallel with the first, the exact race this
           * project exists to prevent. `fileParallelism: false`, scoped to
           * THIS project alone, forces its own `maxWorkers` to 1 (verified
           * in the installed Vitest's own config resolution), which costs
           * nothing while this project holds one file and makes a second
           * file correct by construction rather than by a comment someone
           * has to read first. This is deliberately NOT set on `integration`
           * above: there it would serialise dozens of files for no benefit,
           * which is why `groupOrder` exists as the cheaper isolation
           * between the two projects in the first place.
           */
          fileParallelism: false,
        },
      },
    ],
  },
});
