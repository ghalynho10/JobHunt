import { Suspense } from "react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@/lib/result";
import { SENTENCES } from "@/lib/usage-gating/copy";
import { ApplyControl } from "@/features/applications/apply-control";
import { FocusRecorder, FocusRestorer } from "@/features/search/focus-keeper";
import { SEARCH_COPY } from "@/features/search/copy";

import {
  flatten,
  renderDeepAsync,
  textOf,
} from "../../../../test/helpers/react-element";

/**
 * The search page's four visible states (spec 0013, AC-2 to AC-5, AC-9, AC-10).
 *
 * WHY THE STATES ARE TESTED TOGETHER, IN ONE FILE. The requirement is not that
 * each state renders; it is that a reader can TELL THEM APART. A gate refusal,
 * an empty result and a failure are three different things that happened, and
 * they demand three different responses from the person reading the screen.
 * The dangerous bug is not a missing state, which anyone would see, it is two
 * states collapsing into the same sentence or the same treatment. Several
 * assertions below compare states against each other for that reason.
 *
 * The two server reads are replaced at the module boundary, which is where
 * this page's own composition ends. Their real behaviour against the real
 * database, the real gate and a real recorded Adzuna response is proved in
 * `test/integration-serial/search-listings.test.ts`.
 */

const searchListings = vi.hoisted(() => vi.fn());
const readSearchPrefill = vi.hoisted(() => vi.fn());

/**
 * ONLY `searchListings` IS REPLACED. The rest of that module is kept, because
 * the attribution component imports its real constants (`ADZUNA_SOURCE`, the
 * two link targets), and a whole module replacement would delete them and fail
 * for a reason that has nothing to do with what is under test.
 */
vi.mock("@/features/search/adzuna", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/search/adzuna")>()),
  searchListings,
}));
vi.mock("@/features/search/preferences", () => ({ readSearchPrefill }));

/**
 * Added when feature 12 gave `/search` its applied markers (spec 0014, AC-9).
 * The real read reaches `cookies()` and the database; this file is about what
 * the page renders and how many searches it spends, so the marker read is
 * replaced at the module boundary. It has its own tests against the real stack.
 */
const readAppliedJobIds = vi.fn(() => Promise.resolve(success(new Set())));
vi.mock("@/features/applications/queries", () => ({ readAppliedJobIds }));

/**
 * Added when feature 14 gave `/search` its scoring (spec 0015). Both reach the
 * database or a real vendor: the gate reads the caller's own profile, and
 * `scoreListings()` spends twenty `ai_scoring` calls. This file is about what
 * the page renders and which of the three scoring states it renders, so both
 * are replaced at the module boundary.
 *
 * THE DEFAULT IS `thin`, WHICH IS THE UNSCORED LIST. Every assertion spec 0013
 * wrote about this page predates scoring and is about the result list itself,
 * so the default here is the state where that list renders exactly as it did
 * before. The scoring states each set their own.
 */
const readScoringProfile = vi.hoisted(() => vi.fn());
const scoreListings = vi.hoisted(() => vi.fn());
vi.mock("@/features/scoring/profile-gate", () => ({ readScoringProfile }));
vi.mock("@/features/scoring/score-listings", () => ({ scoreListings }));

const { default: SearchPage } = await import("./page");

const listing = {
  source: "adzuna",
  sourceJobId: "111",
  title: "Software Engineer",
  companyName: "Acme",
  location: "Boston",
  url: "https://www.adzuna.com/land/ad/111",
  descriptionSnippet: "A snippet.",
  salaryMin: 100000,
  salaryMax: 120000,
  salaryCurrency: "USD",
  salaryIsPredicted: false,
  postedAt: "2026-09-01T12:00:00Z",
};

