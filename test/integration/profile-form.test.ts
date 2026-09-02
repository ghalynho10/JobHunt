import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { startAppServer, type AppServer } from "../helpers/app-server";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession, type MintedSession } from "../helpers/session";

/**
 * Spec 0010, AC-14, and spec 0001's third runner constraint.
 *
 * DRIVING A SERVER ACTION WITHOUT A BROWSER. Spec 0004 met the other two runner
 * constraints and deferred this one by name, because at that point the only
 * Server Action in the repository was a development sign in that feature 7
 * deletes. `saveIdentity` is the first real write path, and spec 0010 makes it
 * this feature's representative one.
 *
 * THE TECHNIQUE IS SPEC 0004'S FOLLOW-UP: fetch the page, read the hidden fields
 * React renders on the form, then post those plus the real form fields as
 * multipart to the same route. A redirect carrying the session cookie means it
 * ran. The `Next-Action` header path is fiddlier and silently loses the form
 * fields, which is why it is not used.
 *
 * ONE CORRECTION TO THAT RECIPE, FOUND HERE ON 2026-09-02 AND RECORDED SO IT IS
 * NOT REDISCOVERED. The Follow-up names the fields literally as `$ACTION_REF_1`,
 * `$ACTION_1:0`, `$ACTION_1:1` and `$ACTION_KEY`. The digit is a per form index,
 * not part of the name: this page renders `$ACTION_REF_2` and `$ACTION_2:0`,
 * because the identity form is not the first form React numbered on it. Reading
 * the index out of the page rather than assuming `1` is what makes this survive
 * another form being added above it. Verified against React 19.2.8 and Next.js
 * 16.3.1, the versions in `package.json`. Spec 0004's Follow-up wording is owed
 * that correction.
 *
 * WHAT THIS PROVES THAT CALLING THE FUNCTION WOULD NOT. `saveIdentity` is
 * exported from a `"use server"` module, so it is a callable endpoint whatever
 * page renders it. Importing and calling it would exercise the body and say
 * nothing about whether the endpoint exists, whether the form reaches it, or
 * whether the session travels with the request. All three are the point.
 */

/** The dev server compiles on demand, so the first request here is slow. */
const SETUP_TIMEOUT_MS = 180_000;

let server: AppServer;

beforeAll(async () => {
  server = await startAppServer();
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await server?.stop();
});

/**
 * A fresh signed in account, removed again when the block that made it ends.
 *
 * ONE ACCOUNT PER BLOCK, NEVER A SHARED ONE. Spec 0004's rule is that a test
 * which writes data gets its own user, so no test can contaminate another. It
 * also means neither block below depends on the order they run in, which is what
 * makes the isolation proof mean something.
 */
async function freshAccount(prefix: string): Promise<{
  readonly session: MintedSession;
  readonly userId: string;
  readonly remove: () => Promise<void>;
}> {
  const user = await mintFixtureUser(prefix);
  const session = await mintSession(user.email);

  return {
    session,
    userId: user.id,
    /** The cascade on `auth.users` removes every row this account created. */
    remove: () => deleteFixtureUser(user.id),
  };
}

/**
 * The minted session as a browser would send it.
 *
 * `getAll()` is awaited because `CookieMethodsServer` declares it as possibly
 * asynchronous. The in memory jar answers synchronously, so this is satisfying
 * the contract rather than waiting on anything.
 */
async function cookieHeader(session: MintedSession): Promise<string> {
  const cookies = (await session.jar.getAll()) ?? [];

  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

/**
 * The one `<form>` on the page carrying a field of this name.
 *
 * SCOPING MATTERS HERE, IT IS NOT TIDINESS. Every signed in page also carries
 * the header's sign out form, which renders an action field of its own. Reading
 * hidden fields from the whole document would collect both and post them
 * together, so a test meant to save a profile could also ask the server to end
 * the session. Cutting to the form under test is what keeps the exchange to the
 * one action it is about.
 *
 * Throws rather than returning `undefined`: a missing form is a broken test
 * setup, which is a programmer bug and should keep its stack.
 */
function formContaining(html: string, fieldName: string): string {
  for (const chunk of html.split("<form").slice(1)) {
    const form = chunk.split("</form>")[0] ?? "";

    if (form.includes(`name="${fieldName}"`)) return form;
  }

  throw new Error(
    `No form on the page carries a field named "${fieldName}". The page rendered a different state than the test expected.`,
  );
}

/**
 * Every hidden field React rendered onto the form.
 *
 * READ OUT OF THE PAGE, NEVER OUT OF `server-reference-manifest.json`. Spec
 * 0004's Follow-up records why: an action id is only valid for a build made at
 * that same directory path, so an id read from the manifest locally is the wrong
 * id anywhere else. The page always renders the ids the running server accepts.
 */
function hiddenActionFields(html: string): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  const pattern = /<input[^>]*type="hidden"[^>]*>/g;

  for (const tag of html.match(pattern) ?? []) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";

    if (name === undefined || !name.startsWith("$ACTION")) continue;

    fields[unescapeHtml(name)] = unescapeHtml(value);
  }

  return fields;
}

