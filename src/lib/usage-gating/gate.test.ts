import { beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * Call HISTORY, not just implementation, has to reset between tests: several
 * tests below assert `rpc` (or `readKillSwitch`) was never called, and
 * `vi.fn()`'s call log otherwise accumulates across every test in this file,
 * which is what let an earlier version of the `getClaims()` throw test below
 * fail against calls two OTHER tests made, not against anything of its own.
 */
beforeEach(() => {
  vi.clearAllMocks();
});

const KILL_SWITCH_ON: KillSwitch = {
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
    vi.mocked(readKillSwitch).mockResolvedValue(success(KILL_SWITCH_ON));

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
   * What DOES produce this exact shape, in that same `processResponse`, is
   * more reachable than this comment first said, corrected again the same
   * day on a fresh model review (`docs/reviews/2026-09-03-feat-usage-gating-kill-switch.md`):
   * a 2xx response with an EMPTY body leaves `data` and `error` both at their
   * initial `null`, no JSON parse and no error ever runs; separately, a 404
   * with an empty body hits the same outcome from the non 2xx branch, since
   * `JSON.parse("")` throws, the catch sets `status = 204` for that specific
   * case, and neither `data` nor `error` is ever assigned. Both are real,
   * verified transport behaviours (an unreachable project URL, an edge proxy
   * 404, or an empty successful body however it arose), just not ones
   * `checkUsageGate()`'s own call (which sets no `Prefer: return=minimal` and
   * targets a real, configured project) would trigger through ordinary use.
   * Proved here instead, mocking the RPC response
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

  /**
   * A shape `check_usage_gate` cannot actually produce: `configured` true and
   * a `reason` outside the closed `UsageGateReason` set. Since the Zod
   * refactor above, this fails the schema parse rather than a separate
   * `isUsageGateReason` runtime check, the same fail closed treatment as any
   * other malformed row. Uncovered before this test (fresh model review,
   * 2026-09-03): the branch that catches the database and the TypeScript
   * union drifting apart, e.g. a sixth reason shipped in the SQL without a
   * matching `UsageGateReason` member, had never run.
   */
  it("returns database_unavailable when the row's own reason is outside the closed set", async () => {
    signedInAs("user-1");
    vi.mocked(readKillSwitch).mockResolvedValue(success(KILL_SWITCH_OFF));
    rpc.mockReturnValue({
      single: () =>
        Promise.resolve({
          data: { configured: true, allowed: false, reason: "something_else" },
          error: null,
        }),
    });

    const result = await checkUsageGate("job_search");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.kind).toBe("database_unavailable");
    expect(result.severity).toBe("unexpected");
  });
});

describe("checkUsageGate: getClaims() itself throws (AC-13)", () => {
  /**
   * Binding rule 5: `getClaims()` reaches Supabase's JWKS endpoint and can
   * throw, which `attempt()` converts to `external_service_failed`, distinct
   * from the returned `error` that means an invalid or absent session. A JWKS
   * outage is a total denial of the gate, not the caller's own usage, which
   * is why `external_service_failed` belongs in AC-10's alert numerator
   * alongside `database_unavailable` and `usage_gate_misconfigured` (fresh
   * model review, 2026-09-03; this branch had never run before this test).
   */
  it("returns external_service_failed rather than an unhandled rejection", async () => {
    getClaims.mockRejectedValue(new Error("JWKS endpoint unreachable"));

    const result = await checkUsageGate("job_search");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.kind).toBe("external_service_failed");

    // The throw happens before the kill switch pre-check, so it is never
    // reached either.
    expect(rpc).not.toHaveBeenCalled();
  });
});
