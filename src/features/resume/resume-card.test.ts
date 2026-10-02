import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { failure, success } from "@/lib/result";

import {
  findAllByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { ResumeCard } from "./resume-card";

/**
 * The `/profile` resume card's three states (spec 0024, AC-10).
 *
 * Rendered through the component with `renderDeep`, stopping at `Button` so the
 * link's props are asserted rather than `next/link`'s internals.
 */

function render(history: Parameters<typeof ResumeCard>[0]["history"]) {
  return renderDeep(ResumeCard({ history }), [Button]);
}

describe("the resume card (AC-10)", () => {
  it("says no resume exists yet and offers to write one", () => {
    // covers: AC-10
    const tree = render(success({ versions: [], current: undefined }));
    const [link] = findAllByType(tree, Button);

    expect(textOf(tree)).toContain("No resume yet.");
    expect(link?.props).toMatchObject({ href: "/resume" });
    expect(textOf(link)).toBe("Write your resume");
  });

  it("names the current version and when it was saved", () => {
    // covers: AC-10
    const tree = render(
      success({
        versions: [
          {
            id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
            versionNumber: 3,
            createdAt: "2026-09-30T15:00:00Z",
          },
          {
            id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
            versionNumber: 2,
            createdAt: "2026-09-20T15:00:00Z",
          },
        ],
        current: undefined,
      }),
    );
    const [link] = findAllByType(tree, Button);

    expect(textOf(tree)).toContain(
      "Resume: version 3, last updated September 30, 2026.",
    );
    expect(textOf(link)).toBe("Open your resume");
  });

  it("shows only its own failure line when the read failed", () => {
    // covers: AC-10
    const tree = render(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "unreachable",
      }),
    );

    expect(textOf(tree)).toBe("We couldn't load your resume just now.");
    expect(findAllByType(tree, Button)).toHaveLength(0);
  });
});
