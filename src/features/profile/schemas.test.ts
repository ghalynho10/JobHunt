import { describe, expect, it } from "vitest";

import {
  REMOTE_PREFERENCES,
  entryIdSchema,
  identitySchema,
  preferencesSchema,
  skillsSchema,
  workExperienceSchema,
} from "./schemas";

/**
 * Spec 0010's validation rules, which are most of its acceptance criteria.
 *
 * WHY THE SCHEMAS RATHER THAN THE ACTIONS. Every rule below is a boundary parse,
 * and a Server Action is a callable endpoint whatever page renders it, so these
 * are the real gate: the `maxLength` and `required` attributes on the controls
 * are a courtesy to the person typing and nothing more. Driving the schemas
 * directly means each rule gets its own named failure instead of being one line
 * in a form's error map.
 *
 * The message text is asserted where a reader depends on it, because a rule that
 * refuses correctly and says nothing useful has only half worked (AC-12).
 */

/** The month every date rule below is judged against, chosen not observed. */
const TODAY = { year: 2026, month: 9 } as const;

const validExperience = {
  company: "Northwind Labs",
  title: "Backend Engineer",
  location: "",
  description: "",
  started_month: "3",
  started_year: "2019",
  ended_month: "",
  ended_year: "",
};

/** The first message for a field, the way the form renders it. */
function messageFor(
  issues: readonly {
    readonly path: readonly PropertyKey[];
    readonly message: string;
  }[],
  field: string,
): string | undefined {
  return issues.find((issue) => issue.path[0] === field)?.message;
}

