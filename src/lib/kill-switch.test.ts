import { describe, expect, it } from "vitest";

import { isKillSwitchEngaged, type KillSwitch } from "./kill-switch";
import { failure, success, type FailureKind, type Result } from "./result";

/**
 * Spec 0002, INVARIANT 3: the kill switch fails closed.
 *
 * `isKillSwitchEngaged()` is one line, and getting it backwards is the most
 * expensive single character mistake available in this repository. The switch
 * exists to stop uncontrolled external API spend, which the scope names as the
 * risk that may never be traded away for time. Feature 10's gate calls this on
 * every metered call.
 *
 * WHY THIS IS WORTH A TEST WHEN THE FUNCTION IS TRIVIAL. It fails INVISIBLY.
 * Every other guard in this project fails loudly: a broken read renders a named
 * failure, a policy denial is a hard refusal. Flip the `||` here and nothing
 * breaks, nothing renders wrong and no alert fires. The application keeps
 * working and keeps spending, and the first symptom is a bill.
 *
 * A unit test, deliberately: the whole point is that the decision is made
 * without asking anything, so a test needing the stack would be proving the
 * wrong thing. `readKillSwitch()`, which does reach the database, is proved
 * against the real stack in `test/integration/kill-switch.test.ts`.
 */

/** A read that genuinely reached the row, with the switch in the given state. */
function readSaying(enabled: boolean): Result<KillSwitch> {
  return success<KillSwitch>({
    enabled,
    // Raw, as stored. The project formats at render, never before.
    updatedAt: "2026-08-21T12:00:00+00:00",
  });
}

describe("the kill switch fails closed", () => {
  it("stands down only when the read succeeded and the switch is off", () => {
    /**
     * The one and only path to proceeding. If any other case below also
     * returned false, the switch would have a way to be bypassed.
     */
    expect(isKillSwitchEngaged(readSaying(false))).toBe(false);
  });

  it("engages when the read succeeded and the switch is on", () => {
    expect(isKillSwitchEngaged(readSaying(true))).toBe(true);
  });

  /**
   * Every kind `readKillSwitch()` can return, one case each, rather than one
   * representative failure. A future edit that special cased a single kind as
   * "probably fine" would pass a test that only checked one of them.
   */
  const failureKinds = [
    "database_unavailable",
    "record_not_found",
    "response_malformed",
  ] as const satisfies readonly FailureKind[];

  it.each(failureKinds)(
    "engages when the read failed with %s, because a failed read is not permission to proceed",
    (kind) => {
      const failed: Result<KillSwitch> = failure({
        kind,
        severity: "unexpected",
        message: `The kill switch read failed with ${kind}.`,
      });

      /**
       * Spec 0002, AC-8. A failure must not read as "off". A deliberate flip
       * and a broken read are different events, and only one of them is the
       * system working, but both have to stop the spending.
       */
      expect(isKillSwitchEngaged(failed)).toBe(true);
    },
  );
});
