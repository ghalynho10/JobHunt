import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { success } from "@/lib/result";

import {
  renderDeepAsync,
  textOf,
} from "../../../../test/helpers/react-element";

/**
 * `/resume`'s plain view fallbacks (spec 0024, AC-5, AC-8).
 *
 * THE REGRESSION THIS LOCKS. The build's own browser pass on 2026-09-30 found
 * that a well formed `from` id belonging to nobody the caller could see
 * rendered `COPY-6` correctly and then, beneath it, "You haven't written a
 * resume yet" to a reader with four saved versions. The page skipped the
 * current version's text for a Restore target, and the plain view read that
 * absence as "no resume".
 *
 * THE HISTORY STUB HONOURS `withContent` EXACTLY AS THE REAL READ DOES, and
 * that is what makes this a test of the page rather than of the stub: with the
 * bug back, the page asks for no text, gets none, and the assertion below
 * fails on the empty state.
 *
 * `renderDeepAsync` stops at `Button`, whose `next/link` is a client component
 * with nothing to render in a node test; its children are still read.
 */

const CURRENT = {
  id: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  versionNumber: 4,
  content: "# Jane Verify",
  createdAt: "2026-09-30T15:00:00Z",
};

vi.mock("@/features/profile/queries", () => ({
  readOwnProfile: () =>
    Promise.resolve(
      success({
        id: "0f5f4f1e-3a2b-4c7d-9e8f-1a2b3c4d5e6f",
        full_name: "Fixture Person",
        location: undefined,
        summary: undefined,
      }),
    ),
  readProfileSections: () =>
    Promise.resolve(
      success({ skills: [], experience: [], preferences: undefined }),
    ),
}));

vi.mock("@/features/resume/queries", () => ({
  readResumeHistory: ({ withContent }: { readonly withContent: boolean }) =>
    Promise.resolve(
      success({
        versions: [
          {
            id: CURRENT.id,
            versionNumber: CURRENT.versionNumber,
            createdAt: CURRENT.createdAt,
          },
        ],
        current: withContent ? CURRENT : undefined,
      }),
    ),
  /** Nobody the caller can see owns this id: row level security's answer. */
  readResumeVersion: () => Promise.resolve(success(undefined)),
}));

const { default: ResumePage } = await import("./page");

async function textFor(searchParams: Record<string, string>): Promise<string> {
  return textOf(
    await renderDeepAsync(
      ResumePage({
        params: Promise.resolve({}),
        searchParams: Promise.resolve(searchParams),
      }),
      [Button],
    ),
  );
}

describe("a Restore target that is not the caller's (AC-8)", () => {
  it("says the version is gone above the real plain view, never the empty state", async () => {
    // covers: AC-8
    const text = await textFor({
      edit: "resume",
      from: "3f2b8c1e-7d4a-4e5b-9c6d-1a2b3c4d5e6f",
    });

    expect(text).toContain("That version is no longer there.");
    expect(text).toContain("1 version saved.");
    expect(text).not.toContain("You haven't written a resume yet.");
  });
});

describe("a malformed Restore target (AC-8)", () => {
  it("renders the same answer as a foreign one", async () => {
    // covers: AC-8
    const text = await textFor({ edit: "resume", from: "not-a-uuid" });

    expect(text).toContain("That version is no longer there.");
    expect(text).toContain("1 version saved.");
  });
});
