import type { ReactElement } from "react";

import { describe, expect, it } from "vitest";

import { EntryFooter } from "@/features/entry-page/entry-footer";
import { EntryHeader } from "@/features/entry-page/entry-header";
import {
  CONTACT_EMAIL,
  formatEffectiveDate,
} from "@/features/legal/publication";
import {
  findAllByType,
  flatten,
  renderDeep,
  textOf,
} from "../../../../test/helpers/react-element";

import TermsPage, { metadata } from "./page";

/**
 * The terms of use (spec 0009, AC-1, AC-15, AC-16, AC-17, AC-20).
 *
 * FOUR OF THESE CLAUSES ARE WHERE A TEMPLATE WOULD HAVE BEEN WRONG, and those
 * are the ones asserted hardest. A stock licence grant is perpetual,
 * sublicensable and silent about model training; a stock liability clause
 * carries a cap figure copied from a paid product. Spec 0009 AC-15 settled all
 * four deliberately, so each is checked for the specific limit rather than for
 * the presence of a heading.
 */

const page = renderDeep(TermsPage());
const text = textOf(page);
const shell = renderDeep(TermsPage(), [EntryHeader, EntryFooter]);

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

  it("renders a whole document rather than a stub", () => {
    expect(text.length).toBeGreaterThan(3000);
  });
});

describe("the page's metadata (covers AC-17, AC-20)", () => {
  it("titles and describes itself rather than inheriting the site default", () => {
    expect(metadata.title).toBe("Terms of use");
    expect((metadata.description ?? "").length).toBeGreaterThan(40);
  });

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

  it("has exactly one h1, and opens with it", () => {
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
  });

  it("skips no level on the way down", () => {
    for (const [index, level] of levels.entries()) {
      if (index === 0) continue;
      expect(level).toBeLessThanOrEqual((levels[index - 1] as number) + 1);
    }
  });
});

describe("every link works and can be reached (covers AC-20)", () => {
  const anchors = flatten(page).filter((element) => element.type === "a");

  it("gives every one an href and a name", () => {
    expect(anchors.length).toBeGreaterThan(0);

    for (const anchor of anchors) {
      expect((anchor.props as { readonly href?: string }).href).toBeTruthy();
      expect(textOf(anchor).trim()).not.toBe("");
    }
  });
});

describe("what the service is, and what it does not promise (covers AC-15)", () => {
  it("says it is free", () => {
    expect(text).toMatch(/JobHunt is free/);
  });

  it("promises no availability, and says it may change or stop", () => {
    expect(text).toMatch(/no guarantee that the service is available/);
    expect(text).toMatch(/it may stop entirely/);
  });
});

describe("acceptable use (covers AC-15)", () => {
  it("forbids automated scraping", () => {
    expect(text).toMatch(/Do not scrape the service automatically/);
  });

  it("forbids applying on somebody else's behalf", () => {
    expect(text).toMatch(/Do not use it to apply on somebody else/);
  });

  it("forbids reaching another person's data", () => {
    expect(text).toMatch(/Do not try to reach another person/);
  });

  it("says what removal for abuse means", () => {
    expect(text).toMatch(/removed for abuse/);
  });
});

describe("content ownership and the licence (covers AC-15)", () => {
  it("leaves ownership with the person", () => {
    expect(text).toMatch(/Everything you write stays yours/);
  });

  /**
   * THE FIVE LIMITS ARE THE CLAUSE. Each is asserted on its own, because a
   * licence that quietly lost one of them would still read like a licence: the
   * defect would be invisible to anyone not comparing it against AC-15.
   */
  it("grants a non exclusive licence", () => {
    expect(text).toMatch(/non exclusive/);
  });

  it("limits it to operating the service", () => {
    expect(text).toMatch(/limited to operating this service for you/);
  });

  it("ends it when the data is deleted", () => {
    expect(text).toMatch(/ends when your data is deleted/);
  });

  it("makes it not sublicensable", () => {
    expect(text).toMatch(/not sublicensable/);
  });

  it("excludes training models", () => {
    expect(text).toMatch(/does not extend to training machine learning models/);
  });
});

describe("warranty and liability (covers AC-15)", () => {
  it("provides the service as is with no warranty", () => {
    expect(text).toMatch(/provided as is, with no warranty/);
  });

  it("limits liability to the fullest extent the law allows", () => {
    expect(text).toMatch(/To the fullest extent the law allows/);
  });

  /**
   * AC-15 states NO cap figure, and the absence is the decision: the service is
   * free, so there is no payment to anchor a number against and an invented one
   * would mean nothing. A later edit adding "$100" would look like diligence.
   */
  it("states no cap figure, and says why not", () => {
    expect(text).toMatch(/No cap figure is written here/);
    expect(text).not.toMatch(/\$\s?\d/);
  });
});

describe("governing law (covers AC-15)", () => {
  /**
   * WRITTEN OUT IN FULL, because Georgia is also a country and the readers this
   * is written for are explicitly worldwide. The bare word would be ambiguous
   * to exactly the audience most affected by it.
   */
  it("names the state in full, not the bare word", () => {
    expect(text).toContain("State of Georgia, United States of America");
  });

  it("names the venue", () => {
    expect(text).toMatch(/state or federal courts located in Georgia/);
  });
});

describe("how the terms change (covers AC-15, AC-16)", () => {
  it("carries the effective date", () => {
    expect(text).toContain(formatEffectiveDate());
  });

  it("updates in place with no advance notice", () => {
    expect(text).toMatch(/updated in place/);
    expect(text).toMatch(/no advance notice/);
  });

  it("makes continued use the acceptance (covers AC-16)", () => {
    expect(text).toMatch(/continuing to use the service after a change/i);
  });
});

describe("getting in touch", () => {
  it("publishes the same address the privacy notice does", () => {
    expect(text).toContain(CONTACT_EMAIL);
  });
});
