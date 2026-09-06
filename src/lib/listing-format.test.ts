import { describe, expect, it } from "vitest";

import { appliedOnText, relativePostedAt, salaryText } from "./listing-format";

/**
 * The listing formatters two features share (spec 0014, `## Feature design`).
 *
 * MOVED HERE WITH THE CODE, from `src/features/search/result-card.test.ts`.
 * `relativePostedAt`'s tests came across unchanged, timezone case included,
 * because the guarantee they prove did not change when the function moved: it
 * is now relied on by two screens rather than one, which makes it stronger, not
 * weaker.
 */

const NOW = new Date("2026-09-04T12:00:00Z");

describe("relativePostedAt (AC-8)", () => {
  it("reads in hours inside the first day", () => {
    expect(relativePostedAt("2026-09-04T09:00:00Z", NOW)).toBe(
      "posted 3 hours ago",
    );
  });

  it("reads in days beyond the first", () => {
    expect(relativePostedAt("2026-09-01T12:00:00Z", NOW)).toBe(
      "posted 3 days ago",
    );
  });

  it("says yesterday in words rather than 1 day ago", () => {
    expect(relativePostedAt("2026-09-03T12:00:00Z", NOW)).toBe(
      "posted yesterday",
    );
  });

  it("returns nothing when the timestamp is absent", () => {
    // Not an empty string and not a placeholder: the row disappears entirely.
    expect(relativePostedAt(undefined, NOW)).toBeUndefined();
  });

  it("returns nothing rather than Invalid Date when the timestamp is junk", () => {
    expect(relativePostedAt("not a date", NOW)).toBeUndefined();
  });

  it("is the same in any timezone, being an elapsed difference", () => {
    /**
     * The value sourcing risk this exists for: a relative date computed from a
     * local calendar day would differ either side of the date line. Computed
     * from elapsed milliseconds, it cannot.
     */
    const seen = ["UTC", "Pacific/Kiritimati", "Pacific/Midway"].map((tz) => {
      process.env.TZ = tz;
      return relativePostedAt("2026-09-01T12:00:00Z", NOW);
    });
    process.env.TZ = "UTC";

    expect(new Set(seen).size).toBe(1);
  });
});

describe("salaryText (spec 0013 invariant 7, spec 0014 AC-18)", () => {
  it("renders a range with both figures", () => {
    expect(
      salaryText({
        salaryMin: 100000,
        salaryMax: 120000,
        salaryCurrency: "USD",
      }),
    ).toBe("$100,000 to $120,000");
  });

  it("renders a single stated figure as a bound, not as a fake range", () => {
    expect(
      salaryText({
        salaryMin: 100000,
        salaryMax: undefined,
        salaryCurrency: "USD",
      }),
    ).toBe("from $100,000");
    expect(
      salaryText({
        salaryMin: undefined,
        salaryMax: 120000,
        salaryCurrency: "USD",
      }),
    ).toBe("up to $120,000");
  });

  it("returns undefined when no figure was stated, never a placeholder", () => {
    /**
     * Invariant 7 in one assertion. A dash or an empty string here would read
     * as information about the pay; `undefined` lets the caller omit the row.
     */
    expect(
      salaryText({
        salaryMin: undefined,
        salaryMax: undefined,
        salaryCurrency: undefined,
      }),
    ).toBeUndefined();
  });

  it("adds no estimated label of its own", () => {
    /**
     * The label and the Jobsworth attribution must never come apart (spec 0014
     * AC-7), so both belong to the caller that renders them together. If this
     * function ever grew the label, a caller could show it without the
     * attribution and quietly put the app outside Adzuna's terms.
     */
    const text = salaryText({
      salaryMin: 100000,
      salaryMax: 120000,
      salaryCurrency: "USD",
    });

    expect(text).not.toContain("estimated");
  });

  it("takes a stored application row, not only a live listing", () => {
    /**
     * The reason the parameter is a structural shape rather than `Listing`:
     * `/applications` reads rows off the database and must format them with
     * this exact function rather than a second copy of the rule.
     */
    const storedRow = {
      salaryMin: 90000,
      salaryMax: undefined,
      salaryCurrency: "USD",
      appliedAt: "2026-09-05T12:00:00Z",
      jobTitle: "Engineer",
    };

    expect(salaryText(storedRow)).toBe("from $90,000");
  });
});

describe("appliedOnText (spec 0014, AC-18)", () => {
  it("renders an absolute date rather than a relative one", () => {
    /**
     * THE DISTINCTION FROM `relativePostedAt` IS THE POINT. An applications
     * list is an archive read months later, where "applied 3 days ago" stops
     * meaning anything. The posted date stays relative because its whole
     * meaning is freshness; this one must not be.
     */
    const text = appliedOnText("2026-09-05T12:00:00Z");

    expect(text).toBe("applied September 5, 2026");
    expect(text).not.toContain("ago");
  });

  it("returns undefined on an unparseable value rather than echoing it", () => {
    expect(appliedOnText("last Tuesday")).toBeUndefined();
  });
});
