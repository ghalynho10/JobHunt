import type { ReactElement } from "react";

import { describe, expect, it } from "vitest";

import { EntryFooter } from "@/features/entry-page/entry-footer";
import { EntryHeader } from "@/features/entry-page/entry-header";
import {
  CONTACT_EMAIL,
  formatEffectiveDate,
} from "@/features/legal/publication";
import { DATA_RECIPIENTS } from "@/features/legal/recipients";
import {
  IDENTITY_FIELDS,
  PERSONAL_DATA_TABLES,
  STORED_FIELDS,
} from "@/features/legal/stored-fields";
import {
  findAllByType,
  flatten,
  renderDeep,
  textOf,
} from "../../../../test/helpers/react-element";

import PrivacyPage, { metadata } from "./page";

/**
 * The privacy notice (spec 0009, AC-1, AC-2, AC-3, AC-6, AC-7, AC-8, AC-10,
 * AC-11, AC-12, AC-13, AC-14, AC-16, AC-17, AC-20).
 *
 * WHAT THIS FILE IS FOR, AND WHAT IT IS NOT. The registries have their own
 * drift guards, and those prove the LISTS stay true. This file proves the PAGE
 * actually prints them: a registry that is perfectly current and never rendered
 * would pass every test in `stored-fields.test.ts` while the notice on the
 * public internet said nothing at all.
 *
 * The claims that are prose rather than data (retention, deletion, the lawful
 * basis, the Google disclosure) are asserted on the substance a reader needs to
 * find, not on whole sentences. Pinning a paragraph verbatim would fail on
 * every wording improvement and prove nothing about whether the claim survived.
 */

/** Rendered to intrinsic elements, so the document outline is real markup. */
const page = renderDeep(PrivacyPage());
const text = textOf(page);

/** Rendered only as far as the shell, so its props are still readable. */
const shell = renderDeep(PrivacyPage(), [EntryHeader, EntryFooter]);

describe("the page's shape (covers AC-1)", () => {
  it("wears the marketing header with no in page anchors", () => {
    const headers = findAllByType(shell, EntryHeader);

    expect(headers).toHaveLength(1);
    expect(
      (headers[0]?.props as { readonly navigation?: string }).navigation,
    ).toBe("none");
  });

  it("wears the same footer as every other public page", () => {
    expect(findAllByType(shell, EntryFooter)).toHaveLength(1);
  });

  /**
   * Invariant 3 is proved at the source level in
   * `src/features/legal/client-boundary.test.ts`, because `"use client"` is a
   * property of a FILE and no rendered tree can show it. What is worth
   * asserting here is that the document actually rendered: every content
   * assertion below is a substring search, and a page that returned almost
   * nothing would fail them one at a time without ever saying why.
   */
  it("renders a whole document rather than a stub", () => {
    expect(text.length).toBeGreaterThan(4000);
  });
});

