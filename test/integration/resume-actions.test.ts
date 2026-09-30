import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CookieJar } from "../helpers/cookie-jar";
import { createCookieJar } from "../helpers/cookie-jar";
import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession, type MintedSession } from "../helpers/session";

/**
 * The master resume's write and read paths against the real local stack
 * (spec 0024, AC-3, AC-4, AC-8, AC-9, AC-11).
 *
 * THE ACTION IS CALLED DIRECTLY, with a real minted session, the real policies
 * and the real constraints. `next/headers` is the one thing stubbed, for the
 * reason `profile-actions.test.ts` gives: there is no request in a test
 * process, so the stub supplies a cookie store and nothing else. Every decision
 * about who the caller is and which rows they may touch stays inside the
 * application's own modules and the database.
 *
 * COUNTS ARE READ THROUGH THE SUPERUSER CONNECTION, never through the caller's
 * own client. A "nothing was written" check read through the same policies the
 * write went through could not tell an empty table from an invisible one.
 */

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

/** `redirect()` works by throwing; the marker is how a test sees the success path. */
const REDIRECTED = "REDIRECT_TO_RESUME";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error(REDIRECTED);
  },
}));

const { saveResumeVersion } = await import("@/features/resume/actions");
const { IDLE_RESUME_STATE } = await import("@/features/resume/form-state");
const { readResumeHistory, readResumeVersion } =
  await import("@/features/resume/queries");
const { createClient } = await import("@/lib/supabase/server");

let owner: MintedSession;
let ownerId: string;
let stranger: MintedSession;
let strangerId: string;

beforeAll(async () => {
  const ownerUser = await mintFixtureUser("resume-owner");
  const strangerUser = await mintFixtureUser("resume-stranger");

  ownerId = ownerUser.id;
  strangerId = strangerUser.id;
  owner = await mintSession(ownerUser.email);
  stranger = await mintSession(strangerUser.email);

  const client = await createClient(owner.jar);
  const { error } = await client
    .from("profile")
    .insert({ id: ownerId, full_name: "Resume Owner" });

  if (error)
    throw new Error(`Could not seed the owner's profile: ${error.message}`);

  requestScope.jar = owner.jar;
});

afterAll(async () => {
  requestScope.jar = undefined;
  if (ownerId) await deleteFixtureUser(ownerId);
  if (strangerId) await deleteFixtureUser(strangerId);
});

function formOf(content: string, previousVersionNumber: string): FormData {
  const data = new FormData();

  data.append("content", content);
  data.append("previousVersionNumber", previousVersionNumber);

  return data;
}

/** Every stored version for a profile, read past row level security. */
async function storedVersions(
  profileId: string,
): Promise<readonly { version_number: number; content: string }[]> {
  return queryAsSuperuser<{ version_number: number; content: string }>(
    "select version_number, content from public.resume_version where profile_id = $1 order by version_number",
    [profileId],
  );
}

/** Calls the action and reports whether it redirected (the success path). */
async function save(content: string, previousVersionNumber: string) {
  try {
    const state = await saveResumeVersion(
      IDLE_RESUME_STATE,
      formOf(content, previousVersionNumber),
    );

    return { redirected: false, state } as const;
  } catch (error) {
    if (error instanceof Error && error.message === REDIRECTED) {
      return { redirected: true, state: undefined } as const;
    }

    throw error;
  }
}

describe("saving versions in sequence (AC-4)", () => {
  it("creates version 1, then the next version, each as an insert", async () => {
    // covers: AC-4
    expect(await storedVersions(ownerId)).toEqual([]);

    expect((await save("# First", "0")).redirected).toBe(true);
    expect((await save("# Second", "1")).redirected).toBe(true);

    /**
     * Both rows exist and version 1's text is exactly what it was: the second
     * save added a row rather than rewriting the first.
     */
    expect(await storedVersions(ownerId)).toEqual([
      { version_number: 1, content: "# First" },
      { version_number: 2, content: "# Second" },
    ]);
  });
});

