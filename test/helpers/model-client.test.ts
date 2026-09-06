import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { liveModelCallsEnabled } from "./model-client";

/**
 * The gate on real vendor money (spec 0012, "Critical test scenarios").
 *
 * NOTHING IS MOCKED, following `test/helpers/database.test.ts`: `vi.stubEnv`
 * changes the real variable and the helper reads the real `process.env`.
 * A stubbed guard would be the mock encoding the same assumption as the code
 * under test that this project's testing rule forbids.
 */

beforeEach(() => {
  vi.stubEnv("TEST_LIVE_MODEL_CALLS_ENABLED", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("liveModelCallsEnabled()", () => {
  /**
   * THE ONE THAT MATTERS. It defaults to false, so an environment that never
   * sets it runs the ordinary, free path rather than spending real money.
   */
  it("is false when the flag is absent", () => {
    expect(liveModelCallsEnabled()).toBe(false);
  });

  it("is false when the flag is explicitly false", () => {
    vi.stubEnv("TEST_LIVE_MODEL_CALLS_ENABLED", "false");

    expect(liveModelCallsEnabled()).toBe(false);
  });

  it("is true when the flag is explicitly true", () => {
    vi.stubEnv("TEST_LIVE_MODEL_CALLS_ENABLED", "true");

    expect(liveModelCallsEnabled()).toBe(true);
  });

  /**
   * A malformed value is treated the same as unset, never as true. Reading
   * it as false would fail in the safe direction and still be the wrong
   * shape: the variable would look set and not be, the same reasoning
   * `src/env.ts` and `test/helpers/database.ts` give for every boolean flag
   * they parse.
   */
  it("is false for a value that is not a recognised boolean spelling", () => {
    vi.stubEnv("TEST_LIVE_MODEL_CALLS_ENABLED", "yes-please");

    expect(liveModelCallsEnabled()).toBe(false);
  });

  it.each(["1", "yes", "on"])(
    "recognises %s as a true spelling",
    (spelling) => {
      vi.stubEnv("TEST_LIVE_MODEL_CALLS_ENABLED", spelling);

      expect(liveModelCallsEnabled()).toBe(true);
    },
  );

  it.each(["0", "no", "off"])(
    "recognises %s as a false spelling",
    (spelling) => {
      vi.stubEnv("TEST_LIVE_MODEL_CALLS_ENABLED", spelling);

      expect(liveModelCallsEnabled()).toBe(false);
    },
  );
});
