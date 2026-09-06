import { describe, expect, it } from "vitest";

import {
  AdzunaAttribution,
  JobsworthAttribution,
} from "@/components/adzuna-attribution";
import { Button } from "@/components/ui/button";

import {
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { ApplicationCard } from "./application-card";
import type { ApplicationRow } from "./queries";

/**
 * One recorded application (spec 0014, AC-7, AC-8, AC-11, AC-18).
 *
 * THE RULE WITH THE MOST TEETH HERE IS AC-7, and it is the reason this feature
 * added a database column at all. A predicted salary must never render
 * indistinguishably from a stated one, and the row carries three states rather
 * than two: predicted, stated, and no pay quoted. Several tests below assert
 * that something is NOT on the card, which is the only way to prove the third
 * state is not being collapsed into the second.
 */

const NOW = new Date("2026-09-05T12:00:00Z");

function application(over: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: "3f7d9c31-1111-4000-8000-000000000000",
    sourceJobId: "111",
    title: "Software Engineer",
    companyName: "Acme",
    location: "Boston",
    url: "https://www.adzuna.com/land/ad/111",
    descriptionSnippet: "A snippet of the posting.",
    salaryMin: 100000,
    salaryMax: 120000,
    salaryCurrency: "USD",
    salaryIsPredicted: false,
    postedAt: "2026-09-01T12:00:00Z",
    appliedAt: "2026-09-05T09:00:00Z",
    ...over,
  };
}

const render = (over: Partial<ApplicationRow> = {}) =>
  renderDeep(
    ApplicationCard({ application: application(over), now: NOW }) as never,
    [Button, JobsworthAttribution, AdzunaAttribution],
  );

const has = (tree: unknown, type: unknown) =>
  flatten(tree as never).some((element) => element.type === type);

const countOf = (tree: unknown, type: unknown) =>
  flatten(tree as never).filter((element) => element.type === type).length;

describe("the recorded application (AC-18)", () => {
  it("shows the whole stored snapshot", () => {
    const text = textOf(render());

    expect(text).toContain("Software Engineer");
    expect(text).toContain("Acme");
    expect(text).toContain("Boston");
    expect(text).toContain("A snippet of the posting.");
    expect(text).toContain("$100,000 to $120,000");
  });

  it("shows the applied date absolutely and the posted date relatively", () => {
    /**
     * THE TWO DATES ARE FORMATTED DIFFERENTLY ON PURPOSE. An applications list
     * is an archive read months later, where "applied 3 days ago" stops meaning
     * anything; a posting's whole meaning is freshness. Asserting both together
     * is what stops a later change collapsing them onto one formatter.
     */
    const text = textOf(render());

    expect(text).toContain("applied September 5, 2026");
    expect(text).toContain("posted 4 days ago");
  });

  it("links out to the real posting, named for this job", () => {
    const link = flatten(render() as never).find(
      (element) =>
        element.type === Button &&
        "external" in (element.props as Record<string, unknown>),
    );

    expect((link?.props as { href?: string }).href).toBe(
      "https://www.adzuna.com/land/ad/111",
    );
    /**
     * Ten rows all carrying a link named "View the posting" are ten identical
     * entries in a screen reader's link list, so the accessible name says which
     * posting this one is.
     */
    expect((link?.props as { label?: string }).label).toBe(
      "View the posting for Software Engineer at Acme",
    );
  });

  it("offers removal through a URL that mutates nothing (AC-11)", () => {
    /**
     * A LINK, NOT A SUBMIT. Reaching `?remove=<id>` only renders the question,
     * which is what keeps it safe to prefetch or bookmark. A later change that
     * turned this into a form would make the link itself destructive.
     */
    const remove = flatten(render() as never).find(
      (element) =>
        element.type === Button &&
        String((element.props as { href?: string }).href ?? "").includes(
          "remove=",
        ),
    );

    expect((remove?.props as { href?: string }).href).toBe(
      "/applications?remove=3f7d9c31-1111-4000-8000-000000000000",
    );
    expect((remove?.props as { label?: string }).label).toContain(
      "Software Engineer",
    );
  });
});

describe("a stored predicted salary is never shown as a stated one (AC-7)", () => {
  it("labels the figure as estimated and carries the Jobsworth attribution", () => {
    const tree = render({ salaryIsPredicted: true });

    expect(textOf(tree)).toContain("$100,000 to $120,000 (estimated)");
    expect(has(tree, JobsworthAttribution)).toBe(true);
  });

  it("shows neither on a stated salary", () => {
    const tree = render({ salaryIsPredicted: false });

    expect(textOf(tree)).not.toContain("estimated");
    expect(has(tree, JobsworthAttribution)).toBe(false);
  });

  it("treats an absent flag as no pay quoted, not as a stated figure", () => {
    /**
     * THE THIRD STATE, AND THE ONE A BOOLEAN COLUMN WOULD HAVE LOST. `undefined`
     * here means the source quoted no pay at all, which is why the column is
     * nullable and why the card tests `=== true` rather than truthiness. A row
     * with no flag and no figures must render no salary line at all rather than
     * an unlabelled one.
     */
    const tree = render({
      salaryIsPredicted: undefined,
      salaryMin: undefined,
      salaryMax: undefined,
      salaryCurrency: undefined,
    });

    expect(textOf(tree)).not.toContain("estimated");
    expect(textOf(tree)).not.toContain("$");
    expect(has(tree, JobsworthAttribution)).toBe(false);
  });
});

describe("Adzuna's attribution follows the advert here too (AC-8)", () => {
  it("carries exactly one attribution per displayed application", () => {
    /**
     * The obligation is per DISPLAYED ADVERT, never per screen (spec 0013,
     * invariant 4). A recorded application displays a title, a company, a
     * salary and a link to the posting, so it owes the same attribution the
     * results list owes.
     */
    expect(countOf(render(), AdzunaAttribution)).toBe(1);
  });
});

describe("an absent field is omitted, never faked (spec 0013, invariant 7)", () => {
  it("shows the company alone when the location is missing", () => {
    const text = textOf(render({ location: undefined }));

    expect(text).toContain("Acme");
    expect(text).not.toContain("·");
  });

  it("shows no snippet row when there is no snippet", () => {
    expect(textOf(render({ descriptionSnippet: undefined }))).not.toContain(
      "A snippet",
    );
  });

  it("shows no posted date when the record has none", () => {
    expect(textOf(render({ postedAt: undefined }))).not.toContain("posted");
  });
});
