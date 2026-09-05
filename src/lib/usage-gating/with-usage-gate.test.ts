import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success, isFailure } from "@/lib/result";

/**
 * `withUsageGate()` (spec 0013, AC-3 and AC-10; closes the gap spec 0011's own
 * Consequences flagged).
 *
 * WHAT IS ACTUALLY UNDER TEST HERE. The helper exists to make one specific
 * misuse impossible rather than merely discouraged: spending an outbound call
 * without the gate having allowed it. Spec 0011 shipped `checkUsageGate()`
 * returning a decision a caller could simply forget to read. So the assertions
 * below are mostly about a function NOT being called, which is unusual and is
 * the point: the guarantee is structural, and the only way to prove a
 * structural guarantee is to try to break it.
 *
 * `checkUsageGate` is replaced at the module boundary, which is the one
 * boundary this unit owns. Its real behaviour against the real database is
 * proved by `test/integration/usage-gating.test.ts` (spec 0011) and, through
 * this helper, by `test/integration-serial/search-listings.test.ts` (spec 0013).
 */

const checkUsageGate = vi.hoisted(() => vi.fn());

vi.mock("./gate", () => ({ checkUsageGate }));

const { withUsageGate } = await import("./with-usage-gate");

describe("withUsageGate", () => {
  /** Call counts are the assertion in several tests here, so they start clean. */
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the outbound call and returns its value when the gate allows it", async () => {
    // covers: AC-3
    checkUsageGate.mockResolvedValue(success({ allowed: true }));
    const call = vi.fn().mockResolvedValue(success(["a listing"]));

    const result = await withUsageGate("job_search", call);

    expect(call).toHaveBeenCalledOnce();
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result) && result.value.allowed) {
      expect(result.value.value).toEqual(["a listing"]);
    }
  });

  it("never runs the outbound call when the gate refuses", async () => {
    // covers: AC-3, AC-10
    checkUsageGate.mockResolvedValue(
      success({ allowed: false, reason: "account_week_cap_reached" }),
    );
    const call = vi.fn();

    const result = await withUsageGate("job_search", call);

    expect(
      call,
      "a refused call must never reach the network",
    ).not.toHaveBeenCalled();
    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.value).toEqual({
        allowed: false,
        reason: "account_week_cap_reached",
      });
    }
  });

  it("reports a refusal as a success, never as a failure", async () => {
    /**
     * covers: AC-3, and spec 0011 AC-5 through this caller. A refusal is the
     * system working as designed. Building it with `failure()` would mark the
     * active span failed and put a correct refusal into the numerator of the
     * failure rate alert, which is the exact corruption spec 0011 built this
     * shape to avoid.
     */
    checkUsageGate.mockResolvedValue(
      success({ allowed: false, reason: "kill_switch_engaged" }),
    );

    const result = await withUsageGate("job_search", vi.fn());

    expect(isFailure(result)).toBe(false);
  });

  it.each([
    "account_week_cap_reached",
    "global_day_cap_reached",
    "global_month_cap_reached",
    "kill_switch_engaged",
    "kill_switch_unavailable",
  ] as const)(
    "passes through the %s refusal reason unchanged",
    async (reason) => {
      // covers: AC-3, all five reasons the search page must render verbatim
      checkUsageGate.mockResolvedValue(success({ allowed: false, reason }));

      const result = await withUsageGate("job_search", vi.fn());

      expect(isFailure(result)).toBe(false);
      if (!isFailure(result) && !result.value.allowed) {
        expect(result.value.reason).toBe(reason);
      }
    },
  );

  it("never runs the outbound call when the gate itself fails", async () => {
    /**
     * covers: AC-3. Distinct from a refusal: the gate BROKE rather than said
     * no. Fail closed, so a database outage cannot become free, ungated
     * spending against a paid API.
     */
    checkUsageGate.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "Could not reach the database.",
      }),
    );
    const call = vi.fn();

    const result = await withUsageGate("job_search", call);

    expect(call).not.toHaveBeenCalled();
    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("database_unavailable");
  });

  it("propagates a failure from the outbound call itself", async () => {
    // covers: AC-5. Adzuna broke after the gate allowed the spend.
    checkUsageGate.mockResolvedValue(success({ allowed: true }));
    const call = vi.fn().mockResolvedValue(
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "Could not reach Adzuna.",
      }),
    );

    const result = await withUsageGate("job_search", call);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("external_service_failed");
  });

  it("checks the gate exactly once per call, never twice", async () => {
    // covers: AC-10. Two checks would double count against the weekly cap.
    checkUsageGate.mockResolvedValue(success({ allowed: true }));

    await withUsageGate("job_search", vi.fn().mockResolvedValue(success([])));

    expect(checkUsageGate).toHaveBeenCalledOnce();
  });

  it("passes the call type and the cookie adapter through to the gate", async () => {
    /**
     * The test seam spec 0004 requires. If the adapter were dropped here, every
     * integration test would silently check the gate as nobody, and the real
     * session tests would prove nothing.
     */
    checkUsageGate.mockResolvedValue(success({ allowed: true }));
    const jar = { getAll: () => [], setAll: () => {} };

    await withUsageGate(
      "job_search",
      vi.fn().mockResolvedValue(success([])),
      jar,
    );

    expect(checkUsageGate).toHaveBeenCalledWith("job_search", jar);
  });
});
