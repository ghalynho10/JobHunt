import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { callTier } from "@/lib/ai/client";
import { isFailure } from "@/lib/result";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0012, AC-4 and AC-8: a zeroed `usage_cap` refuses every call to a
 * tier without ever reaching the vendor.
 *
 * LIVES HERE, NOT IN `test/integration/`, moved 2026-09-06 by `/check
 * review`: it zeroes every `ai_scoring` row in the real, shared, shipped
 * `usage_cap` table, the same rows `test/integration/model-client-router-live.test.ts`
 * calls `ai_scoring` against when `TEST_LIVE_MODEL_CALLS_ENABLED` is set.
 * `test/integration/**` files run in parallel by default, so a real vendor
 * call could have landed inside this test's zeroed window and been refused,
 * a false failure in the one run that spends real money. `groupOrder: 1`
 * (`vitest.config.mts`) starts this project only once every `integration`
 * file, live vendor test included, has already finished, which removes the
 * race structurally rather than by scheduling luck.
 *
 * THE RESTORE READS THE ORIGINAL VALUES FIRST, rather than retyping the
 * migration's numbers: a previous version hardcoded `500` / `1320` / `40000`
 * in the restore, which would have silently drifted the moment the seed
 * migration's own values changed, and used a `case` with no `else`, which
 * would have set any row shaped outside those three (scope, period) pairs to
 * `null` against a `not null` column. Reading first and restoring each
 * captured row by its own primary key avoids both.
 */

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

const { generateObject } = await import("ai");

const ROUTER_SCHEMA = z.object({ answer: z.string() });
const mintedUserIds: string[] = [];

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return mintSession(user.email);
}

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("a zeroed usage_cap refuses every call to a tier without reaching the vendor (AC-4, AC-8)", () => {
  it("returns success({ allowed: false, reason }) for ai_scoring and never calls generateObject", async () => {
    const original = await queryAsSuperuser<{
      scope: string;
      period: string;
      cap_value: number;
    }>(
      `select scope, period, cap_value from public.usage_cap
        where call_type = 'ai_scoring'`,
    );

    if (original.length === 0) {
      throw new Error(
        "No ai_scoring rows found in usage_cap; the migration seeding them may not have applied.",
      );
    }

    await queryAsSuperuser(
      `update public.usage_cap set cap_value = 0
        where call_type = 'ai_scoring'`,
    );

    try {
      const session = await freshSession("router-zero-cap");
      vi.mocked(generateObject).mockClear();

      const result = await callTier(
        "ai_scoring",
        ROUTER_SCHEMA,
        "irrelevant prompt",
        { cookieAdapter: session.jar },
      );

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      expect(result.value.allowed).toBe(false);
      expect(generateObject).not.toHaveBeenCalled();
    } finally {
      for (const row of original) {
        await queryAsSuperuser(
          `update public.usage_cap set cap_value = $1
            where call_type = 'ai_scoring' and scope = $2 and period = $3`,
          [row.cap_value, row.scope, row.period],
        );
      }
    }
  });
});
