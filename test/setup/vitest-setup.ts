/**
 * Runs before every test file, in both projects (spec 0004, AC-10).
 *
 * `test/setup/load-env.ts` is listed ahead of this one in `setupFiles` and is
 * not imported from here, so that the environment is populated before this
 * module's own import graph is evaluated.
 */
import { beforeEach } from "vitest";

import { installInMemorySentry, resetCapturedEvents } from "./sentry-transport";

installInMemorySentry();

/**
 * Reset before each test rather than after, so a test always starts from a
 * known empty state even when the test before it failed part way through and
 * never reached its own cleanup.
 */
beforeEach(() => {
  resetCapturedEvents();
});
