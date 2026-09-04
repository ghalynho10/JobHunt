import { describe, expect, it, vi } from "vitest";

import type { KillSwitch } from "@/lib/kill-switch";
import { failure, success } from "@/lib/result";

/**
 * Spec 0011, AC-4 and AC-5: the kill switch pre-check short circuits
 * `checkUsageGate()` before `check_usage_gate` is ever called.
 *
 * A UNIT TEST, DELIBERATELY, mocking `readKillSwitch()` and the session check,
 * unlike the rest of this feature's proof in
 * `test/integration/usage-gating.test.ts`. `readKillSwitch()`'s own
 * correctness is already proved against the real row in
 * `test/integration/kill-switch.test.ts`; mocking it here does not re-encode
 * that assumption, it isolates the one thing this test is actually about,
 * `checkUsageGate()`'s own branching. It also avoids a real hazard: engaging
 * the real, single, global `app_settings` row from an integration test would
 * race every other integration file reading it concurrently, `kill-switch.test.ts`
 * included, since Vitest runs integration files in parallel against the same
 * local stack.
 */

const rpc = vi.fn();
const getClaims = vi.fn();

vi.mock("@/lib/kill-switch", () => ({
  readKillSwitch: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims },
    rpc,
  })),
}));

const { readKillSwitch } = await import("@/lib/kill-switch");
const { checkUsageGate } = await import("./gate");

const A_KILL_SWITCH_STATE: KillSwitch = {
  enabled: true,
  updatedAt: "2026-09-02T00:00:00+00:00",
};

const KILL_SWITCH_OFF: KillSwitch = {
  enabled: false,
  updatedAt: "2026-09-02T00:00:00+00:00",
};

function signedInAs(userId: string): void {
  getClaims.mockResolvedValue({
    data: { claims: { sub: userId } },
    error: null,
  });
}

describe("checkUsageGate: the kill switch pre-check (AC-4, AC-5)", () => {
  it("refuses with kill_switch_engaged when the read succeeded and the switch is on", async () => {
    signedInAs("user-1");
    vi.mocked(readKillSwitch).mockResolvedValue(success(A_KILL_SWITCH_STATE));

    const result = await checkUsageGate("job_search");

    // AC-5: a refusal is `success({ allowed: false, reason })`, never a
    // `Failure` — the gate working as designed must not mark its own span
    // failed.
    expect(result).toEqual({
      ok: true,
      value: { allowed: false, reason: "kill_switch_engaged" },
    });

    // The block happened before `check_usage_gate` was ever reached, so no
    // window was touched at all.
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses with kill_switch_unavailable, distinct from engaged, when the read itself failed", async () => {
    signedInAs("user-1");
    vi.mocked(readKillSwitch).mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "The kill switch read failed.",
      }),
    );

    const result = await checkUsageGate("job_search");

    expect(result).toEqual({
      ok: true,
      value: { allowed: false, reason: "kill_switch_unavailable" },
    });

    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("checkUsageGate: a response with neither data nor an error (AC-14)", () => {
  /**
   * `{ data: null, error: null }` is not reachable through `check_usage_gate`'s
   * OWN call: the function always emits exactly one row via
   * `return query select ...`, and a real cardinality violation is enforced
   * server side by PostgREST itself, not by this client. Corrected 2026-09-03:
   * this comment previously said PostgREST's client turns zero or multiple
   * rows into a `PGRST116` error for `.single()`, which is not what the
   * installed `@supabase/postgrest-js` 2.112.3 does (verified in its source,
   * `PostgrestBuilder.processResponse()`): that client side `PGRST116` check
   * only runs when `isMaybeSingle` is set, which is `.maybeSingle()`'s own
   * flag; `.single()` never sets it.
   *
   * What DOES produce this exact shape, in that same `processResponse`, is a
   * 2xx response with an EMPTY body: `data` and `error` both stay at their
   * initial `null`, no JSON parse and no error ever runs. That is a real,
   * verified transport behaviour, just not one `checkUsageGate()`'s own call
   * (which sets no `Prefer: return=minimal` and no such header) would trigger
   * through ordinary use. Proved here instead, mocking the RPC response
   * directly at the client boundary, because it is `checkUsageGate()`'s own
   * defensive read under test: `attempt()` only converts a thrown exception,
   * and this shape is neither a thrown exception nor a populated `error`, so
   * a caller reading only `configured`/`allowed`/`reason` off `row` would see
   * nothing and decide nothing at all, which is a silent open rather than a
   * fail closed one.
   */
  it("returns database_unavailable rather than an absent, harmless decision", async () => {
    signedInAs("user-1");
    vi.mocked(readKillSwitch).mockResolvedValue(success(KILL_SWITCH_OFF));
    rpc.mockReturnValue({
      single: () => Promise.resolve({ data: null, error: null }),
    });

    const result = await checkUsageGate("job_search");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.kind).toBe("database_unavailable");
    expect(result.severity).toBe("unexpected");
  });
});
