import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CookieJar } from "../helpers/cookie-jar";
import { createCookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession, type MintedSession } from "../helpers/session";

/**
 * The two guarantees `/check verify` could not observe from outside the app
 * (spec 0010, `verify.md`, "The two steps left unticked").
 *
 * BOTH NEED THE ACTION CALLED DIRECTLY, which is exactly what an HTTP driven
 * check cannot do. One needs a caller with no session, and over HTTP the
 * protected layout redirects that request before the action ever runs. The other
 * needs the second of two database writes to fail, which no input can cause.
 *
 * WHY `next/headers` IS THE ONE THING STUBBED. Every action calls
 * `createClient()` with no argument, by design, so it reads the real request's
 * cookie store. There is no request in a test process and `cookies()` throws
 * outside a request scope. The stub supplies a cookie store and nothing else:
 * the session is real, minted through the real auth API, the policies are the
 * real ones, and every decision about what a session is and which rows it may
 * touch stays inside the application's own modules. That is the line the
 * project's "no mock encoding the same assumption as the code under test" rule
 * draws, and this stays on the right side of it.
 */

/** Hoisted, because `vi.mock` is lifted above the imports. */
const requestScope = vi.hoisted(() => ({
  jar: undefined as CookieJar | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => requestScope.jar?.getAll() ?? [],
      set: () => {},
    }),
}));

/**
 * `revalidatePath` and `redirect` belong to the framework's request lifecycle
 * and neither exists in a test process. `redirect` is replaced with a throw that
 * carries a marker, because that is what it does: it works by throwing, which is
 * precisely why every action calls it OUTSIDE its span.
 */
const REDIRECTED = "REDIRECT_TO_PROFILE";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error(REDIRECTED);
  },
}));

const { saveSkills, saveIdentity } = await import("@/features/profile/actions");
const { IDLE_STATE } = await import("@/features/profile/form-state");
const { createClient } = await import("@/lib/supabase/server");

let session: MintedSession;
let userId: string;

beforeAll(async () => {
  const user = await mintFixtureUser("profile-actions");

  userId = user.id;
  session = await mintSession(user.email);
  requestScope.jar = session.jar;

  const supabase = await createClient(session.jar);

  await supabase
    .from("profile")
    .insert({ id: userId, full_name: "Skills Owner" });
});

afterAll(async () => {
  requestScope.jar = undefined;
  if (userId) await deleteFixtureUser(userId);
});

function formOf(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) data.append(key, value);

  return data;
}

/**
 * The caller's own name, read through the application's own client.
 *
 * IT READS `profile`, THE TABLE `saveIdentity` ACTUALLY WRITES. The first
 * version of the check below read `profile_skill` instead, a table
 * `saveIdentity` never touches, so "nothing was written" was true of somewhere
 * nothing was ever going to be written. It passed, and it would have passed
 * just as happily if the refused call had overwritten the name. Found by the
 * cross check on 2026-09-02, and worth keeping as a note: an assertion aimed at
 * the wrong table is indistinguishable from a passing one.
 */
async function storedName(): Promise<string | undefined> {
  const supabase = await createClient(session.jar);
  const { data } = await supabase
    .from("profile")
    .select("full_name")
    .maybeSingle();

  return data?.full_name;
}

/** The caller's own skills, read through the application's own client. */
async function storedSkills(): Promise<readonly string[]> {
  const supabase = await createClient(session.jar);
  const { data } = await supabase.from("profile_skill").select("name");

  return (data ?? []).map((row) => row.name).sort();
}

