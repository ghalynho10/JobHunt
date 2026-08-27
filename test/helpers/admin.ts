import { createSecretClient } from "@/lib/supabase/secret";
import { env } from "@/env";

/**
 * The privileged development only path for the test layer (spec 0004).
 *
 * BINDING RULE 1 (spec 0001), CALLER 1. This module is the test layer's single
 * point of contact with the secret key client, so the test session mint and the
 * on demand fixture user mint share one guard rather than each carrying their
 * own copy of it.
 *
 * IT LIVES UNDER `test/`, OUTSIDE `src/`, AND THAT IS A SECURITY DECISION
 * RATHER THAN A FILING PREFERENCE. The `no-restricted-imports` rule in
 * `eslint.config.mjs` stops anything under `src/app` importing the secret
 * module directly, and it would NOT have stopped `src/app` importing a mint
 * placed under `src/lib/testing`, which imports that module transitively.
 * Rather than extend the rule to chase that path, the mint is kept out of the
 * application's module graph entirely, where the path cannot exist to be
 * blocked. A structural guarantee beats a pattern list that has to be kept
 * complete.
 *
 * There is also no HTTP route anywhere that reaches this. Tests call it
 * directly.
 */

/**
 * Thrown when the mint is asked to work outside development.
 *
 * A named class rather than a bare `Error`, so a test asserts on the refusal
 * itself instead of matching a message that a later edit could reword.
 *
 * This deliberately THROWS rather than returning a `failure()`. Binding rule 2
 * is about the application's own expected failures; being asked to mint a
 * session on a deployed site is a programmer bug, and a bug should throw and
 * keep its stack rather than become a value some caller might ignore.
 */
export class DevSessionDisabledError extends Error {
  constructor() {
    super(
      "DEV_SESSION_ENABLED is not true, so no session may be minted. This path uses the secret key, which skips every row level security policy, and it is blocked anywhere it is not explicitly switched on.",
    );
    this.name = "DevSessionDisabledError";
  }
}

/**
 * Returns a secret key client, and only where development is explicitly on.
 *
 * FAILS CLOSED (AC-3). `DEV_SESSION_ENABLED` defaults to false in `src/env.ts`,
 * so an environment that simply never sets it is refused. That is the whole
 * guarantee: the secret key path can never mint a session on a deployed site,
 * because absent means blocked rather than blocked meaning absent.
 *
 * The guard is read at CALL time, not at import time. Read at import, a test
 * could never observe the refusal without a separate process, and the thing
 * AC-3 asks to be proved would go unproved.
 */
export function devOnlyAdminClient() {
  if (!env.DEV_SESSION_ENABLED) throw new DevSessionDisabledError();

  return createSecretClient();
}