async function render(params: Record<string, string | string[] | undefined>) {
  /**
   * `renderDeepAsync`, because this page's body is async server components.
   * The sync walker returns an empty shell here and every assertion below
   * would pass or fail for the wrong reason.
   */
  return renderDeepAsync(
    (await SearchPage({ searchParams: Promise.resolve(params) })) as never,
    /**
     * `ApplyControl` is stopped at rather than invoked: it is a Client
     * Component calling `useActionState`, which has no React runtime in the
     * unit project's `node` environment (spec 0014).
     *
     * `FocusRecorder` and `FocusRestorer` are stopped at for the same reason,
     * one version on: both call `useEffect` (spec 0015, AC-17). Stopping at
     * them is also what lets the tests below assert WHERE each one sits, since
     * a stopped element keeps its own identity in the tree.
     */
    [ApplyControl, FocusRecorder, FocusRestorer],
  );
}

function alerts(tree: unknown) {
  return flatten(tree as never).filter(
    (element) => (element.props as { role?: string }).role === "alert",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  readSearchPrefill.mockResolvedValue(
    success({ title: undefined, location: undefined }),
  );
  readScoringProfile.mockResolvedValue({ kind: "thin" });
});

describe("a bare visit (AC-9)", () => {
  it("runs no search at all", async () => {
    /**
     * THE BUDGET ASSERTION, and the reason it is first. Landing on `/search`
     * must not spend a person's weekly allowance. `searchListings()` is the
     * only thing that can spend, so proving it was never called proves the
     * criterion at its source rather than by inspecting a counter afterwards.
     */
    await render({});

    expect(searchListings).not.toHaveBeenCalled();
  });

  it("prefills the fields from the caller's stated preferences", async () => {
    readSearchPrefill.mockResolvedValue(
      success({ title: "data engineer", location: "Boston" }),
    );

    const tree = await render({});

    expect(textOf(tree)).toContain("Search");
    const inputs = flatten(tree).filter((el) => el.type === "input");
    expect(
      inputs.map((el) => (el.props as { defaultValue?: string }).defaultValue),
    ).toEqual(["data engineer", "Boston"]);
  });

  it("still shows a usable form when the preference read fails", async () => {
    /**
     * A prefill failure must not block searching. The failure is already
     * reported by `failure()` itself; the reader can still type.
     */
    readSearchPrefill.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "Could not read search preferences.",
      }),
    );

    const tree = await render({});

    expect(flatten(tree).filter((el) => el.type === "input")).toHaveLength(2);
  });

  it("says the preferences could not be loaded rather than showing empty fields silently", async () => {
    /**
     * THE TEST THAT USED TO ASSERT THE OPPOSITE. It locked in zero alerts on
     * this branch, which meant a failed read rendered the exact screen a
     * reader with no stated preferences sees. Empty fields are AC-9's meaning
     * of "no stated preference", so the failure was borrowing that meaning: a
     * default that reads like success, which the project's own rule forbids.
     * Raised by a fresh model review on 2026-09-04.
     */
    readSearchPrefill.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "Could not read search preferences.",
      }),
    );

    const tree = await render({});

    expect(alerts(tree)).toHaveLength(1);
    expect(textOf(tree)).toContain(SEARCH_COPY.prefillFailed);
  });

  it("says nothing of the sort when the caller simply has no preferences", async () => {
    /**
     * The other half, and the reason the sentence exists. The two screens must
     * not be the same, so this pins the no preferences case to no alert at all.
     */
    readSearchPrefill.mockResolvedValue(
      success({ title: undefined, location: undefined }),
    );

    const tree = await render({});

    expect(alerts(tree)).toHaveLength(0);
    expect(textOf(tree)).not.toContain(SEARCH_COPY.prefillFailed);
  });
});

describe("a search that returns listings (AC-1)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: [listing] }),
    );
  });

  it("renders the listings", async () => {
    const text = textOf(await render({ q: "engineer", where: "Boston" }));

    expect(text).toContain("Software Engineer");
    expect(text).toContain("Acme");
  });

  it("passes the URL's own terms through to the search", async () => {
    await render({ q: "engineer", where: "Boston" });

    expect(searchListings).toHaveBeenCalledWith({
      title: "engineer",
      location: "Boston",
    });
  });

  it("spends exactly one search per render (AC-10)", async () => {
    await render({ q: "engineer", where: "Boston" });

    expect(searchListings).toHaveBeenCalledOnce();
  });

  it("takes only the first value when a parameter is repeated", async () => {
    /**
     * A crafted `?q=a&q=b` must not smuggle a second term into one field, and
     * must not be joined into "a,b" either.
     */
    await render({ q: ["engineer", "SMUGGLED"], where: "Boston" });

    expect(searchListings).toHaveBeenCalledWith({
      title: "engineer",
      location: "Boston",
    });
  });

  it("searches on a title alone, with no location", async () => {
    await render({ q: "engineer" });

    expect(searchListings).toHaveBeenCalledWith({
      title: "engineer",
      location: undefined,
    });
  });

  it("searches on a location alone, with no title", async () => {
    await render({ where: "Boston" });

    expect(searchListings).toHaveBeenCalledWith({
      title: undefined,
      location: "Boston",
    });
  });
});

