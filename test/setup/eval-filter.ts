import type { TestProject } from "vitest/node";

/**
 * Hands the eval run's own `-t` pattern to the harness (spec 0017, AC-8).
 *
 * WHY A `globalSetup` AND NOT A READ INSIDE THE TEST. AC-8 requires every
 * report to record which filter produced it, so a partial report can never be
 * mistaken for a full one. The pattern is the runner's, and a test worker has
 * no supported way to ask for it; `provide()` here plus `inject()` there is
 * Vitest's own documented channel for exactly that. The alternative was
 * reaching into `globalThis.__vitest_worker__`, an internal that would break
 * silently on an upgrade and take the report's honesty with it.
 *
 * VERIFIED BY RUNNING IT, NOT FROM MEMORY (2026-09-08, Vitest 4.1.11): a probe
 * globalSetup printed `config.testNamePattern` as `/probe placeholder/` under
 * `vitest run --project eval -t "probe placeholder"`, and `provide` as a
 * function on the same object.
 *
 * `undefined` means no filter was given, which is a full run.
 */
declare module "vitest" {
  interface ProvidedContext {
    readonly evalTestNamePattern: string | undefined;
  }
}

/**
 * @param project The test project Vitest passes to every `globalSetup`.
 */
export function setup(project: TestProject): void {
  /**
   * `.source` rather than the `RegExp` itself: whatever is provided crosses
   * into the worker through structured serialisation, which does not carry a
   * `RegExp`. The string is also what a human wants to read in the report.
   */
  project.provide(
    "evalTestNamePattern",
    project.config.testNamePattern?.source,
  );
}
