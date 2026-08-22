import "server-only";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createSecretClient } from "@/lib/supabase/secret";

/**
 * The global kill switch: one row in Postgres, flipped from the Supabase
 * dashboard, stopping every gated call with no deploy and no build.
 *
 * Spec 0002, invariant 4: this is the ONLY module that reads `app_settings`, and
 * it is the caller binding rule 1's allow list names. Pages under `src/app`
 * reach the switch through here and never import the secret key client
 * themselves, which the lint rule in `eslint.config.mjs` enforces.
 *
 * Feature 10 builds the gate that consults this before every metered call. It
 * lives here rather than there because the switch has to exist before the first
 * external call, which is the ordering the scope's named risk rule asks for.
 */

/**
 * The row is parsed rather than type asserted. The generated database types say
 * what the schema claims; this says what actually arrived.
 */
const appSettingsSchema = z.object({
  kill_switch_enabled: z.boolean(),
  updated_at: z.iso.datetime({ offset: true }),
});

export interface KillSwitch {
  /** True means every gated call stops. */
  readonly enabled: boolean;
  /** Raw, as stored. Formatting belongs at render. */
  readonly updatedAt: string;
}

/**
 * Read the switch through the secret key client.
 *
 * Three failure kinds, three real causes, never one misleading one:
 * `database_unavailable` for a refused or unreachable read, `record_not_found`
 * for a missing row, `response_malformed` for a row that does not parse.
 *
 * Every one of them means switched on (invariant 3). A caller must not render a
 * failure as a plain "off", and must not render it as a plain "on" either: a
 * deliberate flip and a broken read would then look identical, which is the one
 * distinction AC-8 exists to preserve.
 */
export async function readKillSwitch(): Promise<Result<KillSwitch>> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before the
   * client is even built. A span opened after a guard leaves the failure ratio
   * alert with no denominator during exactly the outage it exists to catch. The
   * name is registered in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "kill_switch.read", op: "db.query" },
    async (): Promise<Result<KillSwitch>> => {
      const supabase = createSecretClient();

      /**
       * BINDING RULE 5: `attempt()` converts a thrown exception, and ONLY a
       * thrown exception. The Supabase client throws on a transport failure but
       * returns `{ data: null, error }` for a permission denial or a missing
       * row, so the returned `error` has to be checked separately below.
       *
       * Reading only what comes back would let a permission denial arrive as a
       * success carrying `null`, which the parse would then report as
       * `response_malformed`: a real denial, named as the wrong thing, in the
       * one code path where the wrong name costs the most time.
       */
      const response = await attempt(
        {
          kind: "database_unavailable",
          message: "Could not reach the database to read the kill switch.",
        },
        async () =>
          supabase
            .from("app_settings")
            .select("kill_switch_enabled, updated_at")
            .eq("id", 1)
            .maybeSingle(),
      );

      if (isFailure(response)) return response;

      const { data, error } = response.value;

      if (error) {
        /**
         * A missing `grant select ... to service_role` lands here, as does a
         * missing `usage` on schema `public`, and so does a key that is not the
         * key it is believed to be. The code and hint are carried into the
         * report because on a hosted project those three look identical from
         * the outside.
         */
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "The database refused the kill switch read.",
          context: { code: error.code, hint: error.hint },
          cause: error,
        });
      }

      if (data === null) {
        /**
         * Unexpected, not expected. The single row is inserted by the migration
         * that creates the table, so its absence is something broken rather
         * than the system working and the answer being no.
         */
        return failure({
          kind: "record_not_found",
          severity: "unexpected",
          message: "The kill switch row is missing.",
        });
      }

      const parsed = appSettingsSchema.safeParse(data);

      if (!parsed.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "The kill switch row did not match the shape we parse.",
          context: { issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      return success({
        enabled: parsed.data.kill_switch_enabled,
        updatedAt: parsed.data.updated_at,
      });
    },
  );
}

/**
 * Spec 0002, invariant 3: the switch fails closed. Anything other than a
 * successful read of `false` means gated calls stop.
 *
 * A function rather than a rule to remember. Feature 10's gate asks this
 * question on every metered call, and the one way to get it wrong is to treat a
 * failed read as permission to proceed.
 */
export function isKillSwitchEngaged(result: Result<KillSwitch>): boolean {
  return isFailure(result) || result.value.enabled;
}
