import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest, as two projects (spec 0004, AC-5 and AC-12).
 *
 * `pnpm test` runs the unit project and needs nothing running.
 * `pnpm test:integration` runs the integration project against the real local
 * Supabase stack, with the real policies applied.
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
           * These talk to a real database over a real socket. The default 5s is
           * enough until the stack is cold, and a timeout there reads as a test
           * failure rather than as the slow start it is.
           */
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