describe("identity (AC-3)", () => {
  it("accepts a name alone, since that is all the first save needs", () => {
    // covers: AC-3
    const parsed = identitySchema.safeParse({
      full_name: "Ada Lovelace",
      location: "",
      summary: "",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.full_name).toBe("Ada Lovelace");
  });

  it("trims the name before judging it, so spaces are not a name", () => {
    // covers: AC-3
    const parsed = identitySchema.safeParse({
      full_name: "   ",
      location: "",
      summary: "",
    });

    expect(parsed.success).toBe(false);
    expect(messageFor(parsed.error?.issues ?? [], "full_name")).toBe(
      "Enter your name.",
    );
  });

  it("keeps a name of exactly 200 and refuses 201", () => {
    /**
     * The boundary itself, both sides. `public.profile` checks
     * `length(full_name) <= 200`, so 201 has to be refused here rather than
     * reaching the database and raising a constraint error the page would then
     * have to translate.
     */
    // covers: AC-3
    expect(
      identitySchema.safeParse({
        full_name: "a".repeat(200),
        location: "",
        summary: "",
      }).success,
    ).toBe(true);
    expect(
      identitySchema.safeParse({
        full_name: "a".repeat(201),
        location: "",
        summary: "",
      }).success,
    ).toBe(false);
  });

  it("keeps a summary of exactly 4000 and refuses 4001", () => {
    // covers: AC-3
    const ok = { full_name: "A", location: "", summary: "s".repeat(4000) };
    const over = { full_name: "A", location: "", summary: "s".repeat(4001) };

    expect(identitySchema.safeParse(ok).success).toBe(true);
    expect(identitySchema.safeParse(over).success).toBe(false);
  });

  it("turns an optional field that trims to nothing into undefined, never an empty string", () => {
    /**
     * Invariant 8, and the whole reason it exists: the write maps `undefined` to
     * `NULL`, so "is this set" stays a question the database can answer. An
     * empty string stored instead would answer "yes, and it is blank".
     */
    const parsed = identitySchema.safeParse({
      full_name: "Ada",
      location: "   ",
      summary: "",
    });

    expect(parsed.data?.location).toBeUndefined();
    expect(parsed.data?.summary).toBeUndefined();
  });
});

describe("skills (AC-5, AC-6)", () => {
  const parse = (skills: string) => skillsSchema.safeParse({ skills });

  it("splits on newlines and trims each name", () => {
    // covers: AC-6
    expect(parse("  Go  \nPostgreSQL\n").data?.skills).toEqual([
      "Go",
      "PostgreSQL",
    ]);
  });

  it("drops blank lines rather than storing empty names", () => {
    // covers: AC-6
    expect(parse("Go\n\n\n   \nRust").data?.skills).toEqual(["Go", "Rust"]);
  });

  it("removes duplicates ignoring case, keeping the first spelling", () => {
    /**
     * This mirrors the unique index on `(profile_id, lower(name))`, which is the
     * authority on skill identity. Keeping the FIRST spelling is what makes AC-5
     * true: a submission that changes only capitalisation is a no-op and the
     * stored casing stands.
     */
    // covers: AC-5, AC-6
    expect(parse("React\nreact\nREACT").data?.skills).toEqual(["React"]);
    expect(parse("react\nReact").data?.skills).toEqual(["react"]);
  });

  it("accepts a name of exactly 100 and refuses 101", () => {
    // covers: AC-6
    expect(parse("s".repeat(100)).success).toBe(true);

    const over = parse("Go\n" + "s".repeat(101));

    expect(over.success).toBe(false);
    expect(messageFor(over.error?.issues ?? [], "skills")).toBe(
      "Keep each skill to 100 characters or fewer.",
    );
  });

  it("refuses the whole submission rather than dropping the one bad name", () => {
    /**
     * `AGENTS.md`: no silent failure. Saving the good names and quietly
     * discarding the long one would look like success and lose what was typed.
     */
    expect(parse("Go\n" + "s".repeat(101)).success).toBe(false);
  });

  it("reads an empty box as an empty list, which is how every skill is removed", () => {
    expect(parse("").data?.skills).toEqual([]);
    expect(parse("\n  \n").data?.skills).toEqual([]);
  });

  it("keeps a name containing a comma intact, since the separator is the newline", () => {
    expect(parse("Go, Rust").data?.skills).toEqual(["Go, Rust"]);
  });
});

describe("search preferences (AC-9)", () => {
  const base = {
    desired_titles: "",
    desired_locations: "",
    remote_preference: "no_preference",
    minimum_pay: "",
    minimum_pay_currency: "",
  };

  it("keeps a comma inside a location, which is why the lists are newline separated", () => {
    /**
     * The reason AC-9 forbids comma separation in terms: "Berlin, Germany" is
     * one location a person typed, and a comma separator would silently split it
     * into two places they never named.
     */
    // covers: AC-9
    const parsed = preferencesSchema.safeParse({
      ...base,
      desired_locations: "Berlin, Germany\nRemote",
    });

    expect(parsed.data?.desired_locations).toEqual([
      "Berlin, Germany",
      "Remote",
    ]);
  });

  it("accepts 50 values and refuses 51", () => {
    // covers: AC-9
    const titles = (n: number) =>
      Array.from({ length: n }, (_, i) => `Title ${i}`).join("\n");

    expect(
      preferencesSchema.safeParse({ ...base, desired_titles: titles(50) })
        .success,
    ).toBe(true);

    const over = preferencesSchema.safeParse({
      ...base,
      desired_titles: titles(51),
    });

    expect(over.success).toBe(false);
    expect(messageFor(over.error?.issues ?? [], "desired_titles")).toBe(
      "Add at most 50 titles.",
    );
  });

  it("counts the list after deduplication, not before", () => {
    /**
     * Fifty distinct titles plus one that differs only in case is fifty, and
     * refusing it would be a message the reader could not act on: the list they
     * are looking at has fifty lines.
     */
    const titles = Array.from({ length: 50 }, (_, i) => `Title ${i}`);
    const withDuplicate = [...titles, "TITLE 0"].join("\n");

    expect(
      preferencesSchema.safeParse({ ...base, desired_titles: withDuplicate })
        .success,
    ).toBe(true);
  });

  it.each(REMOTE_PREFERENCES)("accepts the allowed value %s", (value) => {
    // covers: AC-9
    expect(
      preferencesSchema.safeParse({ ...base, remote_preference: value })
        .success,
    ).toBe(true);
  });

  it("refuses a remote preference the column's own check would reject", () => {
    /**
     * Spec 0003 chose a check constraint over an enum type and recorded the
     * cost: the generated TypeScript is `string`, so the four values are named
     * again in Zod and the two can drift. This is the test that catches the
     * drift at the boundary instead of at the database.
     */
    const parsed = preferencesSchema.safeParse({
      ...base,
      remote_preference: "anywhere",
    });

    expect(parsed.success).toBe(false);
    expect(messageFor(parsed.error?.issues ?? [], "remote_preference")).toBe(
      "Choose one of the four options.",
    );
  });

  it("uppercases a currency before checking it", () => {
    // covers: AC-9
    const parsed = preferencesSchema.safeParse({
      ...base,
      minimum_pay: "1000",
      minimum_pay_currency: "  eur  ",
    });

    expect(parsed.data?.minimum_pay_currency).toBe("EUR");
  });

  it("refuses a currency that is not three letters", () => {
    for (const value of ["EU", "EURO", "E1R", "123"]) {
      const parsed = preferencesSchema.safeParse({
        ...base,
        minimum_pay: "1000",
        minimum_pay_currency: value,
      });

      expect(parsed.success, `${value} should be refused`).toBe(false);
    }
  });

  it("refuses an over precise amount rather than rounding it", () => {
    /**
     * The reason the amount is parsed as characters and not coerced to a number:
     * coercion would accept `1234.567` and store `1234.57`, turning a typo into
     * a figure the user never wrote.
     */
    // covers: AC-9
    const parsed = preferencesSchema.safeParse({
      ...base,
      minimum_pay: "1234.567",
      minimum_pay_currency: "EUR",
    });

    expect(parsed.success).toBe(false);
    expect(messageFor(parsed.error?.issues ?? [], "minimum_pay")).toBe(
      "Enter an amount in digits, with at most two decimal places.",
    );
  });

  it("accepts the widest amount the column holds and refuses one digit more", () => {
    /** `numeric(12, 2)` is ten integer digits and two decimals, exactly. */
    // covers: AC-9
    const at = {
      ...base,
      minimum_pay: "9999999999.99",
      minimum_pay_currency: "EUR",
    };
    const over = {
      ...base,
      minimum_pay: "10000000000.00",
      minimum_pay_currency: "EUR",
    };

    expect(preferencesSchema.safeParse(at).success).toBe(true);
    expect(preferencesSchema.safeParse(over).success).toBe(false);
  });

  it("accepts zero, which is a real amount somebody could mean", () => {
    expect(
      preferencesSchema.safeParse({
        ...base,
        minimum_pay: "0",
        minimum_pay_currency: "EUR",
      }).success,
    ).toBe(true);
  });

  it("treats an empty amount as absent before the pairing check, never as zero", () => {
    // covers: AC-9
    const parsed = preferencesSchema.safeParse(base);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.minimum_pay).toBeUndefined();
  });

  it("refuses an amount with no currency, and a currency with no amount", () => {
    /** Mirrors `job_preference_pay_paired`, so no bare number can render as money. */
    // covers: AC-9
    const noCurrency = preferencesSchema.safeParse({
      ...base,
      minimum_pay: "5000",
    });
    const noAmount = preferencesSchema.safeParse({
      ...base,
      minimum_pay_currency: "GBP",
    });

    expect(
      messageFor(noCurrency.error?.issues ?? [], "minimum_pay_currency"),
    ).toBe("Add the currency this amount is in.");
    expect(messageFor(noAmount.error?.issues ?? [], "minimum_pay")).toBe(
      "Add the amount this currency goes with.",
    );
  });
});