describe("the empty state (AC-4)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(success({ allowed: true, value: [] }));
  });

  it("says so in the engineer's words", async () => {
    expect(textOf(await render({ q: "nothing" }))).toContain(
      SEARCH_COPY.noResults,
    );
  });

  it("is NOT announced as an alert, being an ordinary outcome", async () => {
    /**
     * The distinction this whole file exists for. A search that legitimately
     * matched nothing is not a failure, and treating it as one teaches people
     * the product is broken when it is merely honest.
     */
    expect(alerts(await render({ q: "nothing" }))).toHaveLength(0);
  });

  it("shows no attribution, since there is nothing to attribute", async () => {
    // Invariant 4: attribution is per displayed advert, never per screen.
    const tree = await render({ q: "nothing" });

    expect(textOf(tree)).not.toContain("Jobs by");
    expect(textOf(tree)).not.toContain("Adzuna Jobsworth");
  });
});

describe("the gate refusal state (AC-3)", () => {
  it.each([
    "account_week_cap_reached",
    "global_day_cap_reached",
    "global_month_cap_reached",
    "kill_switch_engaged",
    "kill_switch_unavailable",
  ] as const)("renders feature 10's %s sentence verbatim", async (reason) => {
    /**
     * VERBATIM IS THE REQUIREMENT. Feature 10 owns these five sentences and
     * chose each one carefully (two of them lead with "for everyone, not just
     * you" so nobody blames their own usage). This feature renders them and
     * writes none of its own, so a paraphrase here would be a silent
     * regression in someone else's deliberate wording.
     */
    searchListings.mockResolvedValue(success({ allowed: false, reason }));

    expect(textOf(await render({ q: "engineer" }))).toContain(
      SENTENCES[reason],
    );
  });

  it("is announced as an alert, unlike the empty state", async () => {
    searchListings.mockResolvedValue(
      success({ allowed: false, reason: "kill_switch_engaged" }),
    );

    expect(alerts(await render({ q: "engineer" }))).toHaveLength(1);
  });

  it("renders no listings and no attribution", async () => {
    searchListings.mockResolvedValue(
      success({ allowed: false, reason: "account_week_cap_reached" }),
    );

    const tree = await render({ q: "engineer" });

    expect(textOf(tree)).not.toContain("Software Engineer");
    expect(textOf(tree)).not.toContain("Jobs by");
  });
});

describe("the failure state (AC-5)", () => {
  it.each([
    "external_service_failed",
    "response_malformed",
    "database_unavailable",
    "session_missing",
    "usage_gate_misconfigured",
  ] as const)("shows COPY-5 when the search fails with %s", async (kind) => {
    searchListings.mockResolvedValue(
      failure({ kind, severity: "unexpected", message: "internal detail" }),
    );

    expect(textOf(await render({ q: "engineer" }))).toContain(
      SEARCH_COPY.searchFailed,
    );
  });

  it("never leaks the internal failure message to the reader", async () => {
    /**
     * The `Failure.message` is safe to show by contract, but this page shows
     * its own generic sentence instead, so an internal noun (a table name, a
     * provider name) cannot reach the screen through a new failure kind.
     */
    searchListings.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "relation public.usage_gate_counter does not exist",
      }),
    );

    expect(textOf(await render({ q: "engineer" }))).not.toContain(
      "usage_gate_counter",
    );
  });

  it("is announced as an alert", async () => {
    searchListings.mockResolvedValue(
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "Could not reach Adzuna.",
      }),
    );

    expect(alerts(await render({ q: "engineer" }))).toHaveLength(1);
  });
});