describe("two tabs saving against the same version (AC-9)", () => {
  it("refuses the second as a conflict carrying the newer raw text, writing nothing", async () => {
    // covers: AC-9
    expect((await save("# From tab A", "2")).redirected).toBe(true);

    const second = await save("# From tab B", "2");

    expect(second.redirected).toBe(false);
    expect(second.state).toEqual({
      status: "conflict",
      errors: {},
      values: { content: "# From tab B" },
      currentVersionNumber: 3,
      currentVersionContent: "# From tab A",
    });
    expect(await storedVersions(ownerId)).toHaveLength(3);
  });

  it("saves anyway as the next version once resubmitted against the reported number", async () => {
    // covers: AC-9
    expect((await save("# From tab B", "3")).redirected).toBe(true);

    const versions = await storedVersions(ownerId);

    expect(versions.at(-1)).toEqual({
      version_number: 4,
      content: "# From tab B",
    });
    /** Tab A's version survived the "save anyway" untouched. */
    expect(versions[2]).toEqual({ version_number: 3, content: "# From tab A" });
  });

  it("does not mistake a restore for a conflict against the version it came from", async () => {
    /**
     * Restoring version 2 and saving submits the CURRENT number (4), never the
     * restored one (2), so it lands as version 5 rather than colliding with 3.
     */
    // covers: AC-9
    expect((await save("# Second", "4")).redirected).toBe(true);
    expect((await storedVersions(ownerId)).at(-1)).toEqual({
      version_number: 5,
      content: "# Second",
    });
  });
});

describe("a refused save writes nothing and keeps the typed text (AC-3)", () => {
  it.each([
    ["blank", "", "Write something before saving your resume."],
    [
      "whitespace only",
      "  \n\t  ",
      "Write something before saving your resume.",
    ],
    [
      "over the ceiling",
      "x".repeat(20001),
      "Keep your resume to 20000 characters or fewer.",
    ],
  ])("refuses %s content on the field alone", async (_, content, message) => {
    // covers: AC-3
    const before = await storedVersions(ownerId);
    const result = await save(content, "5");

    expect(result.state).toEqual({
      status: "failed",
      errors: { content: message },
      values: { content },
    });
    expect(await storedVersions(ownerId)).toEqual(before);
  });

  it("accepts content at exactly the ceiling", async () => {
    // covers: AC-3
    expect((await save("y".repeat(20000), "5")).redirected).toBe(true);
    expect((await storedVersions(ownerId)).at(-1)?.version_number).toBe(6);
  });

  it.each(["", "abc", "-1", "1.5", "99999999999"])(
    "shows COPY-33 above the field for a malformed previousVersionNumber %j",
    async (previousVersionNumber) => {
      // covers: AC-3
      const before = await storedVersions(ownerId);
      const result = await save("# Fine text", previousVersionNumber);

      expect(result.state).toEqual({
        status: "failed",
        message:
          "We couldn't read that save, so nothing was written. Copy your text somewhere safe, then reload this page.",
        errors: {},
        values: { content: "# Fine text" },
      });
      expect(await storedVersions(ownerId)).toEqual(before);
    },
  );

  it("refuses a caller with no session, keeping the text (binding rule 6)", async () => {
    // covers: AC-3
    const before = await storedVersions(ownerId);

    requestScope.jar = createCookieJar();
    const result = await save("# Nobody", "6");
    requestScope.jar = owner.jar;

    expect(result.state).toEqual({
      status: "failed",
      message:
        "Your session has expired, so nothing was saved. Copy your text somewhere safe, then sign in again.",
      errors: {},
      values: { content: "# Nobody" },
    });
    expect(await storedVersions(ownerId)).toEqual(before);
  });

  it("refuses a caller with no profile row via the foreign key, not as an outage", async () => {
    // covers: AC-3
    requestScope.jar = stranger.jar;
    const result = await save("# Orphan", "0");
    requestScope.jar = owner.jar;

    expect(result.state?.message).toBe(
      "We couldn't find your profile, so there is nothing to attach this resume to. Open your profile, save it, then try again.",
    );
    expect(result.state?.values).toEqual({ content: "# Orphan" });
    expect(await storedVersions(strangerId)).toEqual([]);
  });
});

