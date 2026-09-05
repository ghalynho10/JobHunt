import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession, type MintedSession } from "../helpers/session";

/**
 * The application write and read paths against the real stack (spec 0014).
 *
 * WHY THESE HAVE TO BE INTEGRATION TESTS. Every guarantee this feature actually
 * rests on lives in Postgres, not in TypeScript: the unique constraint that
 * refuses a second apply (spec 0003, AC-7), the foreign key that refuses an
 * apply with no profile row (AC-8), the check constraint pairing the predicted
 * flag to the salary (spec 0014, AC-6), and the four row level security
 * policies. A unit test with a mocked client would assert that this feature
 * calls a database, which is not the thing that could break.
 *
 * WHY `next/headers` IS THE ONE THING STUBBED, following
 * `profile-actions.test.ts` exactly. There is no request in a test process and
 * `cookies()` throws outside a request scope. The stub supplies a cookie store
 * and nothing else: the session is real, minted through the real auth API, the
 * policies are the real ones, and every decision about what a session is and
 * which rows it may touch stays inside the application's own modules.
 *
 * NOT IN `integration-serial/`. These tests touch only their own fixture users'
 * rows and move no shared global counter, unlike feature 11's search tests, so
 * they are safe to run in parallel with the rest of `integration/`.
 */

/** Hoisted, because `vi.mock` is lifted above the imports. */
const requestScope = vi.hoisted(() => ({
  jar: undefined as CookieJar | undefined,
  /** Every cookie the code under test tried to WRITE, so AC-20 can be checked. */
  written: [] as string[],
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => requestScope.jar?.getAll() ?? [],
      set: (name: string) => {
        requestScope.written.push(name);
      },
    }),
}));

/** `revalidatePath` belongs to the framework's request lifecycle. */
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { recordApplication, removeApplication } =
  await import("@/features/applications/actions");
const { readApplications, readAppliedJobIds } =
  await import("@/features/applications/queries");
const { createClient } = await import("@/lib/supabase/server");

let session: MintedSession;
let userId: string;

/** A second user, so isolation is proved against a real other person's rows. */
let otherSession: MintedSession;
let otherUserId: string;

beforeAll(async () => {
  const user = await mintFixtureUser("application-actions");

  userId = user.id;
  session = await mintSession(user.email);
  requestScope.jar = session.jar;

  const supabase = await createClient(session.jar);

  await supabase
    .from("profile")
    .insert({ id: userId, full_name: "Application Owner" });

  const other = await mintFixtureUser("application-actions-other");

  otherUserId = other.id;
  otherSession = await mintSession(other.email);

  const otherClient = await createClient(otherSession.jar);

  await otherClient
    .from("profile")
    .insert({ id: otherUserId, full_name: "Other Person" });
});

afterAll(async () => {
  requestScope.jar = undefined;
  if (userId) await deleteFixtureUser(userId);
  if (otherUserId) await deleteFixtureUser(otherUserId);
});

/**
 * A listing in the shape the card's closure hands the action.
 *
 * FIXTURES CARRY NO REAL PERSONAL DATA (`AGENTS.md`), and a job advert is not
 * personal data, but the company and the URL are still invented rather than
 * lifted from a real posting.
 */
function listing(over: Record<string, unknown> = {}) {
  return {
    source: "adzuna",
    sourceJobId: `job-${Math.round(performance.now() * 1000)}`,
    title: "Backend Engineer",
    companyName: "Fixture Systems",
    location: "Boston",
    url: "https://example.test/postings/1",
    descriptionSnippet: "A snippet of the posting.",
    salaryMin: 100000,
    salaryMax: 120000,
    salaryCurrency: "USD",
    salaryIsPredicted: false,
    postedAt: "2026-09-01T12:00:00Z",
    ...over,
  };
}