describe("the blank query (AC-2)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      failure({
        kind: "validation_failed",
        severity: "expected",
        message: "Enter a title or a location to search.",
      }),
    );
  });

  it("shows COPY-3 rather than the generic failure sentence", async () => {
    /**
     * The state most easily collapsed into the failure state, since both
     * arrive as a `Failure`. They are different events: one is the reader
     * needing to type something, the other is the product being broken.
     */
    const text = textOf(await render({ q: "", where: "" }));

    expect(text).toContain(SEARCH_COPY.bothFieldsBlank);
    expect(text).not.toContain(SEARCH_COPY.searchFailed);
  });

  it("keeps the form on screen so the reader can correct it", async () => {
    const tree = await render({ q: "", where: "" });

    expect(flatten(tree).filter((el) => el.type === "input")).toHaveLength(2);
  });
});

describe("the four states are told apart, not merely present", () => {
  const sentences = [
    SEARCH_COPY.noResults,
    SEARCH_COPY.searchFailed,
    SEARCH_COPY.bothFieldsBlank,
    SENTENCES.account_week_cap_reached,
  ];

  it("gives each state a distinct sentence", () => {
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  it("never shows one state's sentence in another state", async () => {
    /**
     * The regression this guards: a later edit reusing one sentence for two
     * outcomes. Each render must contain its own sentence and none of the
     * other three.
     */
    const cases = [
      {
        result: success({ allowed: true, value: [] }),
        expected: SEARCH_COPY.noResults,
      },
      {
        result: failure({
          kind: "external_service_failed" as const,
          severity: "unexpected" as const,
          message: "x",
        }),
        expected: SEARCH_COPY.searchFailed,
      },
      {
        result: success({
          allowed: false,
          reason: "account_week_cap_reached" as const,
        }),
        expected: SENTENCES.account_week_cap_reached,
      },
    ];

    for (const { result, expected } of cases) {
      searchListings.mockResolvedValue(result);
      const text = textOf(await render({ q: "engineer" }));

      expect(text).toContain(expected);
      for (const other of sentences.filter((s) => s !== expected)) {
        expect(text, `two states share a sentence`).not.toContain(other);
      }
    }
  });
});

describe("the applied marker read fails (AC-9, COPY-8)", () => {
  /**
   * THE BRANCH NOTHING PROVED UNTIL NOW. `/check verify` on 2026-09-05 could
   * not force this read to fail from outside the code (it needs a privilege
   * change the local stack refuses), and the stub at the top of this file
   * returns a success on every other path, so the failure branch shipped with
   * no coverage in either direction.
   *
   * WHY IT MATTERS MORE THAN AN ORDINARY BRANCH. `page.tsx` falls back to
   * `alreadyApplied={false}` for every card when the read fails. That is the
   * correct fallback (it cannot invent markers) but on its own it renders a
   * screen identical to the one a reader who has applied to nothing sees. The
   * sentence is the only thing separating "we could not check" from "you have
   * applied to none of these", and the second is a claim the app cannot stand
   * behind. This is the "default that reads like success" `AGENTS.md` forbids.
   */
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: [listing] }),
    );
    readAppliedJobIds.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "internal detail the reader must never see",
      }) as never,
    );
  });

  it("says the applied state could not be read", async () => {
    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain(SEARCH_COPY.appliedReadFailed);
  });

  it("still renders the results, because the failure costs the markers and nothing else", async () => {
    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain("Software Engineer");
    expect(text).toContain("Acme");
  });

  it("announces it, so a reader who does not re-scan the page still learns of it", async () => {
    const announced = alerts(await render({ q: "engineer" })).map((element) =>
      textOf(element),
    );

    expect(
      announced.some((t) => t.includes(SEARCH_COPY.appliedReadFailed)),
    ).toBe(true);
  });

  it("never leaks the internal failure message to the reader", async () => {
    const text = textOf(await render({ q: "engineer" }));

    expect(text).not.toContain("internal detail the reader must never see");
    expect(text).not.toContain("database_unavailable");
  });

  it("is absent when the read succeeds, so the sentence tracks the failure and not the render", async () => {
    /**
     * The non vacuity check. Without this, an unconditional sentence would
     * pass every assertion above while telling a reader with working markers
     * that their markers are broken.
     */
    readAppliedJobIds.mockResolvedValue(success(new Set()) as never);

    const text = textOf(await render({ q: "engineer" }));

    expect(text).not.toContain(SEARCH_COPY.appliedReadFailed);
  });
});

