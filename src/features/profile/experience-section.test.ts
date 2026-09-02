import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

import { ENTRY_GONE } from "./copy";
import { DeleteExperienceForm } from "./experience-delete-form";
import { ExperienceForm } from "./experience-form";
import { ExperienceSection, type ExperienceView } from "./experience-section";
import type { WorkExperienceEntry } from "./queries";
import {
  findAllByType,
  findByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

/**
 * Spec 0010, AC-7, AC-8, AC-13: the work history section's four states.
 *
 * WHY THIS SECTION AND NOT THE OTHER THREE. It is the only one with more than
 * one shape: a list, an add form, an edit form, and a delete confirmation, each
 * named by the URL. The other three are a view or a form and are covered through
 * the page. This is also where the AC-13 regression landed, so the "gone" state
 * gets the most attention.
 *
 * The two client forms are STOPPED AT rather than rendered: they call
 * `useActionState`, so invoking them outside a real render would throw. Their
 * props are the contract this section owns, and that is what is asserted.
 */

const CURRENT: WorkExperienceEntry = {
  id: "d64bb7db-92f4-40c7-bc47-c40cbc5b3839",
  company: "Northwind Labs",
  title: "Backend Engineer",
  location: "Remote",
  description: "Built the ingest pipeline.",
  started_on: "2019-03-01",
  ended_on: undefined,
};

const ENDED: WorkExperienceEntry = {
  id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  company: "Older Place",
  title: "Junior Dev",
  location: undefined,
  description: undefined,
  started_on: "2015-01-01",
  ended_on: "2019-02-01",
};

const YEARS = [{ value: "2026", label: "2026" }];

/**
 * Renders the section, stopping at the design system boundary and at the two
 * components that use hooks.
 *
 * `Button` is in the stop list for the same reason the page tests stop at
 * `Section` and `Card`: what this section owns is the PROPS it hands the design
 * system (the accessible name, the href), and those only exist while `Button` is
 * still an element. Rendering it away would leave these tests asserting anchor
 * markup, which is the brittle shape the base component tests already avoid.
 */
function render(
  view: ExperienceView,
  entries: readonly WorkExperienceEntry[] = [CURRENT, ENDED],
) {
  return renderDeep(ExperienceSection({ entries, view, years: YEARS }), [
    Button,
    ExperienceForm,
    DeleteExperienceForm,
  ]);
}

describe("the list", () => {
  it("renders every entry with its company and dates", () => {
    // covers: AC-7
    const text = textOf(render({ kind: "list" }));

    expect(text).toContain("Backend Engineer");
    expect(text).toContain("Northwind Labs");
    expect(text).toContain("Junior Dev");
  });

  it("reads an entry with no end date as still held", () => {
    /**
     * The absence of the ended pair IS the statement that the role is current,
     * which is why `work_experience` has no `is_current` column. It has to read
     * that way on the page too, not as a blank.
     */
    // covers: AC-7
    expect(textOf(render({ kind: "list" }, [CURRENT]))).toContain(
      "March 2019 to now",
    );
  });

  it("shows both ends of a finished role", () => {
    expect(textOf(render({ kind: "list" }, [ENDED]))).toContain(
      "January 2015 to February 2019",
    );
  });

  it("puts the location on the same line as the dates, and omits it when absent", () => {
    expect(textOf(render({ kind: "list" }, [CURRENT]))).toContain(
      "March 2019 to now · Remote",
    );
    expect(textOf(render({ kind: "list" }, [ENDED]))).not.toContain("·");
  });

  it("says the section is empty rather than rendering nothing", () => {
    /**
     * A blank where a list would be reads as a list that is blank. `AGENTS.md`
     * forbids the default that looks like success, and this is the mild version
     * of it.
     */
    const text = textOf(render({ kind: "list" }, []));

    expect(text).toContain("Not set yet.");
  });

  it("gives every entry's controls an accessible name that names the entry", () => {
    /**
     * Five roles means five links reading "Edit" and five reading "Remove". In a
     * screen reader's list of links those are ten identical names, and `Button`'s
     * `label` exists for exactly this.
     */
    // covers: AC-17
    const labels = findAllByType(render({ kind: "list" }), Button)
      .map((button) => (button.props as { label?: string }).label)
      .filter((label): label is string => label !== undefined);

    expect(labels).toContain("Edit Backend Engineer at Northwind Labs");
    expect(labels).toContain("Remove Backend Engineer at Northwind Labs");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("links each entry's controls at that entry's own id", () => {
    // covers: AC-13
    const hrefs = findAllByType(
      render({ kind: "list" }, [CURRENT]),
      Button,
    ).map((button) => (button.props as { href?: string }).href);

    expect(hrefs).toContain(`/profile?edit=experience&entry=${CURRENT.id}`);
    expect(hrefs).toContain(`/profile?delete=experience&entry=${CURRENT.id}`);
  });

  it("offers the add control", () => {
    expect(textOf(render({ kind: "list" }))).toContain("Add role");
  });
});

describe("the add and edit forms", () => {
  it("opens the add form with no entry id, so it cannot become an edit", () => {
    // covers: AC-7
    const form = findByType(render({ kind: "add" }), ExperienceForm);

    expect(form).toBeDefined();
    expect((form?.props as { entryId?: string }).entryId).toBeUndefined();
  });

  it("hands the edit form the entry's stored values, split into month and year", () => {
    /**
     * The round trip that matters: a stored `2019-03-01` has to reach the two
     * selects as March and 2019. Off by one here would show a different month
     * than the one saved, and saving again would store that wrong month.
     */
    // covers: AC-7
    const form = findByType(
      render({ kind: "edit", entryId: CURRENT.id }),
      ExperienceForm,
    );
    const props = form?.props as Record<string, string | undefined>;

    expect(props?.entryId).toBe(CURRENT.id);
    expect(props?.startedMonth).toBe("3");
    expect(props?.startedYear).toBe("2019");
    expect(props?.company).toBe("Northwind Labs");
  });

  it("leaves the ended pair empty for a current role", () => {
    // covers: AC-7
    const props = findByType(
      render({ kind: "edit", entryId: CURRENT.id }),
      ExperienceForm,
    )?.props as Record<string, string>;

    expect(props.endedMonth).toBe("");
    expect(props.endedYear).toBe("");
  });

  it("fills the ended pair for a finished role", () => {
    const props = findByType(
      render({ kind: "edit", entryId: ENDED.id }),
      ExperienceForm,
    )?.props as Record<string, string>;

    expect(props.endedMonth).toBe("2");
    expect(props.endedYear).toBe("2019");
  });
});

describe("the delete confirmation", () => {
  it("names the entry it is about to remove", () => {
    // covers: AC-8
    const form = findByType(
      render({ kind: "delete", entryId: CURRENT.id }),
      DeleteExperienceForm,
    );
    const props = form?.props as Record<string, string>;

    expect(props.entryId).toBe(CURRENT.id);
    expect(props.title).toBe("Backend Engineer");
    expect(props.company).toBe("Northwind Labs");
  });
});

describe("an entry that cannot be shown (AC-13)", () => {
  it.each([
    [
      "an id that matches no row, on the edit URL",
      { kind: "edit", entryId: "11111111-2222-4333-8444-555555555555" },
    ],
    [
      "an id that matches no row, on the delete URL",
      { kind: "delete", entryId: "11111111-2222-4333-8444-555555555555" },
    ],
    ["an id that never parsed at all", { kind: "gone" }],
  ] as const)("says so for %s", (_case, view) => {
    /**
     * THE REGRESSION `/check verify` CAUGHT. The third case had no render of its
     * own and fell through to the plain list, so somebody who followed a stale
     * link saw a page that simply ignored them. All three are the same event to
     * the reader and must produce the same sentence.
     */
    // covers: AC-13
    expect(textOf(render(view as ExperienceView))).toContain(ENTRY_GONE);
  });

  it("keeps the list beside the sentence rather than replacing it", () => {
    // covers: AC-13
    const text = textOf(render({ kind: "gone" }));

    expect(text).toContain(ENTRY_GONE);
    expect(text).toContain("Backend Engineer");
    expect(text).toContain("Add role");
  });

  it("opens no form, which is what stops an edit becoming an insert", () => {
    /**
     * A blank edit form would look like an entry with its fields cleared, and
     * saving it would silently create a second one.
     */
    // covers: AC-13
    for (const view of [
      { kind: "gone" } as const,
      {
        kind: "edit",
        entryId: "11111111-2222-4333-8444-555555555555",
      } as const,
    ]) {
      expect(findByType(render(view), ExperienceForm)).toBeUndefined();
      expect(findByType(render(view), DeleteExperienceForm)).toBeUndefined();
    }
  });
});