describe("the page's metadata (covers AC-17, AC-20)", () => {
  it("titles and describes itself rather than inheriting the site default", () => {
    expect(metadata.title).toBe("Privacy notice");
    expect(typeof metadata.description).toBe("string");
    expect((metadata.description ?? "").length).toBeGreaterThan(40);
  });

  /**
   * THE OPPOSITE OF EVERY OTHER ROUTE, and the reason it is asserted rather
   * than left to the file. The root layout sets `index: false` site wide; this
   * page opting back in is what lets Google reach the policy URL its console
   * demands, which is the whole reason this feature moved into Foundation.
   */
  it("opts back in to indexing, which the root layout switches off (covers AC-17)", () => {
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});

describe("the document outline (covers AC-20)", () => {
  const headings = flatten(page).filter(
    (element): element is ReactElement =>
      typeof element.type === "string" && /^h[1-6]$/.test(element.type),
  );

  const levels = headings.map((heading) => Number((heading.type as string)[1]));

  it("has exactly one h1", () => {
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
  });

  it("opens with it, so nothing outranks the document title", () => {
    expect(levels[0]).toBe(1);
  });

  it("skips no level on the way down", () => {
    for (const [index, level] of levels.entries()) {
      if (index === 0) continue;
      expect(level).toBeLessThanOrEqual((levels[index - 1] as number) + 1);
    }
  });

  it("gives every heading real text", () => {
    for (const heading of headings) expect(textOf(heading).trim()).not.toBe("");
  });
});

describe("every link works and can be reached (covers AC-20)", () => {
  const anchors = flatten(page).filter((element) => element.type === "a");

  it("renders links", () => {
    expect(anchors.length).toBeGreaterThan(0);
  });

  it("gives every one an href and a name", () => {
    for (const anchor of anchors) {
      const { href } = anchor.props as { readonly href?: string };

      expect(href).toBeTruthy();
      expect(textOf(anchor).trim()).not.toBe("");
    }
  });

  /**
   * A disabled anchor does not exist in HTML, and a `tabIndex` of -1 is the
   * usual way somebody accidentally removes a link from the keyboard order.
   */
  it("takes no link out of the keyboard order", () => {
    for (const anchor of anchors) {
      expect(
        (anchor.props as { readonly tabIndex?: number }).tabIndex,
      ).toBeUndefined();
    }
  });
});

describe("what is stored (covers AC-2)", () => {
  it("prints every field the registry names", () => {
    const missing = STORED_FIELDS.filter(
      (field) => !text.includes(field.describedAs),
    ).map((field) => `${field.table}.${field.column}`);

    expect(
      missing,
      "The registry names these and the page does not print them, so the notice is quietly shorter than the list its own test guards.",
    ).toEqual([]);
  });

  it("prints what the sign in provider hands over", () => {
    for (const field of IDENTITY_FIELDS) {
      expect(text).toContain(field.describedAs);
    }
  });

  it("groups them under every heading the registry declares", () => {
    for (const { heading } of PERSONAL_DATA_TABLES) {
      expect(text).toContain(heading);
    }
  });
});

describe("who else sees it (covers AC-3, AC-6)", () => {
  it("names every recipient in the registry", () => {
    for (const recipient of DATA_RECIPIENTS) {
      expect(text).toContain(recipient.name);
      expect(text).toContain(recipient.receives);
    }
  });

  /**
   * INVARIANT 1, AND THE HALF THAT ACTUALLY BITES. Checking the registry's
   * companies appear is easy; the failure this guards is the opposite one, a
   * company written into the prose by hand that the registry never learned
   * about. The ones named below are precisely those arriving at features 13
   * and 14, so a build that mentions one before adding its entry fails here
   * rather than shipping a list that disagrees with itself.
   *
   * ADZUNA LEFT THIS LIST ON 2026-09-04, when feature 11 (spec 0013) added it
   * to `DATA_RECIPIENTS` as part of its own build. That is the mechanism
   * working: a company moves off this list by becoming a real registry entry,
   * never by being deleted from it to make a test pass.
   */
  it("names no company the registry does not hold", () => {
    const notYetRecipients = ["OpenAI", "Anthropic", "Cloudflare"];
    const named = notYetRecipients.filter((company) => text.includes(company));

    expect(
      named,
      "The prose names a company the registry does not. Add it to DATA_RECIPIENTS so the drift test can see it, or take it out of the prose.",
    ).toEqual([]);
  });

  it("counts exactly as many recipients as the registry holds", () => {
    const terms = flatten(page).filter((element) => element.type === "dt");

    expect(terms).toHaveLength(DATA_RECIPIENTS.length);
  });

  /** AC-4's claim, on the page. The configuration behind it is guarded separately. */
  it("says Sentry receives no personal data", () => {
    expect(text).toContain("Sentry");
    expect(text).toMatch(/no request body is collected/);
    expect(text).toMatch(/no cookies are sent/);
  });
});

describe("the prose claims a reader came here for", () => {
  it("names the responsible party and their country (covers AC-11)", () => {
    expect(text).toContain("Ghaly Nicolas Jules");
    expect(text).toContain("the United States");
  });

  it("states the retention policy in words (covers AC-7)", () => {
    expect(text).toContain("no fixed retention period");
    expect(text).toMatch(/not deleted automatically/);
  });

  it("publishes the contact address (covers AC-8)", () => {
    expect(text).toContain(CONTACT_EMAIL);
  });

  /**
   * AC-8 phrases deletion as a request, never as a control. Self serve deletion
   * is feature 27 and does not exist, so a sentence implying a button would be
   * the one false claim on the page.
   */
  it("offers no deletion control it does not have (covers AC-8, AC-10)", () => {
    expect(text).toMatch(/removed by hand/);
    expect(text).toMatch(/no way to do it yourself yet/);
  });

  it("describes deletion as cascading to everything (covers AC-10)", () => {
    expect(text).toMatch(/Removing that record removes everything/);
  });

  it("names a lawful basis with each purpose, not the bare word (covers AC-12)", () => {
    expect(text).toMatch(/contract necessity/);
    expect(text).toMatch(/legitimate interest/);
  });

  it("lists the rights and how to use them (covers AC-12)", () => {
    for (const right of [
      "Access:",
      "Correction:",
      "Deletion:",
      "Portability:",
      "Objection:",
      "Restriction:",
    ]) {
      expect(text).toContain(right);
    }
  });

  it("makes the plain negatives plainly (covers AC-13)", () => {
    expect(text).toMatch(/not sold/);
    expect(text).toMatch(/not used for advertising/);
    expect(text).toMatch(/not shared with data brokers/);
    expect(text).toMatch(/not used to train machine learning models/);
  });

  it("discloses what Google data is used for and shared with (covers AC-13)", () => {
    expect(text).toContain("Signing in with Google");
    expect(text).toMatch(/shared with nobody/);
  });

  /**
   * AC-13 keeps the Limited Use affirmation OFF this page. It governs apps
   * requesting restricted scopes, which this one does not, so affirming it
   * would be an unverifiable claim on a page built entirely of checkable ones.
   */
  it("carries no Limited Use affirmation (covers AC-13)", () => {
    expect(text).not.toContain("Limited Use");
    expect(text).not.toContain("Google API Services User Data Policy");
  });

  it("discloses the session cookie and the absence of tracking (covers AC-14)", () => {
    expect(text).toMatch(/strictly necessary/);
    expect(text).toMatch(/no analytics, no tracking/);
  });

  it("carries the effective date and says the published version applies (covers AC-16)", () => {
    expect(text).toContain(formatEffectiveDate());
    expect(text).toMatch(/continuing to use the service after a change/i);
  });
});
