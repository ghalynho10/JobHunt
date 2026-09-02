import { describe, expect, it } from "vitest";

import {
  EARLIEST_YEAR,
  MONTH_OPTIONS,
  currentMonth,
  firstOfMonth,
  formatMonth,
  isAfter,
  monthOf,
  yearOptions,
} from "./calendar";

/**
 * Spec 0010, AC-7 and invariant 3: a work history date is built, never typed.
 *
 * WHY THESE ARE WORTH TESTING AT ALL, since they look like string formatting.
 * Every one of them is a place a `Date` would have been the obvious choice and
 * would have been wrong. `new Date("2019-03-01")` is parsed as UTC midnight and
 * read back in the server's own zone, which lands on February everywhere behind
 * UTC. The module avoids `Date` on purpose, and these tests are what stop a
 * later reader from "simplifying" it back.
 */

describe("the month options are the spec's, not the platform's", () => {
  it("offers twelve months numbered 1 to 12", () => {
    // covers: AC-7
    expect(MONTH_OPTIONS).toHaveLength(12);
    expect(MONTH_OPTIONS.map((option) => option.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  it("names them in ordinary calendar English, fixed by the spec", () => {
    /**
     * Asserted verbatim because spec 0010 fixes these names and says they are
     * NOT a `COPY` slot to be reworded. It also rules out deriving them from
     * `Intl.DateTimeFormat`, which would make the labels depend on the server's
     * locale and on whichever ICU data the running Node was built with.
     */
    expect(MONTH_OPTIONS[0]?.label).toBe("January");
    expect(MONTH_OPTIONS[11]?.label).toBe("December");
  });

  it("submits the calendar month number, not the array index", () => {
    /** Off by one here would store every date a month early, silently. */
    expect(MONTH_OPTIONS[2]).toEqual({ value: "3", label: "March" });
  });
});

describe("the year options never offer a year that has not happened", () => {
  it("runs from the given year down to 1950, newest first", () => {
    // covers: AC-7
    const years = yearOptions(2026);

    expect(years[0]?.value).toBe("2026");
    expect(years.at(-1)?.value).toBe(String(EARLIEST_YEAR));
    expect(years).toHaveLength(2026 - EARLIEST_YEAR + 1);
  });

  it("offers nothing later than the year it was given", () => {
    /**
     * A role never starts or ends in the future, and the control is where that
     * is enforced first: a year that cannot be chosen never has to be refused.
     */
    expect(
      yearOptions(2026)
        .map((y) => Number(y.value))
        .filter((y) => y > 2026),
    ).toEqual([]);
  });

  it("is a single year when the floor and the ceiling meet", () => {
    expect(yearOptions(EARLIEST_YEAR)).toEqual([
      { value: "1950", label: "1950" },
    ]);
  });
});

describe("a stored date is always the first of its month", () => {
  it("builds the first of the month from a month and a year", () => {
    // covers: AC-7, invariant 3
    expect(firstOfMonth({ year: 2019, month: 3 })).toBe("2019-03-01");
  });

  it("pads a single digit month, which Postgres needs", () => {
    expect(firstOfMonth({ year: 2019, month: 1 })).toBe("2019-01-01");
    expect(firstOfMonth({ year: 2019, month: 12 })).toBe("2019-12-01");
  });

  it("survives a round trip back to a month and year", () => {
    /**
     * The edit form reads a stored date back into its two selects. If this were
     * not exact, reopening an entry would quietly show a different month than
     * the one saved, and saving again would store that wrong month.
     */
    const month = { year: 2019, month: 3 };

    expect(monthOf(firstOfMonth(month))).toEqual(month);
  });
});

describe("reading a stored date does not go through a calendar", () => {
  it("reads the three numbers out of the string", () => {
    expect(monthOf("1999-11-01")).toEqual({ year: 1999, month: 11 });
  });

  it("does not shift the month in a timezone behind UTC", () => {
    /**
     * THE BUG THIS MODULE EXISTS TO AVOID. `new Date("2019-03-01")` is UTC
     * midnight; reading `.getMonth()` from it anywhere west of UTC returns
     * February. The parse here is textual, so the result cannot depend on where
     * the server is, and this test would fail the moment somebody swapped it for
     * a `Date`.
     */
    expect(monthOf("2019-03-01")?.month).toBe(3);
    expect(formatMonth("2019-01-01")).toBe("January 2019");
  });

  it("returns undefined for a shape a date column never produces", () => {
    expect(monthOf("not-a-date")).toBeUndefined();
    expect(monthOf("2019-3-1")).toBeUndefined();
    expect(monthOf("")).toBeUndefined();
  });

  it("shows an unparseable value as it is stored rather than inventing one", () => {
    /**
     * `AGENTS.md`: no silent failure, and never a default that reads like
     * success. A date that did not parse is visible on the page rather than
     * rendered as a plausible month nobody chose.
     */
    expect(formatMonth("not-a-date")).toBe("not-a-date");
    expect(formatMonth("2019-13-01")).toBe("2019-13-01");
  });
});

describe("one comparison decides both date rules", () => {
  it("compares the year first, then the month", () => {
    // covers: AC-7
    expect(isAfter({ year: 2021, month: 1 }, { year: 2020, month: 12 })).toBe(
      true,
    );
    expect(isAfter({ year: 2020, month: 12 }, { year: 2021, month: 1 })).toBe(
      false,
    );
    expect(isAfter({ year: 2020, month: 6 }, { year: 2020, month: 5 })).toBe(
      true,
    );
  });

  it("treats the same month as not after it, so a role may start this month", () => {
    /**
     * The boundary that matters: "not in the future" must accept the current
     * month. A strict comparison here would refuse somebody starting a job this
     * month, which is the most likely entry anybody types.
     */
    expect(isAfter({ year: 2026, month: 9 }, { year: 2026, month: 9 })).toBe(
      false,
    );
  });
});

describe("the clock is read in exactly one place", () => {
  it("reports a real month in range", () => {
    /**
     * Deliberately not asserted against a frozen clock: the point of this
     * function is that it is the ONLY clock read in the feature, so everything
     * downstream is a pure function of what it returns and is tested at chosen
     * months instead. All this needs to prove is that it hands back a usable
     * pair rather than a `Date`.
     */
    const now = currentMonth();

    expect(now.month).toBeGreaterThanOrEqual(1);
    expect(now.month).toBeLessThanOrEqual(12);
    expect(now.year).toBeGreaterThanOrEqual(2024);
  });
});