/**
 * The action id the page rendered, from `$ACTION_<n>:0`.
 *
 * THE INDEX IS READ, NOT ASSUMED. See the header: React numbers the fields per
 * form, so the identity form is `2` on this page and would be a different number
 * on a page with a different set of forms.
 *
 * @returns The id, or `undefined` when the page rendered no action fields at
 * all, which is the failure this whole technique rests on not happening.
 */
function actionIdOf(
  fields: Readonly<Record<string, string>>,
): string | undefined {
  for (const [name, value] of Object.entries(fields)) {
    if (!/^\$ACTION_\d+:0$/.test(name)) continue;

    const parsed: unknown = JSON.parse(value);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "id" in parsed &&
      typeof parsed.id === "string"
    ) {
      return parsed.id;
    }
  }

  return undefined;
}

/** Attribute values arrive escaped. Posting them back escaped would be wrong. */
function unescapeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** GET a path as one signed in fixture user. */
async function get(session: MintedSession, path: string): Promise<Response> {
  return await fetch(`${server.origin}${path}`, {
    headers: { cookie: await cookieHeader(session) },
    redirect: "manual",
  });
}

/**
 * Submits one form the way a browser with no JavaScript would: the hidden fields
 * that form rendered, plus the real fields, as multipart to the same URL.
 *
 * @param session Whose session the exchange runs under.
 * @param path The page carrying the form, which is also where it posts.
 * @param marker A field name unique to the form under test, used to pick it out
 * of the page. See `formContaining`.
 * @param values The real form fields.
 */
async function submitForm(
  session: MintedSession,
  path: string,
  marker: string,
  values: Readonly<Record<string, string>>,
): Promise<{ readonly response: Response; readonly actionId: string }> {
  const page = await get(session, path);

  expect(
    page.status,
    "the form page has to render before it can be posted",
  ).toBe(200);

  const html = await page.text();
  const hidden = hiddenActionFields(formContaining(html, marker));

  /**
   * The whole technique rests on these existing. Spec 0010's build plan calls
   * for confirming the shape before the other four forms are built, and this
   * assertion is that confirmation, kept rather than thrown away: if a later
   * React or Next.js version stops rendering them, this fails here and names the
   * reason instead of failing as an unexplained non redirect below.
   */
  const actionId = actionIdOf(hidden);

  expect(
    actionId,
    "React renders the action's identity as hidden fields on the form",
  ).toBeDefined();

  expect(
    Object.keys(hidden),
    "the previous state travels with the submit, which is what useActionState needs",
  ).toContain("$ACTION_KEY");

  const body = new FormData();

  for (const [name, value] of Object.entries(hidden)) body.append(name, value);
  for (const [name, value] of Object.entries(values)) body.append(name, value);

  const response = await fetch(`${server.origin}${path}`, {
    method: "POST",
    headers: { cookie: await cookieHeader(session) },
    body,
    redirect: "manual",
  });

  return { response, actionId: actionId ?? "" };
}

/**
 * The caller's own profile row, read through the application's own client.
 *
 * NO `eq` FILTER, and that is the point of reading it this way. The policy is
 * what confines the select to this session's own row, so a broken policy shows
 * up here as extra rows rather than being hidden by an application side filter.
 */
async function readOwnRow(session: MintedSession) {
  const supabase = await createClient(session.jar);

  return await supabase
    .from("profile")
    .select("id, full_name, location, summary", { count: "exact" });
}

