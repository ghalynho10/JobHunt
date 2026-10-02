// @vitest-environment jsdom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownText } from "./markdown";

/**
 * The render safety proof (spec 0024, AC-13, invariant 5).
 *
 * THE OUTPUT IS PARSED BY A REAL DOM, NEVER SEARCHED WITH A REGEX. The question
 * is what a browser would build from this HTML, and a string search answers a
 * different one: `&lt;script&gt;` contains the letters `script` and is
 * harmless, while an attribute split across quotes can hide from a pattern and
 * still execute. jsdom is opted into for this file alone, the same per file
 * docblock `focus-keeper.dom.test.tsx` uses.
 *
 * THE CHECKS ARE PROVED ABLE TO FAIL FIRST. `unsafeFindings` runs against a
 * naive stand in (markdown to HTML by hand, injected raw) and must report all
 * three problems there, before its silence about the real renderer means
 * anything. A checker that found nothing anywhere would pass both.
 */

/** Everything a browser would treat as executable, clickable or loadable. */
function unsafeFindings(html: string): readonly string[] {
  const document = new DOMParser().parseFromString(
    `<body>${html}</body>`,
    "text/html",
  );
  const findings: string[] = [];

  if (document.querySelector("script") !== null) findings.push("script");

  for (const anchor of document.querySelectorAll("a")) {
    const href = anchor.getAttribute("href");

    /** An empty `href` is still a clickable link, back to the current page. */
    if (href === null || href.trim() === "") {
      findings.push("empty href");
      continue;
    }

    if (!/^(https?:|mailto:|\/|#)/i.test(href.trim())) {
      findings.push(`unsafe href ${href}`);
    }
  }

  if (document.querySelector("img") !== null) findings.push("img");

  return findings;
}

/** The three attacks AC-13 names, in one document. */
const HOSTILE = [
  "# Jane Doe",
  "",
  '<script>alert("owned")</script>',
  "",
  "[click me](javascript:alert(1))",
  "",
  "![beacon](https://tracker.example.test/pixel.png)",
].join("\n");

/**
 * The naive stand in: what "just render the markdown" looks like with no
 * safety rules, injecting its own HTML raw.
 */
function NaiveMarkdown({ source }: { readonly source: string }): ReactElement {
  const html = source
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\((.+)\)/g, '<a href="$2">$1</a>');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

describe("the checker can see each problem (non vacuity)", () => {
  it("reports all three against a naive renderer", () => {
    // covers: AC-13
    const findings = unsafeFindings(
      renderToStaticMarkup(<NaiveMarkdown source={HOSTILE} />),
    );

    expect(findings).toContain("script");
    expect(findings).toContain("unsafe href javascript:alert(1)");
    expect(findings).toContain("img");
  });

  it("reports an empty href, the shape a refused URL leaves behind", () => {
    expect(unsafeFindings('<a href="">x</a>')).toEqual(["empty href"]);
  });
});

describe("the real renderer (AC-13)", () => {
  const html = renderToStaticMarkup(<MarkdownText source={HOSTILE} />);

  it("produces none of the three", () => {
    // covers: AC-13
    expect(unsafeFindings(html)).toEqual([]);
  });

  it("shows a typed script tag as visible text rather than dropping it", () => {
    /**
     * Stored raw, shown raw: the reader typed these characters, and silently
     * deleting them would be the renderer rewriting the resume.
     */
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.body.textContent).toContain(
      '<script>alert("owned")</script>',
    );
  });

  it("keeps the refused link's words, as text", () => {
    const document = new DOMParser().parseFromString(html, "text/html");

    expect(document.body.textContent).toContain("click me");
    expect(document.querySelectorAll("a")).toHaveLength(0);
  });

  it("still renders an ordinary https link as a link", () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(
        <MarkdownText source="[portfolio](https://example.test/work)" />,
      ),
      "text/html",
    );
    const anchor = document.querySelector("a");

    expect(anchor?.getAttribute("href")).toBe("https://example.test/work");
    expect(anchor?.getAttribute("rel")).toBe("nofollow ugc noreferrer");
  });
});

describe("formatting, never the raw markers (AC-5)", () => {
  const document = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <MarkdownText
        source={[
          "# Jane Doe",
          "",
          "## Skills",
          "",
          "- TypeScript",
          "- Postgres",
          "",
          "**Staff Engineer** at _Northwind_",
        ].join("\n")}
      />,
    ),
    "text/html",
  );

  it("renders headings, lists and emphasis as elements", () => {
    // covers: AC-5
    expect(document.querySelectorAll("li")).toHaveLength(2);
    expect(document.querySelector("strong")?.textContent).toBe(
      "Staff Engineer",
    );
    expect(document.querySelector("em")?.textContent).toBe("Northwind");
    expect(document.body.textContent).not.toMatch(/[#*_]/);
  });

  it("never adds a second h1 to the page that embeds it", () => {
    /** `#` and `##` both land at `h2`; the embedding page owns its `h1`. */
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    expect(
      [...document.querySelectorAll("h2")].map((node) => node.textContent),
    ).toEqual(["Jane Doe", "Skills"]);
  });
});
