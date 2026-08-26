import { randomUUID } from "node:crypto";

import { devOnlyAdminClient } from "./admin";

/**
 * On demand fixture users (spec 0004, AC-11).
 *
 * TESTS THAT WRITE DATA GET A FRESH USER EACH, so no test can contaminate
 * another. The fixed pool in `supabase/seed.sql` stays read only and serves the
 * isolation proof, which needs two stable identities to compare.
 *
 * Also AC-4: nothing minted here carries a real personal identifier. The
 * address is generated onto the reserved `.test` domain, which can never
 * resolve to a real mailbox, and the id comes from `randomUUID()`, which is a
 * version 4 UUID by definition and so satisfies `z.uuid()` without anybody
 * having to hand write nibbles correctly.
 */

/** The reserved domain from RFC 2606. It can never resolve to a real mailbox. */
const FIXTURE_DOMAIN = "example.test";

export interface FixtureUser {
  readonly id: string;
  readonly email: string;
}

/**
 * Creates a brand new confirmed user and returns it.
 *
 * `email_confirm: true` matters: an unconfirmed user cannot complete the
 * magiclink exchange in `mintSession()`, so the mint would fail for a reason
 * that looks nothing like its cause.
 *
 * @param prefix A readable label so a leftover row names the test that made it.
 */
export async function mintFixtureUser(
  prefix = "fixture",
): Promise<FixtureUser> {
  const admin = devOnlyAdminClient();

  /**
   * The id half of `randomUUID()` is what makes the address unique, so two
   * tests running in the same millisecond cannot collide on the email unique
   * constraint the way a timestamp or a counter would.
   */
  const email = `${prefix}-${randomUUID()}@${FIXTURE_DOMAIN}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(
      `Could not mint a fixture user ${email}: ${error?.message ?? "no user returned"}.`,
    );
  }

  return { id: data.user.id, email };
}

/**
 * Deletes a minted user and everything cascading from it.
 *
 * Called from a test's own cleanup. A test is still correct without it, since
 * every minted user is unique, but a local database would otherwise accumulate
 * a row per test run forever.
 */
export async function deleteFixtureUser(id: string): Promise<void> {
  const admin = devOnlyAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    throw new Error(
      `Could not delete the fixture user ${id}: ${error.message}.`,
    );
  }
}