describe("saveIdentity is driven end to end with no browser (AC-14)", () => {
  let account: Awaited<ReturnType<typeof freshAccount>>;

  beforeAll(async () => {
    account = await freshAccount("profile-form");
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await account?.remove();
  });

  it(
    "creates the profile row, then reads back, then updates the same row",
    async () => {
      /**
       * FIRST RUN. AC-1: with no profile row, `/profile` is the identity form
       * and nothing else, so the form is on the page before anything is saved.
       */
      const before = await readOwnRow(account.session);

      expect(before.count, "the fixture user starts with no profile").toBe(0);

      const created = await submitForm(
        account.session,
        "/profile?edit=identity",
        "full_name",
        {
          full_name: "Ada Lovelace",
          location: "London",
          summary: "Works on engines.",
        },
      );

      /**
       * A REDIRECT IS THE PROOF IT RAN (AC-14). React answers a progressively
       * enhanced Server Action submit with a 303 to the `redirect()` target, so
       * a 200 here would mean the action returned a failed state and re-rendered
       * the form instead of writing.
       */
      expect(created.response.status).toBe(303);
      expect(created.response.headers.get("location")).toContain("/profile");

      /** The action id came from the page, so it cannot be empty. */
      expect(created.actionId).not.toBe("");

      const afterCreate = await readOwnRow(account.session);

      // covers: AC-2
      expect(afterCreate.count).toBe(1);
      expect(afterCreate.data?.[0]?.full_name).toBe("Ada Lovelace");
      expect(afterCreate.data?.[0]?.location).toBe("London");
      /**
       * Invariant 1: the row's id is the caller's own auth id, never a form
       * value. Nothing in the submitted form named it.
       */
      expect(afterCreate.data?.[0]?.id).toBe(account.userId);

      /**
       * RELOAD. The saved values reach the rendered page, which is the half a
       * database read alone does not prove.
       */
      const reloaded = await get(account.session, "/profile");

      expect(reloaded.status).toBe(200);
      expect(await reloaded.text()).toContain("Ada Lovelace");

      /**
       * EDIT. AC-4: re-saving is an update on the same row, never a second
       * insert. The count staying at one is what says so, and it is checked
       * rather than assumed.
       */
      const updated = await submitForm(
        account.session,
        "/profile?edit=identity",
        "full_name",
        { full_name: "Ada King", location: "", summary: "" },
      );

      expect(updated.response.status).toBe(303);

      const afterUpdate = await readOwnRow(account.session);

      expect(afterUpdate.count).toBe(1);
      expect(afterUpdate.data?.[0]?.full_name).toBe("Ada King");
      /** Invariant 8: a field that trims to nothing is stored as `NULL`. */
      expect(afterUpdate.data?.[0]?.location).toBeNull();
      expect(afterUpdate.data?.[0]?.summary).toBeNull();
    },
    SETUP_TIMEOUT_MS,
  );

  it(
    "writes nothing and keeps what was typed when the name is blank (AC-3, AC-12)",
    async () => {
      const before = await readOwnRow(account.session);
      const nameBefore = before.data?.[0]?.full_name;

      const refused = await submitForm(
        account.session,
        "/profile?edit=identity",
        "full_name",
        {
          full_name: "   ",
          location: "Berlin",
          summary: "Kept in place.",
        },
      );

      /**
       * NOT A REDIRECT. A failed parse returns the form's own state, so the
       * server re-renders the page rather than sending the reader onward.
       */
      expect(refused.response.status).toBe(200);

      const html = await refused.response.text();

      /** The message is next to the field, and what was typed is still there. */
      expect(html).toContain("Enter your name.");
      expect(html).toContain("Berlin");
      expect(html).toContain("Kept in place.");

      const after = await readOwnRow(account.session);

      expect(after.data?.[0]?.full_name).toBe(nameBefore);
    },
    SETUP_TIMEOUT_MS,
  );
});

/**
 * Spec 0010, AC-15, closing the deferred positive half of spec 0007's AC-15.
 *
 * WHAT FEATURE 7 COULD NOT PROVE. It showed the negative half, that neither
 * account reaches the other's data, but at that point no `profile` row existed
 * for anybody and both signed in users landed on the same named
 * `record_not_found`. AC-15's wording assumes rows are there to be isolated, and
 * this is the feature that first makes that true.
 *
 * BOTH ACCOUNTS WRITE THROUGH THE RUNNING APP, not through a client built here.
 * Every row below was created by a real Server Action reached over HTTP with a
 * real session cookie, which is what makes the read back afterwards mean
 * something about the product rather than about the test.
 *
 * IT ALSO EXERCISES THE OTHER THREE WRITE PATHS. Skills, work history and search
 * preferences each land here, so the isolation being proved is across all four
 * tables rather than across the one the identity form writes.
 */
