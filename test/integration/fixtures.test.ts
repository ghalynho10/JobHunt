import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { devOnlyAdminClient } from "../helpers/admin";
import { mintSession } from "../helpers/session";

/**
 * Spec 0004, AC-4 and AC-6: the fixture pool holds its own guarantees.
 *
 * Checked against the REAL ROWS in the real database, not by reading
 * `supabase/seed.sql` as text. A seed file that says the right thing and a
 * database holding something else is exactly the drift worth catching, and only
 * one of those two is what the application will actually meet.
 *
 * The lesson this encodes cost real time to learn. Postgres accepts any hex of
 * the right shape into a `uuid` column, while Zod's `z.uuid()` also checks the
 * RFC version and variant nibbles. An earlier fixture used
 * `aaaaaaaa-aaaa-aaaa-…`, which Postgres stored happily and the application
 * then refused to parse, rendering `response_malformed` on a deployed page. A
 * fixture the real code cannot read proves nothing.
 *
 * WHY THE PROFILE ROWS ARE READ THROUGH A SESSION AND NOT THROUGH THE ADMIN
 * CLIENT. Spec 0003 revokes every privilege on the personal data tables from
 * `service_role`, deliberately, so the secret key client cannot read
 * `public.profile` at all. Table privileges and row level security are separate
 * checks in Postgres and only the second is bypassed by BYPASSRLS. That is a
 * property worth keeping, so these tests go through a real session rather than
 * granting the secret client access to make a test convenient, and the revoke
 * itself is asserted below.
 */

/** The exact check `src/features/profile/queries.ts` applies to `profile.id`. */
const profileId = z.uuid();

/** RFC 2606 reserves `.test`; it can never resolve to a real mailbox. */
const FIXTURE_DOMAIN = ".test";

const DEV_ONE = "dev-one@example.test";
const DEV_TWO = "dev-two@example.test";
const DEV_THREE = "dev-three@example.test";
const SEEDED_EMAILS = [DEV_ONE, DEV_TWO, DEV_THREE] as const;

type SeededEmail = (typeof SEEDED_EMAILS)[number];

async function seededUsers() {
  const admin = devOnlyAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1_000 });

  expect(error).toBeNull();

  return data.users.filter((user) =>
    SEEDED_EMAILS.includes((user.email ?? "") as SeededEmail),
  );
}

describe("the seeded fixture pool", () => {
  it("holds exactly the three expected users", async () => {
    const users = await seededUsers();

    expect(users.map((user) => user.email).sort()).toEqual(
      [...SEEDED_EMAILS].sort(),
    );
  });

  it("gives every seeded user an id the application can actually parse", async () => {
    const users = await seededUsers();

    // AC-6. This is the check that had to pass before
    // `src/features/profile/queries.ts` could tighten from `z.guid()` to
    // `z.uuid()`, and the one that stops it silently regressing.
    for (const user of users) {
      expect(
        profileId.safeParse(user.id).success,
        `${user.email} has id ${user.id}, which z.uuid() refuses. Postgres will store it and the application will not parse it.`,
      ).toBe(true);
    }
  });

  it("carries no real personal identifier", async () => {
    const users = await seededUsers();

    // AC-4. Obviously fake, and on a domain that can never receive mail, so a
    // committed fixture can never leak real data or reach a real person.
    for (const user of users) {
      expect(user.email?.endsWith(FIXTURE_DOMAIN)).toBe(true);
      expect(user.email).toMatch(/^dev-(one|two|three)@example\.test$/);
    }
  });

  it("gives dev-one and dev-two a profile whose id parses", async () => {
    for (const email of [DEV_ONE, DEV_TWO]) {
      const session = await mintSession(email);
      const client = await createClient(session.jar);

      const { data, error } = await client
        .from("profile")
        .select("id, full_name")
        .maybeSingle();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(profileId.safeParse(data?.id).success).toBe(true);
      // The profile key IS the auth user id, so these must be the same value.
      // If they ever diverge, every policy on every table below it is wrong.
      expect(data?.id).toBe(session.userId);
    }
  });
});

describe("the secret key client", () => {
  /**
   * Not a fixture check, but it belongs beside one: the test above depends on
   * this revoke being in place, and a grant added later to make some other test
   * convenient would silently widen the secret key's reach without anything
   * noticing. Spec 0003 named `service_role` absent from these grants as a
   * deliberate second gate, so it is asserted rather than assumed.
   */
  it("cannot read the personal data tables at all", async () => {
    const admin = devOnlyAdminClient();

    const { data, error } = await admin.from("profile").select("id");

    expect(data).toBeNull();
    // 42501 is Postgres `insufficient_privilege`. This is the TABLE privilege
    // check refusing, which BYPASSRLS does not bypass, rather than a policy.
    expect(error?.code).toBe("42501");
  });
});