/**
 * Scoring on the results page (spec 0015, AC-7, AC-9, AC-10, AC-11).
 *
 * WHAT THIS BLOCK CANNOT SEE. `/search` renders the pending list as a
 * `<Suspense>` FALLBACK, and a fallback is a prop rather than a child, so the
 * walker never enters it: every assertion below is about the RESOLVED half of
 * the boundary. The pending half is proved directly in
 * `src/features/search/result-list.test.tsx` (the `aria-busy` marker) and in
 * `src/features/scoring/score-card.test.ts` (`COPY-4`), and whether the reader
 * actually sees the list before the scores arrive needs a real browser, so it
 * lives in this spec's `verify.md`.
 */

const scoreOf = (band: string) =>
  success({
    allowed: true,
    value: {
      band,
      matchedSkills: [],
      notMentionedSkills: [],
      reasoning: `reasoning for ${band}`,
      sponsorshipSignal: "not_stated",
    },
  });

const twoListings = [
  { ...listing, sourceJobId: "1", title: "First Job" },
  { ...listing, sourceJobId: "2", title: "Second Job" },
];

/** The order the reader actually reads, taken off the rendered list items. */
function titlesInOrder(tree: unknown) {
  return flatten(tree as never)
    .filter((element) => element.type === "li")
    .map((element) => textOf(element))
    .map((text) => (text.includes("First Job") ? "First Job" : "Second Job"));
}

describe("the thin profile gate (AC-7)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: [listing] }),
    );
    readScoringProfile.mockResolvedValue({ kind: "thin" });
  });

  it("spends nothing: no listing is scored at all", async () => {
    /**
     * THE BUDGET ASSERTION, and the reason it is first, mirroring the bare
     * visit test at the top of this file. A profile with no skills and no work
     * history has nothing to score against, so twenty `ai_scoring` calls would
     * each spend budget to invent a judgment out of an empty profile. Proving
     * `scoreListings` was never called proves AC-7 at its source.
     */
    await render({ q: "engineer" });

    expect(scoreListings).not.toHaveBeenCalled();
  });

  it("says what to add, and links to the profile (COPY-5)", async () => {
    const tree = await render({ q: "engineer" });

    expect(textOf(tree)).toContain("Add your skills or work experience");

    const links = flatten(tree as never).filter(
      (element) => (element.props as { href?: string }).href === "/profile",
    );
    expect(links.length).toBeGreaterThan(0);
  });

  it("is not a failure, so it raises no alert", async () => {
    /**
     * An empty profile is an ordinary starting state, not something that broke.
     * This is the same convention the empty results state already sets, and the
     * line that keeps the thin gate visibly different from the profile read
     * failure below it.
     */
    const announced = alerts(await render({ q: "engineer" })).map(textOf);

    expect(
      announced.some((t) => t.includes("Add your skills or work experience")),
    ).toBe(false);
  });

  it("still renders the results, unscored", async () => {
    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain("Software Engineer");
  });
});

describe("the profile read failing", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: [listing] }),
    );
    readScoringProfile.mockResolvedValue({ kind: "unavailable" });
  });

  it("says so out loud, rather than borrowing the thin profile sentence", async () => {
    /**
     * THE DEFAULT THAT READS LIKE SUCCESS, and the reason this state exists at
     * all. Falling back to `COPY-5` would tell somebody with a full profile to
     * go and fill it in, during a database outage, and the screen would look
     * completely normal.
     */
    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain("couldn't read your profile");
    expect(text).not.toContain("Add your skills or work experience");
  });

  it("raises an alert, because this one really did fail", async () => {
    const announced = alerts(await render({ q: "engineer" })).map(textOf);

    expect(
      announced.some((t) => t.includes("couldn't read your profile")),
    ).toBe(true);
  });

  it("scores nothing and still renders the results", async () => {
    const text = textOf(await render({ q: "engineer" }));

    expect(scoreListings).not.toHaveBeenCalled();
    expect(text).toContain("Software Engineer");
  });
});