describe("an action refuses a caller with no session, on its own (AC-11)", () => {
  it("returns the session message and writes nothing", async () => {
    /**
     * BINDING RULE 6, tested where it actually lives. Over HTTP this request is
     * turned away by the protected layout, so the layout is what gets proved and
     * the action's own check never runs. A Server Action is a callable endpoint
     * whatever page renders it, and this is the check that matters if anything
     * ever reaches it without going through the page.
     */
    // covers: AC-11
    const empty = createCookieJar();

    expect(
      await storedName(),
      "the caller starts with a name there is something to overwrite",
    ).toBe("Skills Owner");

    requestScope.jar = empty;

    const state = await saveIdentity(
      IDLE_STATE,
      formOf({ full_name: "Nobody" }),
    );

    requestScope.jar = session.jar;

    expect(state.status).toBe("failed");
    expect(state.message).toBe(
      "Your session has ended. Sign in again to save this.",
    );
    /**
     * The name is untouched, which is the half that actually says nothing was
     * written. Reading any other table here would prove nothing about this call.
     */
    expect(await storedName()).toBe("Skills Owner");
  });

  it("keeps what the caller typed, so nothing is lost to a expired session", async () => {
    // covers: AC-11, AC-12
    const empty = createCookieJar();

    requestScope.jar = empty;

    const state = await saveSkills(IDLE_STATE, formOf({ skills: "Go\nRust" }));

    requestScope.jar = session.jar;

    expect(state.values.skills).toBe("Go\nRust");
  });
});

describe("a skills save that fails midway never loses what was already there (invariant 9)", () => {
  it("keeps every prior skill when the delete half fails after the insert half", async () => {
    /**
     * WHAT INVARIANT 9 IS ACTUALLY FOR. `saveSkills` writes inserts first, then
     * deletes. The order is the whole protection: a failure between the two
     * leaves the caller with every skill they already had plus whatever new ones
     * landed, never fewer. Reversing it for tidiness would silently remove that.
     *
     * This asserts the OUTCOME the ordering guarantees rather than the order of
     * the statements, because the outcome is what a person would notice and the
     * order is an implementation detail that could change while staying correct.
     *
     * The delete is made to fail at the driver, which is a real boundary, not a
     * stub of the code under test: `saveSkills` runs in full, against the real
     * database, and only the one call it cannot control is broken.
     */
    // covers: AC-5
    await saveSkills(
      IDLE_STATE,
      formOf({ skills: "alpha\nbeta\ngamma" }),
    ).catch(() => {});

    expect(await storedSkills()).toEqual(["alpha", "beta", "gamma"]);

    const supabase = await createClient(session.jar);
    const realFrom = supabase.from.bind(supabase);

    /**
     * Only `delete()` on `profile_skill` is broken. Every other call, including
     * the read and the insert in the same action, goes to the real database.
     */
    /**
     * The broken client, as a proxy over the real one. Only `from("profile_skill")`
     * behaves differently, and only its `delete`. A spread copy would not do:
     * the Supabase client keeps most of itself on its prototype, so spreading it
     * silently produces an object missing almost everything.
     */
    const brokenClient = new Proxy(supabase, {
      get(target, property, receiver) {
        if (property !== "from")
          return Reflect.get(target, property, receiver) as unknown;

        return (table: string) => {
          const builder = realFrom(table as never);

          if (table !== "profile_skill") return builder;

          return new Proxy(builder, {
            get(builderTarget, builderProperty, builderReceiver) {
              if (builderProperty === "delete") {
                return () => {
                  throw new Error(
                    "connection lost between the insert and the delete",
                  );
                };
              }

              return Reflect.get(
                builderTarget,
                builderProperty,
                builderReceiver,
              ) as unknown;
            },
          });
        };
      },
    });

    const serverModule = await import("@/lib/supabase/server");
    const spy = vi
      .spyOn(serverModule, "createClient")
      .mockResolvedValue(brokenClient);

    try {
      /** `beta` would be deleted and `delta` inserted, if the delete worked. */
      const state = await saveSkills(
        IDLE_STATE,
        formOf({ skills: "alpha\ngamma\ndelta" }),
      );

      expect(state.status, "the failure is reported, never swallowed").toBe(
        "failed",
      );
    } finally {
      spy.mockRestore();
    }

    /**
     * The point: `beta` survived because the delete never ran, and `delta`
     * landed because the insert ran first. The caller ends with MORE than they
     * started with, which is the direction this ordering chooses.
     */
    expect(await storedSkills()).toEqual(["alpha", "beta", "delta", "gamma"]);
  });
});
