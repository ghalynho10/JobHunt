import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { checkFitScore } from "@/features/scoring/check";
import type { Listing } from "@/features/search/adzuna";
import { isFailure } from "@/lib/result";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0019, AC-7 and AC-9: a zeroed `ai_check` cap makes `checkFitScore()`
 * REFUSE rather than FAIL, which is the shape AC-9's whole argument rests on.
 *
 * LIVES IN `test/integration-serial/`, NOT `test/integration/`, and that is
 * structural rather than tidy. It mutates the real, shared, shipped
 * `usage_cap` rows. `test/integration/**` runs its files in parallel, so a
 * cap-mutating file dropped there would zero the budget underneath dozens of
 * other files, including the live vendor tests that spend real money, and
 * refuse them for reasons that have nothing to do with what they assert. This
 * project runs at `sequence.groupOrder: 1`, so it starts only once every
 * `integration` file has finished, and at `fileParallelism: false`, so files
 * inside it cannot race each other either (`vitest.config.mts`; the second
 * was added 2026-09-04 after a fresh model review found the one file
 * invariant was prose only). `model-client-router-usage-cap.test.ts` is the
 * file this one follows.
 *
 * THE RESTORE IS A REAL TEARDOWN, NOT A `finally` IN THE TEST BODY, which is
 * the one place this file deliberately differs from the file it follows. A
 * `finally` covers a failing assertion but not a `beforeAll` that throws
 * partway, and Vitest runs `afterAll` even when `beforeAll` threw, which this
 * repository already learned the expensive way in spec 0017's review. The
 * stakes here are specific: a run that left `ai_check` capped at 0 would make
 * every later check refuse, and a refusal renders as this feature's own AC-7
 * unverifiable state, so the whole app would read as a broken feature rather
 * than as a dirty fixture. The captured rows live at module scope precisely
 * so the teardown can reach them whatever happened in between.
 *
 * IT RESTORES BY READING FIRST, never by retyping the migration's numbers,
 * for the reason the file it follows records: hardcoding the seeded values
 * silently drifts the moment the seed changes.
 */

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

const { generateObject } = await import("ai");

interface CapRow {
  readonly scope: string;
  readonly period: string;
  readonly cap_value: number;
}

/** Module scope, so the teardown can restore whatever `beforeAll` managed. */
let originalCaps: readonly CapRow[] = [];
const mintedUserIds: string[] = [];

const listing: Listing = {
  source: "adzuna",
  sourceJobId: "cap-refusal",
  title: "Senior Backend Engineer, Payments",
  companyName: "Contoso",
  location: "Berlin",
  url: "https://www.adzuna.com/land/ad/cap-refusal",
  descriptionSnippet: "You will work in Go against PostgreSQL…",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: undefined,
  salaryIsPredicted: false,
  postedAt: undefined,
};

beforeAll(async () => {
  originalCaps = await queryAsSuperuser<CapRow>(
    `select scope, period, cap_value from public.usage_cap
      where call_type = 'ai_check'`,
  );

  if (originalCaps.length === 0) {
    throw new Error(
      "No ai_check rows found in usage_cap; the migration seeding them may not have applied.",
    );
  }

  await queryAsSuperuser(
    `update public.usage_cap set cap_value = 0 where call_type = 'ai_check'`,
  );
});

afterAll(async () => {
  for (const row of originalCaps) {
    await queryAsSuperuser(
      `update public.usage_cap set cap_value = $1
        where call_type = 'ai_check' and scope = $2 and period = $3`,
      [row.cap_value, row.scope, row.period],
    );
  }

  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return mintSession(user.email);
}

describe("a zeroed ai_check cap (spec 0019, AC-7, AC-9)", () => {
  it("refuses as a Result success carrying allowed false, never as a Failure", async () => {
    /**
     * SPEC 0012'S KEY INVARIANT, REACHED THROUGH THIS FEATURE'S OWN FUNCTION.
     * `check.test.ts` proves the passthrough against a CONSTRUCTED refusal;
     * this drives the real gate. If a cap reached came back as a `Failure` it
     * would land in `ai.call_tier`'s failure ratio and page somebody for the
     * budget working exactly as designed, and AC-9's decision to add no page
     * level notice for a check refusal would rest on a shape that no longer
     * exists.
     */
    const session = await freshSession("check-zero-cap");
    vi.mocked(generateObject).mockClear();

    const result = await checkFitScore(listing, ["Go"], session.jar);

    if (isFailure(result)) {
      throw new Error(
        `Expected a refusal (Result success carrying allowed:false), got a Failure: ${result.kind}.`,
      );
    }

    expect(result.value.allowed).toBe(false);

    /** The gate stopped it, so no vendor was reached and nothing was spent. */
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("names which cap was reached rather than a generic refusal", async () => {
    /**
     * The reason travels to the card as AC-7's unverifiable state today, but
     * it is also what AC-9's own escape hatch depends on: the four named ways
     * that assumption can break are all about WHICH budget ran out, and a
     * refusal that did not say could not be acted on.
     */
    const session = await freshSession("check-zero-cap-reason");

    const result = await checkFitScore(listing, ["Go"], session.jar);

    if (isFailure(result) || result.value.allowed) {
      throw new Error("Expected a refusal.");
    }

    expect(typeof result.value.reason).toBe("string");
    expect(result.value.reason.length).toBeGreaterThan(0);
  });
});