describe("ranking the resolved outcomes (AC-9)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: twoListings }),
    );
    readScoringProfile.mockResolvedValue({
      kind: "score",
      profile: {
        summary: undefined,
        skills: [],
        experience: [],
        preferences: undefined,
      },
    });
  });

  it("puts the better band first, whatever order Adzuna returned", async () => {
    scoreListings.mockResolvedValue([
      scoreOf("weak_match"),
      scoreOf("strong_match"),
    ]);

    expect(titlesInOrder(await render({ q: "engineer" }))).toEqual([
      "Second Job",
      "First Job",
    ]);
  });

  it("keeps Adzuna's own order between two listings in the same band", async () => {
    /**
     * THE COUNTERWEIGHT TO THE TEST ABOVE, and the half that would go unnoticed:
     * a sort that reordered ties would replace Adzuna's own relevance ordering
     * with an arbitrary one, and every assertion about band ordering would still
     * pass. `Array.prototype.sort` has been required to be stable since ES2019,
     * which is what AC-9 leans on rather than a second comparison.
     */
    scoreListings.mockResolvedValue([
      scoreOf("good_match"),
      scoreOf("good_match"),
    ]);

    expect(titlesInOrder(await render({ q: "engineer" }))).toEqual([
      "First Job",
      "Second Job",
    ]);
  });

  it("announces the one time re-sort (AC-16, COPY-7)", async () => {
    scoreListings.mockResolvedValue([
      scoreOf("good_match"),
      scoreOf("good_match"),
    ]);

    const tree = await render({ q: "engineer" });
    const statuses = flatten(tree as never).filter(
      (element) => (element.props as { role?: string }).role === "status",
    );

    expect(statuses.map(textOf)).toContain("Results are now ranked by fit.");
  });
});

describe("one listing failing while the others do not (AC-10)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: twoListings }),
    );
    readScoringProfile.mockResolvedValue({
      kind: "score",
      profile: {
        summary: undefined,
        skills: [],
        experience: [],
        preferences: undefined,
      },
    });
    scoreListings.mockResolvedValue([
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "vendor down",
      }),
      scoreOf("strong_match"),
    ]);
  });

  it("marks that card alone, and leaves its sibling's real band standing", async () => {
    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain("Could not score this listing right now.");
    expect(text).toContain("Strong match");
  });

  it("sorts the failed card after every scored one", async () => {
    /**
     * A failure is not a low score and must never be ranked as one. Sorting it
     * into the middle of the list would make a broken call read as a considered
     * judgment about that job.
     */
    expect(titlesInOrder(await render({ q: "engineer" }))).toEqual([
      "Second Job",
      "First Job",
    ]);
  });

  it("raises no page level alert, because the page did not fail", async () => {
    const announced = alerts(await render({ q: "engineer" })).map(textOf);

    expect(
      announced.some((t) => t.includes("Could not score this listing")),
    ).toBe(false);
  });
});

