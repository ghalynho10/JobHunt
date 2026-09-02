import { describe, expect, it } from "vitest";

import {
  CONTROLS,
  ENTRY_GONE,
  FIRST_RUN_NOTE,
  HEADINGS,
  PREFERENCES_NOT_SET,
  deleteConfirmation,
} from "./copy";

/**
 * Spec 0010's `## Copy` table, and the rule it carries.
 *
 * These are the engineer's own strings, used verbatim, and the spec says in
 * terms that `/develop` must not invent or reword any of them. So the tests here
 * are about the RULES rather than about taste, the same shape
 * `src/features/auth/copy.test.ts` takes: that no slot grows the punctuation the
 * spec forbids, that the page's heading outline stays the one AC-17's keyboard
 * pass was run against, and that the delete confirmation actually names the
 * entry it is about to remove.
 *
 * Asserting the full sentences character for character is deliberate. A
 * paraphrase is exactly the change nobody notices in review, and these are the
 * only text a user actually reads.
 */

/** Every slot, flattened, for the rules that apply to all of them. */
const EVERY_SLOT: readonly string[] = [
  FIRST_RUN_NOTE,
  PREFERENCES_NOT_SET,
  ENTRY_GONE,
  ...Object.values(HEADINGS),
  ...Object.values(CONTROLS),
  deleteConfirmation("Backend Engineer", "Northwind Labs"),
];

describe("the punctuation rule spec 0007 set and spec 0010 carries with no carve out", () => {
  it.each(EVERY_SLOT)("uses no em dash, en dash or semicolon in %j", (slot) => {
    /**
     * The reason it is a rule rather than a preference: this is the only text a
     * user actually reads, and em dash overuse is one of the most cited markers
     * of machine written text, which costs something real on a portfolio facing
     * product.
     */
    expect(slot).not.toMatch(/[—–;]/);
  });

  it.each(EVERY_SLOT)("is not left blank in %j", (slot) => {
    expect(slot.trim().length).toBeGreaterThan(0);
  });
});

describe("the page outline the copy fixes (COPY-2)", () => {
  it("keeps one page title and four section headings", () => {
    /**
     * `COPY-2` fixes the outline: a stable `h1` of "Profile" and four peer `h2`
     * headings. AC-17's keyboard and heading pass checks THIS outline, not two,
     * so a fifth section cannot be added without somebody seeing this test.
     */
    // covers: AC-17
    expect(HEADINGS.page).toBe("Profile");
    expect(Object.keys(HEADINGS)).toEqual([
      "page",
      "identity",
      "skills",
      "experience",
      "preferences",
    ]);
  });

  it("does not title the page with the person's own name", () => {
    /**
     * The reason the spec chose a fixed `h1`: AC-1 renders before any
     * `full_name` exists, so a name based heading would need a second outline
     * for the first run screen.
     */
    // covers: AC-1
    expect(HEADINGS.page).not.toMatch(/name/i);
  });

  it("names the four sections the way the page renders them", () => {
    expect(HEADINGS.identity).toBe("Personal details");
    expect(HEADINGS.skills).toBe("Skills");
    expect(HEADINGS.experience).toBe("Experience");
    expect(HEADINGS.preferences).toBe("Search preferences");
  });
});

describe("the sentences a reader meets in an unusual state", () => {
  it("tells a first time visitor what a name unlocks, without offering it yet", () => {
    /**
     * `COPY-1` is what AC-1 asks for in place of a control that cannot do
     * anything: it names what comes next rather than rendering a dead button.
     */
    // covers: AC-1
    expect(FIRST_RUN_NOTE).toBe(
      "Your name is all this needs to start. Skills, experience and search preferences open up once you save it.",
    );
  });

  it("says preferences are unset rather than showing values nobody chose", () => {
    // covers: AC-10
    expect(PREFERENCES_NOT_SET).toBe(
      "Not set yet. Add the titles, locations and pay you're aiming for.",
    );
  });

  it("says an entry is gone without saying whose it was", () => {
    /**
     * One sentence for all three cases (stale, malformed, never the caller's) on
     * purpose. Telling them apart would confirm to a stranger that a given entry
     * id exists and belongs to somebody.
     */
    // covers: AC-13
    expect(ENTRY_GONE).toBe(
      "That entry is no longer on your profile. It may have been removed in another tab.",
    );
  });
});

describe("the delete confirmation names what it is about to remove (COPY-5)", () => {
  it("puts the title and the company in the question", () => {
    /**
     * What AC-8 means by a confirmation step. A bare "are you sure" beside a
     * list of five roles does not tell anybody which one is about to go.
     */
    // covers: AC-8
    expect(deleteConfirmation("Backend Engineer", "Northwind Labs")).toBe(
      "Remove Backend Engineer at Northwind Labs? This can't be undone.",
    );
  });

  it("carries whatever the entry is actually called, including punctuation", () => {
    const sentence = deleteConfirmation("Head of R&D", "O'Brien & Sons");

    expect(sentence).toContain("Head of R&D");
    expect(sentence).toContain("O'Brien & Sons");
  });

  it("says the removal cannot be undone, which is true and worth saying", () => {
    expect(deleteConfirmation("A", "B")).toContain("can't be undone");
  });
});

describe("the control labels are defined once (COPY-6)", () => {
  it("covers every control the page renders", () => {
    /**
     * Five labels in one place so two sections cannot end up calling the same
     * action different things, which is how an interface starts feeling
     * arbitrary.
     */
    expect(CONTROLS).toEqual({
      edit: "Edit",
      addRole: "Add role",
      save: "Save",
      cancel: "Cancel",
      remove: "Remove",
    });
  });
});