describe("two accounts each read back only their own rows (AC-15)", () => {
  let alice: Awaited<ReturnType<typeof freshAccount>>;
  let bob: Awaited<ReturnType<typeof freshAccount>>;

  beforeAll(async () => {
    alice = await freshAccount("profile-alice");
    bob = await freshAccount("profile-bob");
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await alice?.remove();
    await bob?.remove();
  });

  it(
    "fills every section for one account and leaves the other untouched",
    async () => {
      /** Identity first: every other section hangs off this row (AC-1). */
      const aliceIdentity = await submitForm(
        alice.session,
        "/profile?edit=identity",
        "full_name",
        { full_name: "Alice Owner", location: "Lisbon", summary: "" },
      );

      expect(aliceIdentity.response.status).toBe(303);

      const bobIdentity = await submitForm(
        bob.session,
        "/profile?edit=identity",
        "full_name",
        { full_name: "Bob Other", location: "", summary: "" },
      );

      expect(bobIdentity.response.status).toBe(303);

      /**
       * Skills. `react` is submitted below `React` on purpose: AC-5 and AC-6
       * deduplicate ignoring case, so the two collapse into one and the stored
       * casing stands.
       */
      const skills = await submitForm(
        alice.session,
        "/profile?edit=skills",
        "skills",
        { skills: "React\n react \nPostgreSQL\n\n  Go  \n" },
      );

      expect(skills.response.status).toBe(303);

      const experience = await submitForm(
        alice.session,
        "/profile?add=experience",
        "company",
        {
          title: "Backend Engineer",
          company: "Northwind Labs",
          location: "Remote",
          description: "Built the ingest pipeline.",
          started_month: "3",
          started_year: "2019",
          ended_month: "",
          ended_year: "",
        },
      );

      expect(experience.response.status).toBe(303);

      const preferences = await submitForm(
        alice.session,
        "/profile?edit=preferences",
        "desired_titles",
        {
          desired_titles: "Backend Engineer\nPlatform Engineer",
          desired_locations: "Berlin, Germany\nRemote",
          remote_preference: "hybrid",
          minimum_pay: "90000.50",
          minimum_pay_currency: "eur",
        },
      );

      expect(preferences.response.status).toBe(303);

      const aliceClient = await createClient(alice.session.jar);
      const bobClient = await createClient(bob.session.jar);

      /** Alice sees exactly what she wrote, and only that. */
      const aliceSkills = await aliceClient
        .from("profile_skill")
        .select("name", { count: "exact" });

      // covers: AC-5, AC-6
      expect(aliceSkills.count).toBe(3);
      expect(aliceSkills.data?.map((row) => row.name).sort()).toEqual([
        "Go",
        "PostgreSQL",
        "React",
      ]);

      const aliceExperience = await aliceClient
        .from("work_experience")
        .select("title, company, started_on, ended_on, profile_id", {
          count: "exact",
        });

      // covers: AC-7, invariant 3
      expect(aliceExperience.count).toBe(1);
      expect(aliceExperience.data?.[0]?.started_on).toBe("2019-03-01");
      /** An absent ended pair means the role is current, stored as `NULL`. */
      expect(aliceExperience.data?.[0]?.ended_on).toBeNull();
      /** Invariant 1: `profile_id` came from verified claims, not the form. */
      expect(aliceExperience.data?.[0]?.profile_id).toBe(alice.userId);

      const alicePreferences = await aliceClient
        .from("job_preference")
        .select("*", { count: "exact" });

      // covers: AC-9, AC-10
      expect(alicePreferences.count).toBe(1);
      expect(alicePreferences.data?.[0]?.desired_titles).toEqual([
        "Backend Engineer",
        "Platform Engineer",
      ]);
      /**
       * The comma inside "Berlin, Germany" survives, which is the whole reason
       * AC-9 makes these newline separated rather than comma separated.
       */
      expect(alicePreferences.data?.[0]?.desired_locations).toEqual([
        "Berlin, Germany",
        "Remote",
      ]);
      expect(alicePreferences.data?.[0]?.remote_preference).toBe("hybrid");
      /** Trimmed and uppercased before the check, then stored as given. */
      expect(alicePreferences.data?.[0]?.minimum_pay_currency).toBe("EUR");
      expect(Number(alicePreferences.data?.[0]?.minimum_pay)).toBe(90000.5);

      /**
       * THE WHOLE PAGE RENDERS WHAT WAS SAVED, which is the half the database
       * reads above do not cover. `readProfileSections()` parses every returned
       * row rather than asserting its type, so a column whose runtime shape
       * differs from the generated types (`minimum_pay` is `numeric(12, 2)`, and
       * PostgREST's JSON encoding of numeric is the one worth checking) would
       * fail that parse and render the failure state instead of the values.
       * Reading them back off the page is what proves it did not.
       */
      const alicePage = await get(alice.session, "/profile");

      expect(alicePage.status).toBe(200);

      const alicePageHtml = await alicePage.text();

      expect(alicePageHtml).toContain("Alice Owner");
      expect(alicePageHtml).toContain("React");
      expect(alicePageHtml).toContain("Northwind Labs");
      /** Stored raw and formatted at render, to the column's own scale. */
      expect(alicePageHtml).toContain("90000.50 EUR");
      /** An absent end date reads as the role still being held. */
      expect(alicePageHtml).toContain("March 2019 to now");

      /**
       * BOB SEES HIS OWN ROW AND NONE OF ALICE'S. This is both halves at once:
       * the positive half spec 0007 could not prove (he reads his own), and the
       * negative half it did (he reaches nothing of hers).
       */
      const bobProfile = await readOwnRow(bob.session);

      expect(bobProfile.count).toBe(1);
      expect(bobProfile.data?.[0]?.full_name).toBe("Bob Other");
      expect(bobProfile.data?.[0]?.id).toBe(bob.userId);

      expect(
        (
          await bobClient
            .from("profile_skill")
            .select("name", { count: "exact" })
        ).count,
      ).toBe(0);
      expect(
        (
          await bobClient
            .from("work_experience")
            .select("id", { count: "exact" })
        ).count,
      ).toBe(0);
      expect(
        (
          await bobClient
            .from("job_preference")
            .select("profile_id", { count: "exact" })
        ).count,
      ).toBe(0);

      /** And Alice still reads her own row, unchanged by anything Bob did. */
      const aliceProfile = await readOwnRow(alice.session);

      expect(aliceProfile.count).toBe(1);
      expect(aliceProfile.data?.[0]?.full_name).toBe("Alice Owner");

      const aliceEntryId = (
        await aliceClient.from("work_experience").select("id").limit(1)
      ).data?.[0]?.id;

      expect(aliceEntryId).toBeDefined();

      /**
       * AC-13, FIRST HALF. Bob opening the confirmation URL for an entry that is
       * not his gets the plain view and `COPY-4`, never a confirmation form. The
       * id is well formed, so this is the "valid but not yours" case, which the
       * page cannot tell apart from a stale one and deliberately does not try.
       */
      const strangersConfirmation = await get(
        bob.session,
        `/profile?delete=experience&entry=${aliceEntryId ?? ""}`,
      );

      expect(strangersConfirmation.status).toBe(200);

      const strangersHtml = await strangersConfirmation.text();

      expect(strangersHtml).toContain("no longer on your profile");
      expect(strangersHtml).not.toContain('name="entry_id"');

      /**
       * AC-8, AC-11 AND INVARIANT 4. The page refuses to render the form, so the
       * only way to reach the action with somebody else's id is to post one, and
       * that is exactly what an attacker would do: harvest the action fields from
       * a form Bob is allowed to see, then submit a different entry id.
       *
       * ROW LEVEL SECURITY EXCLUDES THE ROW BY MATCHING NOTHING, NOT BY RAISING.
       * Without the zero row check the delete would answer with a clean redirect
       * and Bob would be told he had removed a record that is still there.
       */
      const bobEntry = await submitForm(
        bob.session,
        "/profile?add=experience",
        "company",
        {
          title: "Analyst",
          company: "Someone Else Ltd",
          location: "",
          description: "",
          started_month: "1",
          started_year: "2020",
          ended_month: "",
          ended_year: "",
        },
      );

      expect(bobEntry.response.status).toBe(303);

      const bobEntryId = (
        await bobClient.from("work_experience").select("id").limit(1)
      ).data?.[0]?.id;

      const spoofed = await submitForm(
        bob.session,
        `/profile?delete=experience&entry=${bobEntryId ?? ""}`,
        "entry_id",
        { entry_id: aliceEntryId ?? "" },
      );

      expect(
        spoofed.response.status,
        "a delete that matches no row must not redirect as though it worked",
      ).toBe(200);
      expect(await spoofed.response.text()).toContain(
        "no longer on your profile",
      );

      /** Alice's entry is still there, which is what the failure was about. */
      expect(
        (
          await aliceClient
            .from("work_experience")
            .select("id", { count: "exact" })
        ).count,
      ).toBe(1);

      /** And Bob's own entry was not collateral damage. */
      expect(
        (
          await bobClient
            .from("work_experience")
            .select("id", { count: "exact" })
        ).count,
      ).toBe(1);
    },
    SETUP_TIMEOUT_MS,
  );
});