describe("the usage cap refusing the batch (AC-11)", () => {
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: twoListings }),
    );
    readScoringProfile.mockResolvedValue({
      kind: "score",
      profile: {
        summary: undefined,
        skills: [],
        experience: [],
        preferences: undefined,
      },
    });
  });

  it("says it once, at page level, in feature 10's own words", async () => {
    scoreListings.mockResolvedValue([
      success({ allowed: false, reason: "account_week_cap_reached" }),
      success({ allowed: false, reason: "account_week_cap_reached" }),
    ]);

    const text = textOf(await render({ q: "engineer" }));
    const sentence = SENTENCES["account_week_cap_reached"];

    /** Once, not once per refused card. */
    expect(text.split(sentence)).toHaveLength(2);
  });

  it("shows no per card failure note, so a cap never reads as a breakage", async () => {
    scoreListings.mockResolvedValue([
      success({ allowed: false, reason: "global_day_cap_reached" }),
      success({ allowed: false, reason: "global_day_cap_reached" }),
    ]);

    const text = textOf(await render({ q: "engineer" }));

    expect(text).not.toContain("Could not score this listing right now.");
  });

  it("uses the first refused call's reason when the batch straddles two caps", async () => {
    /**
     * AC-11 names the FIRST refusal in the listing's original order, which is
     * why the reason has to be read before the sort runs. Two refusals with
     * different reasons is possible: twenty concurrent calls can cross more
     * than one cap boundary within one batch.
     */
    scoreListings.mockResolvedValue([
      success({ allowed: false, reason: "global_day_cap_reached" }),
      success({ allowed: false, reason: "account_week_cap_reached" }),
    ]);

    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain(SENTENCES["global_day_cap_reached"]);
    expect(text).not.toContain(SENTENCES["account_week_cap_reached"]);
  });

  it("still shows a band on a listing that was scored before the cap hit", async () => {
    scoreListings.mockResolvedValue([
      scoreOf("good_match"),
      success({ allowed: false, reason: "account_week_cap_reached" }),
    ]);

    const text = textOf(await render({ q: "engineer" }));

    expect(text).toContain("Good match");
    expect(text).toContain(SENTENCES["account_week_cap_reached"]);
  });
});

/**
 * The re-rank announcement only fires when something was actually ranked
 * (spec 0015, AC-16, `COPY-7`).
 *
 * FOUND BY `/check verify` ON 2026-09-06, against the running app, in two
 * independent scenarios: a batch where the usage cap refused every call, and a
 * batch where every vendor call failed. Both rendered "Results are now ranked
 * by fit." over a list that was in Adzuna's untouched order, because every
 * outcome tied at the same rank and the sort was a no operation.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. The sentence is not decoration, it is the
 * page's one claim about what just happened, and `role="status"` reads it out
 * to somebody who cannot see the list to check. Telling a screen reader user
 * their results are ranked by fit when nothing was scored is the "default that
 * reads like success" `AGENTS.md` forbids, and it is worse here than a silent
 * omission would be: a reader who trusts it stops looking for the cap notice
 * that explains why there are no bands.
 *
 * THE CONDITION IS "AT LEAST ONE CARD SCORED", not "no refusals" and not "no
 * failures". A partly scored batch genuinely is ranked by fit, so the sentence
 * is true there and still renders.
 */
describe("the re-rank announcement (AC-16, COPY-7)", () => {
  const statuses = (tree: unknown) =>
    flatten(tree as never)
      .filter(
        (element) => (element.props as { role?: string }).role === "status",
      )
      .map((element) => textOf(element));

  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: twoListings }),
    );
    readScoringProfile.mockResolvedValue({
      kind: "score",
      profile: {
        summary: undefined,
        skills: [],
        experience: [],
        preferences: undefined,
      },
    });
  });

  it("announces the ranking when at least one listing was scored", async () => {
    /**
     * THE COUNTERWEIGHT, and it comes first so the two below cannot pass by the
     * announcement simply having been deleted.
     */
    scoreListings.mockResolvedValue([
      scoreOf("good_match"),
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "vendor down",
      }),
    ]);

    expect(statuses(await render({ q: "engineer" }))).toContain(
      "Results are now ranked by fit.",
    );
  });

  it("stays silent when the usage cap refused every call", async () => {
    scoreListings.mockResolvedValue([
      success({ allowed: false, reason: "account_week_cap_reached" }),
      success({ allowed: false, reason: "account_week_cap_reached" }),
    ]);

    const tree = await render({ q: "engineer" });

    expect(statuses(tree)).toEqual([]);
    /** The cap notice is what the reader needs here, and it still renders. */
    expect(textOf(tree)).toContain(SENTENCES["account_week_cap_reached"]);
  });

  it("stays silent when every vendor call failed", async () => {
    scoreListings.mockResolvedValue([
      failure({
        kind: "external_service_failed",
        severity: "unexpected",
        message: "vendor down",
      }),
      failure({
        kind: "response_malformed",
        severity: "unexpected",
        message: "bad shape",
      }),
    ]);

    const tree = await render({ q: "engineer" });

    expect(statuses(tree)).toEqual([]);
    /** The per card failure state is what the reader needs here. */
    expect(textOf(tree)).toContain("Could not score this listing right now.");
  });
});

