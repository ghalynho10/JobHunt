import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@/lib/result";
import { SENTENCES } from "@/lib/usage-gating/copy";
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
