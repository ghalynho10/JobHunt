import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

import {
  AdzunaAttribution,
  JobsworthAttribution,
} from "@/components/adzuna-attribution";
import { ApplyControl } from "@/features/applications/apply-control";

import {
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import type { Listing } from "./adzuna";
import { ResultCard } from "./result-card";

/**
 * One search result (spec 0013, AC-6, AC-7, AC-8, invariant 7).
 *
 * The rule with the most teeth here is invariant 7: an absent optional field is
 * OMITTED, never rendered as a dash or an empty row. A dash beside a salary
 * reads as information about the salary. Several tests below assert that
 * something is NOT on the card, which is the only way to prove an omission.
 */

const NOW = new Date("2026-09-04T12:00:00Z");

function listing(over: Partial<Listing> = {}): Listing {
  return {
    source: "adzuna",
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
    ...over,
  } as Listing;
}

const render = (over: Partial<Listing> = {}) =>
  renderDeep(ResultCard({ listing: listing(over), now: NOW }) as never, [
    Button,
    JobsworthAttribution,
    AdzunaAttribution,
    /**
     * STOPPED AT, NOT INVOKED. `ApplyControl` is this feature's one Client
     * Component (spec 0014) and it calls `useActionState`, which has no React
     * runtime in the unit project's `node` environment. Its own behaviour is
     * covered by `apply-control.test.ts`; here it is a boundary, and what
     * matters is the props this card hands it.
     */
    ApplyControl,
  ]);

describe("the result card", () => {
  it("shows the title, company and location (AC-8)", () => {
    const text = textOf(render());

    expect(text).toContain("Software Engineer");
    expect(text).toContain("Acme");
    expect(text).toContain("Boston");
  });

  it("shows the snippet and the relative posted date (AC-8)", () => {
    const text = textOf(render());

    expect(text).toContain("A snippet of the posting.");
    expect(text).toContain("posted 3 days ago");
  });

  it("formats a salary range in the currency the country fixes (AC-8)", () => {
    const text = textOf(render());

    expect(text).toContain("$100,000");
    expect(text).toContain("$120,000");
  });

  it("reads as from when only a minimum is stated", () => {
    expect(textOf(render({ salaryMax: undefined }))).toContain("from $100,000");
  });

  it("reads as up to when only a maximum is stated", () => {
    expect(textOf(render({ salaryMin: undefined }))).toContain(
      "up to $120,000",
    );
  });

  it("links out to the real posting in a new tab (AC-8)", () => {
    const link = flatten(render()).find((element) => element.type === Button);
    const props = link!.props as {
      href?: string;
      external?: boolean;
      label?: string;
    };

    expect(props.href).toBe("https://www.adzuna.com/land/ad/111");
    expect(props.external).toBe(true);
  });

  it("names the specific job in the link's accessible name (AC-8)", () => {
    /**
     * Twenty cards all offering "View the posting" are indistinguishable in a
     * screen reader's link list, so the accessible name carries the job.
     */
    const link = flatten(render()).find((element) => element.type === Button);

    expect((link!.props as { label?: string }).label).toBe(
      "View the posting for Software Engineer at Acme",
    );
  });

  it("carries its own attribution, one per card (AC-6)", () => {
    /**
     * Invariant 4: attribution is per displayed advert, never per screen.
     * Asserted on the card because that is the unit the terms bind.
     */
    const attributions = flatten(render()).filter(
      (element) => element.type === AdzunaAttribution,
    );

    expect(attributions).toHaveLength(1);
  });
});

describe("a predicted salary is never shown as a stated one (AC-7, invariant 5)", () => {
  it("labels the figure as estimated", () => {
    expect(textOf(render({ salaryIsPredicted: true }))).toContain(
      "(estimated)",
    );
  });

  it("shows the Jobsworth attribution beside it", () => {
    const badges = flatten(render({ salaryIsPredicted: true })).filter(
      (element) => element.type === JobsworthAttribution,
    );

    expect(badges).toHaveLength(1);
  });

  it("shows neither on a stated salary", () => {
    const stated = render({ salaryIsPredicted: false });

    expect(textOf(stated)).not.toContain("(estimated)");
    expect(
      flatten(stated).filter((el) => el.type === JobsworthAttribution),
    ).toHaveLength(0);
  });
});

describe("an absent field is omitted, never faked (invariant 7)", () => {
  it("shows no salary line at all when there is no salary", () => {
    const bare = render({
      salaryMin: undefined,
      salaryMax: undefined,
      salaryCurrency: undefined,
    });

    expect(textOf(bare)).not.toContain("$");
    expect(textOf(bare)).not.toContain("—");
    expect(textOf(bare)).not.toContain("Salary");
  });

  it("shows no Jobsworth badge on a listing with no salary, even if flagged", () => {
    /**
     * The combination Adzuna can actually produce: predicted true with no
     * figure. Showing "estimated" beside nothing would be a label attached to
     * no value.
     */
    const badges = flatten(
      render({
        salaryMin: undefined,
        salaryMax: undefined,
        salaryCurrency: undefined,
        salaryIsPredicted: true,
      }),
    ).filter((element) => element.type === JobsworthAttribution);

    expect(badges).toHaveLength(0);
  });

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

  it("shows no date row when the posting has no date", () => {
    expect(textOf(render({ postedAt: undefined }))).not.toContain("posted");
  });
});