describe("keyboard focus across the reveal (spec 0015, AC-17)", () => {
  /**
   * WHERE EACH COMPONENT SITS IS THE WHOLE MECHANISM, which is why it is tested
   * structurally rather than left to a browser check alone. Both would still
   * render, still typecheck and still look right in review if they were
   * swapped, and the only symptom would be that focus is silently never
   * restored: the recorder torn down by the very reveal it exists to survive,
   * the restorer mounted before the swap it exists to react to.
   */
  /**
   * A WALKER OF ITS OWN, BECAUSE `flatten` CANNOT SEE A BOUNDARY. That helper
   * walks THROUGH any element whose type is a symbol and never reports it,
   * which is right for fragments and wrong here: `Suspense` is a symbol too, so
   * `flatten` returns the boundary's children while the boundary itself is
   * invisible. Every assertion below is about which side of it something sits
   * on, so the boundary has to be a thing this test can hold.
   */
  const suspenseBoundaries = (node: unknown): readonly ReactElement[] => {
    if (Array.isArray(node)) return node.flatMap(suspenseBoundaries);
    if (typeof node !== "object" || node === null || !("type" in node))
      return [];

    const element = node as ReactElement;
    const { children } = element.props as { children?: unknown };
    const inside = suspenseBoundaries(children);

    return element.type === Suspense ? [element, ...inside] : inside;
  };

  /**
   * THE SCORED PATH IS OPTED INTO EXPLICITLY, because the suite's default
   * profile is thin and a thin profile renders no boundary at all. Without
   * this, every assertion below would look for a `Suspense` on a page that
   * correctly has none, and the last test in this block, which asserts exactly
   * that absence, would be the only one passing for the right reason.
   */
  beforeEach(() => {
    searchListings.mockResolvedValue(
      success({ allowed: true, value: twoListings }),
    );
    readScoringProfile.mockResolvedValue({
      kind: "score",
      profile: {
        summary: undefined,
        skills: [],
        experience: [],
        preferences: undefined,
      },
    });
    scoreListings.mockResolvedValue([
      scoreOf("strong_match"),
      scoreOf("weak_match"),
    ]);
  });

  const boundary = (tree: unknown) => {
    const found = suspenseBoundaries(tree);

    expect(found).toHaveLength(1);

    return found[0]!;
  };

  const has = (tree: unknown, type: unknown) =>
    flatten(tree as never).some((element) => element.type === type);

  it("records outside the boundary, so the reveal never unmounts the listener", async () => {
    const tree = await render({ q: "engineer" });

    expect(has(tree, FocusRecorder)).toBe(true);
    /**
     * The claim with teeth: it is in the page but NOT among the boundary's
     * descendants. Inside, it would be destroyed at the exact moment its answer
     * is needed, and nothing would fail except a reader losing their place.
     */
    expect(has(boundary(tree), FocusRecorder)).toBe(false);
  });

  it("restores inside the resolved content, because mounting is the reveal signal", async () => {
    const tree = await render({ q: "engineer" });

    expect(has(boundary(tree), FocusRestorer)).toBe(true);
  });

  it("renders neither on a list that never re-sorts", async () => {
    /**
     * A profile too thin to score renders the plain unscored list with no
     * boundary and no reveal (AC-7), so there is nothing that can orphan a
     * reader's focus and nothing here to restore it. Shipping the listener
     * anyway would put client JavaScript on a page that has no use for it,
     * against the deliberate minimum spec 0015's Consequences records.
     */
    readScoringProfile.mockResolvedValue({ kind: "thin" });

    const tree = await render({ q: "engineer" });

    expect(has(tree, FocusRecorder)).toBe(false);
    expect(has(tree, FocusRestorer)).toBe(false);
  });
});