describe("recording an application (AC-2, AC-3)", () => {
  it("writes one row carrying every snapshot field", async () => {
    const job = listing();

    const state = await recordApplication(job);

    expect(state.status).toBe("applied");

    const supabase = await createClient(session.jar);
    const { data } = await supabase
      .from("application")
      .select("*")
      .eq("source_job_id", job.sourceJobId)
      .single();

    /** Every value the Value sourcing table names, checked against its source. */
    expect(data).toMatchObject({
      /** From verified claims, never from the listing (invariant 8). */
      profile_id: userId,
      source: "adzuna",
      source_job_id: job.sourceJobId,
      job_title: job.title,
      company_name: job.companyName,
      job_location: job.location,
      job_url: job.url,
      job_description: job.descriptionSnippet,
      salary_currency: "USD",
      salary_is_predicted: false,
    });

    /** The database owns all three timestamps (spec 0003, invariant 10). */
    expect(data?.applied_at).toBeTruthy();
    expect(data?.created_at).toBeTruthy();
    expect(data?.updated_at).toBeTruthy();
  });

  it("survives a reload, read back through the list path", async () => {
    const job = listing();

    await recordApplication(job);

    const rows = await readApplications();

    expect(rows.ok).toBe(true);
    if (!rows.ok) return;

    expect(rows.value.some((row) => row.sourceJobId === job.sourceJobId)).toBe(
      true,
    );
  });

  it("writes no session cookie during an ordinary apply (AC-20, and read the note)", async () => {
    /**
     * THIS TEST DOES NOT GUARD AC-20 ON ITS OWN, and saying so is the point.
     *
     * It was written first as the proof that the read only cookie adapter was
     * in place, then checked by swapping that adapter back for the writing
     * default: it still passed. A freshly minted session never needs
     * refreshing, so nothing writes a cookie either way, and the assertion
     * could only ever confirm what its author already believed. That is the
     * escaped bug shape `docs/reflexes.md` records twice.
     *
     * The real guard is `src/features/applications/actions.test.ts`, which
     * asserts the wiring rather than a side effect: it fails the moment the
     * adapter argument is deleted. Both breaks were driven on purpose.
     *
     * This one is kept because it still says something true and cheap: an
     * ordinary apply on a healthy session writes nothing. It is a floor, not
     * the guarantee.
     */
    requestScope.written = [];

    await recordApplication(listing());

    expect(requestScope.written).toEqual([]);
  });
});

describe("the predicted salary flag (AC-6)", () => {
  it("stores true for a predicted figure", async () => {
    const job = listing({ salaryIsPredicted: true });

    await recordApplication(job);

    const supabase = await createClient(session.jar);
    const { data } = await supabase
      .from("application")
      .select("salary_is_predicted")
      .eq("source_job_id", job.sourceJobId)
      .single();

    expect(data?.salary_is_predicted).toBe(true);
  });

  it("stores null, not false, when the source quoted no pay at all", async () => {
    /**
     * THE WHOLE REASON THE COLUMN IS NULLABLE. Adzuna sends
     * `salary_is_predicted` on every advert including ones quoting no pay, so
     * passing the boolean through would stamp `false` here, which reads as
     * "this figure was stated rather than predicted" about a figure that does
     * not exist.
     */
    const job = listing({
      salaryMin: undefined,
      salaryMax: undefined,
      salaryCurrency: undefined,
      salaryIsPredicted: false,
    });

    await recordApplication(job);

    const supabase = await createClient(session.jar);
    const { data } = await supabase
      .from("application")
      .select("salary_is_predicted, salary_min")
      .eq("source_job_id", job.sourceJobId)
      .single();

    expect(data?.salary_is_predicted).toBeNull();
    expect(data?.salary_min).toBeNull();
  });
});

describe("the refusals a reader can act on (AC-4, AC-5)", () => {
  it("refuses a second apply to the same job, with its own message", async () => {
    const job = listing();

    expect((await recordApplication(job)).status).toBe("applied");

    const second = await recordApplication(job);

    expect(second.status).toBe("failed");
    expect(second.message).toBe("You've already marked this job applied.");

    /** One row, not two. The constraint is the guarantee, not the caller. */
    const supabase = await createClient(session.jar);
    const { data } = await supabase
      .from("application")
      .select("id")
      .eq("source_job_id", job.sourceJobId);

    expect(data).toHaveLength(1);
  });

  it("refuses an apply from a caller with no profile row, pointing at /profile", async () => {
    /**
     * Spec 0003 AC-8 put this refusal in the foreign key so it holds for a
     * caller that never checked, and recorded that feature 12 owes the visible
     * half. This is that half.
     */
    const stranger = await mintFixtureUser("application-no-profile");
    const strangerSession = await mintSession(stranger.email);
    const previous = requestScope.jar;

    requestScope.jar = strangerSession.jar;

    try {
      const state = await recordApplication(listing());

      expect(state.status).toBe("failed");
      expect(state.message).toBe(
        "Set up your profile before you can apply to jobs.",
      );
      /** The dead end has an exit. */
      expect(state.action?.href).toBe("/profile");
    } finally {
      requestScope.jar = previous;
      await deleteFixtureUser(stranger.id);
    }
  });

  it("refuses a listing whose posted date is not a real datetime", async () => {
    /**
     * Without the snapshot schema's `z.iso.datetime()` this reaches
     * `posted_at timestamptz` and Postgres raises `22007`, which is in none of
     * this feature's mappings and would surface as `database_unavailable`: a
     * data quality problem reported to the reader as an outage.
     */
    const state = await recordApplication(
      listing({ postedAt: "last Tuesday" }),
    );

    expect(state.status).toBe("failed");
    expect(state.message).toContain("could not be read");
  });

  it("refuses a listing that is not a listing at all", async () => {
    expect((await recordApplication({ nope: true })).status).toBe("failed");
    expect((await recordApplication(null)).status).toBe("failed");
  });
});