describe("work history (AC-7, AC-7a)", () => {
  const parse = (overrides: Record<string, string> = {}) =>
    workExperienceSchema(TODAY).safeParse({ ...validExperience, ...overrides });

  it("accepts an entry with no ended pair, which is how a role is current", () => {
    // covers: AC-7
    const parsed = parse();

    expect(parsed.success).toBe(true);
    expect(parsed.data?.ended_month).toBeUndefined();
    expect(parsed.data?.ended_year).toBeUndefined();
  });

  it("requires a company and a job title", () => {
    // covers: AC-7a
    expect(
      messageFor(parse({ company: "  " }).error?.issues ?? [], "company"),
    ).toBe("Enter the company.");
    expect(messageFor(parse({ title: "" }).error?.issues ?? [], "title")).toBe(
      "Enter the job title.",
    );
  });

  it("caps company, title and location at 200 and description at 4000", () => {
    // covers: AC-7a
    expect(parse({ company: "c".repeat(200) }).success).toBe(true);
    expect(parse({ company: "c".repeat(201) }).success).toBe(false);
    expect(parse({ title: "t".repeat(201) }).success).toBe(false);
    expect(parse({ location: "l".repeat(201) }).success).toBe(false);
    expect(parse({ description: "d".repeat(4000) }).success).toBe(true);
    expect(parse({ description: "d".repeat(4001) }).success).toBe(false);
  });

  it("refuses a role that starts in a month that has not arrived", () => {
    // covers: AC-7
    const parsed = parse({ started_month: "10", started_year: "2026" });

    expect(messageFor(parsed.error?.issues ?? [], "started_month")).toBe(
      "A role cannot start in the future.",
    );
  });

  it("accepts a role starting in the current month", () => {
    /**
     * The boundary the "not in the future" rule must not overshoot. Somebody
     * starting a job this month is the most likely entry anybody types.
     */
    // covers: AC-7
    expect(parse({ started_month: "9", started_year: "2026" }).success).toBe(
      true,
    );
  });

  it("refuses a year outside 1950 to the current year", () => {
    // covers: AC-7
    expect(parse({ started_year: "1949" }).success).toBe(false);
    expect(parse({ started_year: "2027" }).success).toBe(false);
    expect(parse({ started_year: "1950" }).success).toBe(true);
  });

  it("requires both ended values or neither, never one alone", () => {
    /**
     * There is no separate "current role" control, so the absence of the pair IS
     * the statement that the role is current. Half a pair is not a statement.
     */
    // covers: AC-7
    expect(
      messageFor(parse({ ended_month: "5" }).error?.issues ?? [], "ended_year"),
    ).toBe("Add the year this role ended, or clear the month.");
    expect(
      messageFor(
        parse({ ended_year: "2020" }).error?.issues ?? [],
        "ended_month",
      ),
    ).toBe("Add the month this role ended, or clear the year.");
  });

  it("refuses an entry that ends before it starts", () => {
    // covers: AC-7
    const parsed = parse({
      started_month: "6",
      started_year: "2020",
      ended_month: "5",
      ended_year: "2020",
    });

    expect(messageFor(parsed.error?.issues ?? [], "ended_month")).toBe(
      "This role cannot end before it started.",
    );
  });

  it("accepts an entry that starts and ends in the same month", () => {
    /** A one month role is real, and `ended_on >= started_on` allows it. */
    expect(
      parse({
        started_month: "6",
        started_year: "2020",
        ended_month: "6",
        ended_year: "2020",
      }).success,
    ).toBe(true);
  });

  it("judges dates against the month it is given, not the clock", () => {
    /**
     * The whole reason the schema is a function of `today`. Driven at a past
     * month, a date that is fine in 2026 becomes a future date and is refused,
     * which is what proves nothing here reads a clock of its own.
     */
    const inThePast = workExperienceSchema({ year: 2018, month: 1 });

    expect(inThePast.safeParse(validExperience).success).toBe(false);
  });

  it("refuses a month outside 1 to 12", () => {
    expect(parse({ started_month: "0" }).success).toBe(false);
    expect(parse({ started_month: "13" }).success).toBe(false);
  });

  it("refuses a month or year that is not digits", () => {
    expect(parse({ started_month: "March" }).success).toBe(false);
    expect(parse({ started_year: "20x9" }).success).toBe(false);
  });
});

describe("the entry id boundary (AC-13)", () => {
  it("accepts a real version 4 uuid", () => {
    expect(
      entryIdSchema.safeParse("d64bb7db-92f4-40c7-bc47-c40cbc5b3839").success,
    ).toBe(true);
  });

  it("refuses a malformed id, which is what sends the page to its gone state", () => {
    // covers: AC-13
    expect(entryIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(entryIdSchema.safeParse("").success).toBe(false);
    expect(entryIdSchema.safeParse(undefined).success).toBe(false);
  });

  it("refuses an id whose version and variant nibbles are wrong", () => {
    /**
     * `z.uuid()` rather than the looser `z.guid()`, the tightening spec 0004
     * made for exactly this: a well shaped string that is not a real uuid must
     * not reach Postgres to be refused there.
     */
    expect(
      entryIdSchema.safeParse("11111111-1111-1111-1111-111111111111").success,
    ).toBe(false);
  });
});
