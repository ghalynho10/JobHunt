import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownText } from "@/lib/markdown";

import { profileSeed, type SeedInput } from "./seed";

/**
 * The profile seed template (spec 0024, AC-2).
 *
 * Whole outputs are compared byte for byte rather than searched with
 * `toContain`, because the template's claim is about the entire document: its
 * order, its blank lines, and what it leaves out. A substring check passes a
 * seed with the blocks in the wrong order or a stray contact line added.
 */

const FULL: SeedInput = {
  fullName: "Jane Doe",
  location: "Chicago, IL",
  summary: "Backend engineer who likes boring databases.",
  skills: ["TypeScript", "Postgres"],
  experience: [
    {
      title: "Engineer",
      company: "Northwind Labs",
      description: undefined,
      startedOn: "2018-03-01",
      endedOn: "2021-06-01",
    },
    {
      title: "Staff Engineer",
      company: "Contoso",
      description: "Led the billing rewrite.",
      startedOn: "2021-07-01",
      endedOn: undefined,
    },
  ],
};

describe("the profile seed (AC-2)", () => {
  it("writes every block in the spec's order, most recently started first", () => {
    // covers: AC-2
    expect(profileSeed(FULL)).toBe(
      [
        "Jane Doe",
        "",
        "Chicago, IL",
        "",
        "Backend engineer who likes boring databases.",
        "",
        "## Skills",
        "",
        "- TypeScript",
        "- Postgres",
        "",
        "## Experience",
        "",
        "**Staff Engineer** — Contoso (July 2021 – Present)",
        "",
        "Led the billing rewrite.",
        "",
        "**Engineer** — Northwind Labs (March 2018 – June 2021)",
        "",
        "## Education",
        "",
      ].join("\n"),
    );
  });

  it("renders the location on its own line, not joined to the name", () => {
    /**
     * Asserted on the rendered output a reader sees, not on the seed string,
     * because the defect lived in the gap between the two: markdown renders a
     * single line break as a space, so two consecutive header lines came out as
     * "Avery Fixture Springfield, IL" (`/check verify`, 2026-09-30).
     */
    // covers: AC-2, AC-5
    const html = renderToStaticMarkup(
      createElement(MarkdownText, { source: profileSeed(FULL) }),
    );

    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(
      (match) => match[1],
    );

    expect(paragraphs.slice(0, 2)).toEqual(["Jane Doe", "Chicago, IL"]);
  });

  it("carries no `\\r` from profile text saved through a browser form", () => {
    /**
     * The profile stores its textareas as posted, so a two line summary saved
     * on `/profile` holds `\r\n` (seen in the database on 2026-09-30). A seed
     * that kept it never equalled the field it opened in (AC-7).
     */
    // covers: AC-2, AC-7
    const seed = profileSeed({
      ...FULL,
      summary: "First line.\r\nSecond line.",
      experience: [
        {
          title: "Engineer",
          company: "Contoso",
          description: "Shipped it.\r\nThen shipped it again.",
          startedOn: "2021-07-01",
          endedOn: undefined,
        },
      ],
    });

    expect(seed).not.toContain("\r");
    expect(seed).toContain("First line.\nSecond line.");
  });

  it("omits empty blocks whole but always keeps Education", () => {
    // covers: AC-2, AC-14
    expect(
      profileSeed({
        fullName: "Jane Doe",
        location: undefined,
        summary: undefined,
        skills: [],
        experience: [],
      }),
    ).toBe("Jane Doe\n\n## Education\n");
  });

  it("carries no contact line and no work history location", () => {
    /**
     * Guarded against the inputs themselves: `SeedInput` has no email, phone or
     * role location field, so a later change adding one has to change this
     * type, and this test names why it was left out.
     */
    // covers: AC-2
    expect(Object.keys(FULL).sort()).toEqual([
      "experience",
      "fullName",
      "location",
      "skills",
      "summary",
    ]);
    expect(Object.keys(FULL.experience[0] ?? {}).sort()).toEqual([
      "company",
      "description",
      "endedOn",
      "startedOn",
      "title",
    ]);
  });

  it("never truncates a seed over the save ceiling", () => {
    // covers: AC-2
    const long = "x".repeat(4000);
    const seed = profileSeed({
      ...FULL,
      summary: long,
      experience: Array.from({ length: 5 }, (_, index) => ({
        title: `Role ${index}`,
        company: "Contoso",
        description: long,
        startedOn: `201${index}-01-01`,
        endedOn: undefined,
      })),
    });

    expect(seed.length).toBeGreaterThan(20000);
    expect(seed.split(long)).toHaveLength(7);
  });
});
