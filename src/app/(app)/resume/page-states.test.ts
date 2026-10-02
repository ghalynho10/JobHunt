import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import type { ResumeVersion } from "@/features/resume/queries";
import { ResumeEditor } from "@/features/resume/resume-editor";
import { failure, success } from "@/lib/result";

import {
  findAllByType,
  findByType,
  renderDeepAsync,
  textOf,
} from "../../../../test/helpers/react-element";

/**
 * What `/resume` renders for each state a reader can reach (spec 0024, AC-1,
 * AC-2, AC-5, AC-6, AC-9, AC-10). `page.test.ts` covers the AC-8 fallbacks.
 *
 * THE GAP THIS FILE WAS WRITTEN FOR. `previousVersionNumber` must always be
 * the profile's current `MAX(version_number)` as read when the editor loaded,
 * never the number of whichever text is on screen (AC-9). Until 2026-10-02
 * nothing pinned it: `page.test.ts` never looked at the editor, and
 * `test/integration/resume-actions.test.ts` supplies the number by hand, so a
 * page that handed a Restore its own version's number would have passed every
 * suite while turning each restore into a false conflict (`/check verify`,
 * `verify.md` line 44). That exact break, written into `page.tsx` on purpose,
 * failed the Restore test below and nothing else.
 *
 * THE PROPS ARE THE CONTRACT. `renderDeepAsync` stops at `ResumeEditor` (a
 * client component with hooks, which cannot be called as a plain function) so
 * its element, and the two props the page decides, stay readable. What the
 * editor then does with them is `resume-editor.dom.test.tsx`'s job.
 *
 * THE READS ARE REPLACED AT THE MODULE THE PAGE IMPORTS, the database
 * boundary, the same seam `page.test.ts` uses. The history stub honours
 * `withContent` exactly as the real read does.
 */

const VERSION_ONE: ResumeVersion = {
  id: "11111111-aaaa-4aaa-8aaa-111111111111",
  versionNumber: 1,
  content: "# Version one",
  createdAt: "2026-09-28T10:00:00Z",
};

const VERSION_TWO: ResumeVersion = {
  id: "22222222-aaaa-4aaa-8aaa-222222222222",
  versionNumber: 2,
  content: "# Version two",
  createdAt: "2026-09-29T10:00:00Z",
};

const VERSION_THREE: ResumeVersion = {
  id: "33333333-aaaa-4aaa-8aaa-333333333333",
  versionNumber: 3,
  content: "# Version three",
  createdAt: "2026-09-30T10:00:00Z",
};

/** Newest first, as the real read returns them. */
const SAVED = [VERSION_THREE, VERSION_TWO, VERSION_ONE];

const PROFILE = {
  id: "0f5f4f1e-3a2b-4c7d-9e8f-1a2b3c4d5e6f",
  full_name: "Fixture Person",
  location: "Dayton, OH",
  summary: undefined,
};

const readOwnProfile = vi.fn();
const readResumeHistory = vi.fn();
const readResumeVersion = vi.fn();

vi.mock("@/features/profile/queries", () => ({
  readOwnProfile,
  readProfileSections: () =>
    Promise.resolve(
      success({ skills: [], experience: [], preferences: undefined }),
    ),
}));

vi.mock("@/features/resume/queries", () => ({
  readResumeHistory,
  readResumeVersion,
}));

const { default: ResumePage } = await import("./page");

/** The reads as they answer for a caller whose saved versions are these. */
function withSaved(saved: readonly ResumeVersion[]) {
  readResumeHistory.mockImplementation(
    ({ withContent }: { readonly withContent: boolean }) =>
      Promise.resolve(
        success({
          versions: saved.map(({ id, versionNumber, createdAt }) => ({
            id,
            versionNumber,
            createdAt,
          })),
          current: withContent ? saved[0] : undefined,
        }),
      ),
  );
  readResumeVersion.mockImplementation((versionId: string) =>
    Promise.resolve(success(saved.find((version) => version.id === versionId))),
  );
}

async function render(searchParams: Record<string, string>) {
  return renderDeepAsync(
    ResumePage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(searchParams),
    }),
    [Button, ResumeEditor],
  );
}

/**
 * The props the page handed the editor for these search parameters.
 *
 * THROWS WHEN NO EDITOR RENDERED, so a page that fell back to the plain view
 * fails here by name rather than as a confusing wrong number below.
 */
async function editorFor(
  searchParams: Record<string, string>,
): Promise<ComponentProps<typeof ResumeEditor>> {
  const editor = findByType(await render(searchParams), ResumeEditor);

  if (editor === undefined) {
    throw new Error(
      `The page rendered no editor for ${JSON.stringify(searchParams)}.`,
    );
  }

  return editor.props as ComponentProps<typeof ResumeEditor>;
}

beforeEach(() => {
  readOwnProfile.mockReset();
  readResumeHistory.mockReset();
  readResumeVersion.mockReset();
  readOwnProfile.mockResolvedValue(success(PROFILE));
  withSaved(SAVED);
});

describe("the version number the editor submits against (AC-9)", () => {
  it("is the current version on Restore, never the restored one", async () => {
    // covers: AC-6, AC-9
    const editor = await editorFor({ edit: "resume", from: VERSION_ONE.id });

    expect(editor.initialContent).toBe(VERSION_ONE.content);
    expect(editor.previousVersionNumber).toBe(3);
  });

  it("is the current version on Edit", async () => {
    // covers: AC-5, AC-9
    const editor = await editorFor({ edit: "resume" });

    expect(editor.initialContent).toBe(VERSION_THREE.content);
    expect(editor.previousVersionNumber).toBe(3);
  });

  it("is still the current version when starting again from the profile", async () => {
    /**
     * The seed is not a version, but versions exist, so saving it must claim
     * the next number. A page that sent 0 here would make that save collide
     * with version 1 and report a conflict that never happened; that break,
     * written into `page.tsx` on purpose, failed this test and nothing else.
     */
    // covers: AC-5, AC-9
    const editor = await editorFor({ edit: "resume", from: "profile" });

    expect(editor.initialContent).toBe(
      "Fixture Person\n\nDayton, OH\n\n## Education\n",
    );
    expect(editor.previousVersionNumber).toBe(3);
  });

  it("is 0 before the first save, a number no version can hold", async () => {
    // covers: AC-2, AC-9
    withSaved([]);

    const editor = await editorFor({ edit: "resume", from: "profile" });

    expect(editor.previousVersionNumber).toBe(0);
  });
});

describe("before any resume exists (AC-1)", () => {
  it("names that none exists and offers to start from the profile", async () => {
    // covers: AC-1
    withSaved([]);

    const tree = await render({});
    const start = findAllByType(tree, Button).find(
      (button) => textOf(button) === "Start from my profile",
    );

    expect(textOf(tree)).toContain("You haven't written a resume yet.");
    expect(start?.props).toMatchObject({
      href: "/resume?edit=resume&from=profile",
    });
    expect(findByType(tree, ResumeEditor)).toBeUndefined();
  });
});

describe("a caller with no profile row (AC-10)", () => {
  it("is sent to /profile, where a profile is made", async () => {
    // covers: AC-10
    readOwnProfile.mockResolvedValue(
      failure({
        kind: "record_not_found",
        severity: "expected",
        message: "No profile yet.",
      }),
    );

    await expect(render({})).rejects.toMatchObject({
      digest: expect.stringContaining("/profile") as unknown,
    });
  });
});