describe("the applied marker read (AC-9)", () => {
  it("reports exactly the jobs this caller applied to, scoped to the ids asked about", async () => {
    const applied = listing();
    const notApplied = listing();

    await recordApplication(applied);

    const result = await readAppliedJobIds([
      applied.sourceJobId,
      notApplied.sourceJobId,
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.has(applied.sourceJobId)).toBe(true);
    expect(result.value.has(notApplied.sourceJobId)).toBe(false);
  });

  it("asks nothing when the page rendered no results", async () => {
    const result = await readAppliedJobIds([]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.size).toBe(0);
  });
});

describe("removing an application (AC-11)", () => {
  it("removes the row", async () => {
    const job = listing();

    await recordApplication(job);

    const supabase = await createClient(session.jar);
    const { data: before } = await supabase
      .from("application")
      .select("id")
      .eq("source_job_id", job.sourceJobId)
      .single();

    const form = new FormData();
    form.append("application_id", before?.id ?? "");

    const state = await removeApplication({ status: "idle" }, form);

    expect(state.status).toBe("applied");

    const { data: after } = await supabase
      .from("application")
      .select("id")
      .eq("source_job_id", job.sourceJobId);

    expect(after).toHaveLength(0);
  });

  it("reports a removal that matched nothing rather than reading as success", async () => {
    const form = new FormData();
    form.append("application_id", "3f7d9c31-0000-4000-8000-000000000000");

    const state = await removeApplication({ status: "idle" }, form);

    expect(state.status).toBe("failed");
    expect(state.message).toBe("That application is not there to remove.");
  });

  it("tells a real driver failure apart from a removal that matched nothing", async () => {
    /**
     * THE SECOND FAILURE PATH, AND THE ONE THAT LOOKED LIKE THE FIRST.
     * `removeApplication` has two ways to not remove a row: the delete raised
     * an error, or it succeeded and touched nothing. The test above covers the
     * second. This covers the first, and the pair is the point: if both
     * collapsed onto one message the reader would be told "that application is
     * not there" during a database outage, which is a specific and false claim
     * about their data rather than an apology about ours.
     *
     * THE FAILURE IS REAL, NOT MOCKED. A malformed id makes Postgres itself
     * raise `22P02`, invalid input syntax for uuid, through the real driver on
     * the real stack. A stubbed client would prove only that this file can
     * construct an error object. `/check verify` could not force this path
     * from the browser at all (a bogus id in the URL renders the ordinary list
     * with no confirmation), which is why it stayed unproven until now.
     */
    const form = new FormData();
    form.append("application_id", "not-a-uuid");

    const state = await removeApplication({ status: "idle" }, form);

    expect(state.status).toBe("failed");
    expect(state.message).toBe(
      "Something went wrong on our side. Try again in a moment.",
    );
    expect(state.message).not.toBe("That application is not there to remove.");
  });

  it("refuses an empty id before it reaches the database at all", async () => {
    /**
     * The guard clause ahead of both paths above. An absent form field is a
     * broken page rather than a database problem, and it must not be reported
     * as an outage.
     */
    const form = new FormData();
    form.append("application_id", "");

    const state = await removeApplication({ status: "idle" }, form);

    expect(state.status).toBe("failed");
    expect(state.message).toBe("That application is not there to remove.");
  });
});

describe("one person's applications are their own (AC-19)", () => {
  it("does not list, mark or remove another user's row", async () => {
    const job = listing();

    /** Recorded as the other person. */
    const previous = requestScope.jar;
    requestScope.jar = otherSession.jar;

    const otherRowId = await (async () => {
      await recordApplication(job);
      const supabase = await createClient(otherSession.jar);
      const { data } = await supabase
        .from("application")
        .select("id")
        .eq("source_job_id", job.sourceJobId)
        .single();
      return data?.id ?? "";
    })();

    requestScope.jar = previous;

    /** Now as the first user: the row is invisible in all three paths. */
    const rows = await readApplications();
    expect(rows.ok).toBe(true);
    if (rows.ok) {
      expect(
        rows.value.some((row) => row.sourceJobId === job.sourceJobId),
      ).toBe(false);
    }

    const marker = await readAppliedJobIds([job.sourceJobId]);
    expect(marker.ok).toBe(true);
    if (marker.ok) expect(marker.value.has(job.sourceJobId)).toBe(false);

    const form = new FormData();
    form.append("application_id", otherRowId);

    const removal = await removeApplication({ status: "idle" }, form);

    /** Refused, and refused visibly rather than silently doing nothing. */
    expect(removal.status).toBe("failed");

    /** And the other person still has their row. */
    const otherClient = await createClient(otherSession.jar);
    const { data: still } = await otherClient
      .from("application")
      .select("id")
      .eq("source_job_id", job.sourceJobId);

    expect(still).toHaveLength(1);
  });
});
