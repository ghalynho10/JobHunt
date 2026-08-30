import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { classify } from "@/features/auth/callback";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";

/**
 * The refusal hook (spec 0007, AC-9 and AC-10), against the real local stack.
 *
 * WHY THESE CALL THE FUNCTION DIRECTLY rather than driving a signup. Both other
 * routes are closed, and both closures are themselves properties worth having:
 * the hook's `execute` is granted to `supabase_auth_admin` alone, so the Data
 * API cannot reach it (asserted below), and GoTrue answers a second signup for
 * an existing address with `user_already_exists` before the hook is consulted.
 * So the real function in the real database, with real `auth` rows, is the only
 * honest way to prove what it decides.
 *
 * What that split leaves to the other half of the proof: that GoTrue calls this
 * function at all and honours its refusal. That was proved separately on
 * 2026-08-30 by driving a complete external handshake against the running
 * stack, and it is written down in `verify.md` rather than here, because it
 * needs a provider standing in for Google or GitHub and is not something a
 * suite should spin up on every run.
 */

/** The hook's own contract: an empty object allows, an `error` object refuses. */
interface HookAnswer {
  readonly error?: {
    readonly http_code: number;
    readonly message: string;
  };
}

async function askTheHook(email: string | undefined): Promise<HookAnswer> {
  const event =
    email === undefined ? {} : { user: { email, app_metadata: {} } };

  const rows = await queryAsSuperuser<{ readonly answer: HookAnswer }>(
    "select public.before_user_created_hook($1::jsonb) as answer",
    [JSON.stringify(event)],
  );

  const answer = rows[0]?.answer;

  if (answer === undefined) {
    throw new Error("The hook returned no row at all, which it cannot do.");
  }

  return answer;
}

const minted: string[] = [];

async function ownedEmail(): Promise<string> {
  const user = await mintFixtureUser("hook");
  minted.push(user.id);
  return user.email;
}

afterAll(async () => {
  for (const id of minted) await deleteFixtureUser(id);
});

describe("the hook, on an address nobody owns", () => {
  it("allows the signup, which is the ordinary path (covers AC-9)", async () => {
    const answer = await askTheHook(`nobody-${randomUUID()}@example.test`);

    expect(answer).toEqual({});
  });
});

describe("the hook, on an address that already belongs to somebody", () => {
  it("refuses it, so no second empty account is created (covers AC-9)", async () => {
    const answer = await askTheHook(await ownedEmail());

    expect(answer.error).toBeDefined();
    expect(answer.error?.http_code).toBe(422);
  });

  /**
   * AC-9 asks for "a named reason that tells the person which provider owns
   * that email address". On a product with exactly two sign in buttons, "that
   * email is taken" tells them nothing they can act on, so the naming is the
   * criterion rather than a nicety.
   */
  it("names the provider that owns it (covers AC-9)", async () => {
    const answer = await askTheHook(await ownedEmail());

    expect(answer.error?.message).toContain("an email address and password");
  });

  /**
   * The addresses are compared case folded on both sides: `auth.identities`
   * stores a generated `lower(identity_data ->> 'email')`, and the hook lowers
   * and trims what arrives. A provider that returned a differently cased
   * address would otherwise slip past the whole rule.
   */
  it("matches regardless of case or surrounding space (covers AC-9)", async () => {
    const email = await ownedEmail();
    const answer = await askTheHook(`  ${email.toUpperCase()} `);

    expect(answer.error?.http_code).toBe(422);
  });
});

/**
 * AC-10, AND IT IS PROVED SEPARATELY FROM THE CASE THE HOOK EXISTS TO CATCH, on
 * purpose. A hook that failed open on its own internal error would recreate
 * exactly the silent empty account the whole mechanism exists to prevent, and it
 * would be indistinguishable from a working one until the day it mattered.
 *
 * Auth Hooks is a surface the vendor marks beta, so a payload shape change is a
 * real risk rather than a hypothetical one, which is what makes these two the
 * load bearing tests in this file.
 */
describe("the hook, when it fails internally", () => {
  it.each([
    ["an event with no user object", undefined],
    ["a user with a blank email", "   "],
  ])("still refuses given %s (covers AC-10)", async (_case, email) => {
    const answer = await askTheHook(email);

    expect(answer.error).toBeDefined();
    expect(answer.error?.http_code).toBe(500);
  });

  it("says something different from the ordinary refusal, so the two are told apart (covers AC-10)", async () => {
    const internal = await askTheHook(undefined);
    const ordinary = await askTheHook(await ownedEmail());

    expect(internal.error?.message).not.toBe(ordinary.error?.message);
    expect(internal.error?.message).toContain("account check failed");
  });
});

/**
 * THE COUPLING THAT WOULD OTHERWISE ROT SILENTLY.
 *
 * `ACCOUNT_EXISTS_MARKER` in `src/features/auth/callback.ts` has to match the
 * opening of this function's refusal message, because P10's answer left the
 * message as the only channel carrying anything specific: GoTrue forwards a hook
 * refusal as `error=server_error` with an EMPTY `error_code`, and returning a
 * code inside the hook's own error object does not survive the redirect.
 *
 * So this feeds the real message from the real function through the real
 * classifier. Reword either side alone and this fails, instead of
 * `account_exists` quietly degrading into `no_code` and the page showing the
 * wrong sentence.
 */
describe("the hook's message and the callback's classifier", () => {
  it("classifies the real refusal as account_exists (covers AC-5, AC-9)", async () => {
    const answer = await askTheHook(await ownedEmail());

    expect(classify("server_error", answer.error?.message)).toBe(
      "account_exists",
    );
  });

  it("does not classify the internal error refusal as account_exists (covers AC-10)", async () => {
    const answer = await askTheHook(undefined);

    expect(classify("server_error", answer.error?.message)).toBe("no_code");
  });
});

/**
 * The grant is the reason these tests need a direct connection at all, so it is
 * asserted rather than assumed. A `security definer` function reachable by the
 * Data API roles would be a different risk class entirely: `service_role` is the
 * key every deployed environment holds.
 */
describe("who may execute the hook", () => {
  it.each(["anon", "authenticated", "service_role", "public"])(
    "refuses %s (covers the spec's explicit grant)",
    async (role) => {
      const rows = await queryAsSuperuser<{ readonly allowed: boolean }>(
        "select has_function_privilege($1, 'public.before_user_created_hook(jsonb)', 'execute') as allowed",
        [role],
      );

      expect(rows[0]?.allowed).toBe(false);
    },
  );

  it("allows only the role GoTrue connects as", async () => {
    const rows = await queryAsSuperuser<{ readonly allowed: boolean }>(
      "select has_function_privilege('supabase_auth_admin', 'public.before_user_created_hook(jsonb)', 'execute') as allowed",
    );

    expect(rows[0]?.allowed).toBe(true);
  });

  /**
   * `security definer` plus an empty `search_path` is the pair that makes this
   * function safe rather than a privilege escalation, and neither half is
   * visible in a behavioural test. Read out of the catalogue so a later edit
   * that drops one fails here.
   */
  it("is security definer with an empty search path", async () => {
    const rows = await queryAsSuperuser<{
      readonly prosecdef: boolean;
      readonly proconfig: readonly string[] | null;
    }>(
      "select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'before_user_created_hook'",
    );

    expect(rows[0]?.prosecdef).toBe(true);
    expect(rows[0]?.proconfig).toContain('search_path=""');
  });
});