describe("the database refuses what the parse refuses (AC-3, AC-11)", () => {
  it.each([
    ["blank", "   "],
    ["over the ceiling", "z".repeat(20001)],
  ])("rejects %s content with a check violation", async (_, content) => {
    // covers: AC-3
    const client = await createClient(owner.jar);
    const { error } = await client.from("resume_version").insert({
      profile_id: ownerId,
      version_number: 1000,
      content,
    });

    expect(error?.code).toBe("23514");
  });

  it("refuses a version number of zero", async () => {
    const client = await createClient(owner.jar);
    const { error } = await client
      .from("resume_version")
      .insert({ profile_id: ownerId, version_number: 0, content: "# Zero" });

    expect(error?.code).toBe("23514");
  });
});

describe("a version is never changed or removed (AC-4, AC-11, invariant 1)", () => {
  it("grants authenticated select and insert only, and anon and service_role nothing", async () => {
    // covers: AC-11
    const rows = await queryAsSuperuser<{
      role: string;
      privilege: string;
      held: boolean;
    }>(
      `select role, privilege, has_table_privilege(role, 'public.resume_version', privilege) as held
         from unnest(array['authenticated', 'anon', 'service_role']) as role,
              unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
        order by role, privilege`,
    );
    const held = rows
      .filter((row) => row.held)
      .map((row) => `${row.role} ${row.privilege}`);

    expect(held).toEqual(["authenticated INSERT", "authenticated SELECT"]);
  });

  it("has row level security enabled and forced, with a select and an insert policy only", async () => {
    // covers: AC-11
    const [table] = await queryAsSuperuser<{
      enabled: boolean;
      forced: boolean;
    }>(
      "select relrowsecurity as enabled, relforcerowsecurity as forced from pg_class where oid = 'public.resume_version'::regclass",
    );
    const policies = await queryAsSuperuser<{ cmd: string }>(
      "select cmd from pg_policies where schemaname = 'public' and tablename = 'resume_version' order by cmd",
    );

    expect(table).toEqual({ enabled: true, forced: true });
    expect(policies.map((policy) => policy.cmd)).toEqual(["INSERT", "SELECT"]);
  });

  it("refuses the owner's own update and delete, leaving every row as written", async () => {
    // covers: AC-4, AC-11
    const before = await storedVersions(ownerId);
    const client = await createClient(owner.jar);

    const updated = await client
      .from("resume_version")
      .update({ content: "# Rewritten" })
      .eq("version_number", 1);
    const deleted = await client
      .from("resume_version")
      .delete()
      .eq("version_number", 1);

    expect(updated.error?.code).toBe("42501");
    expect(deleted.error?.code).toBe("42501");
    expect(await storedVersions(ownerId)).toEqual(before);
  });
});

describe("the reads (AC-5, AC-6, AC-8)", () => {
  it("lists every version newest first, with the current one's text", async () => {
    // covers: AC-5, AC-6
    const history = await readResumeHistory({ withContent: true });

    if (!history.ok) throw new Error(history.message);

    expect(
      history.value.versions.map((version) => version.versionNumber),
    ).toEqual([6, 5, 4, 3, 2, 1]);
    expect(history.value.current?.versionNumber).toBe(6);
    expect(history.value.current?.content).toBe("y".repeat(20000));
  });

  it("skips the text when the card asks for the history alone", async () => {
    // covers: AC-10
    const history = await readResumeHistory({ withContent: false });

    if (!history.ok) throw new Error(history.message);

    expect(history.value.versions).toHaveLength(6);
    expect(history.value.current).toBeUndefined();
  });

  it("answers a stranger's version id with no row, never the row", async () => {
    // covers: AC-8
    const history = await readResumeHistory({ withContent: false });

    if (!history.ok) throw new Error(history.message);

    const ownVersionId = history.value.versions[0]?.id ?? "";

    requestScope.jar = stranger.jar;
    const seenByStranger = await readResumeVersion(ownVersionId);
    requestScope.jar = owner.jar;

    expect(seenByStranger).toEqual({ ok: true, value: undefined });

    const seenByOwner = await readResumeVersion(ownVersionId);

    expect(seenByOwner.ok && seenByOwner.value?.versionNumber).toBe(6);
  });
});

describe("deleting a profile removes its whole resume history (AC-11)", () => {
  it("cascades", async () => {
    // covers: AC-11
    expect((await storedVersions(ownerId)).length).toBeGreaterThan(0);

    await queryAsSuperuser("delete from public.profile where id = $1", [
      ownerId,
    ]);

    expect(await storedVersions(ownerId)).toEqual([]);
  });
});
