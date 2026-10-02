import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@/lib/result";

import { renderDeep, textOf } from "../../../../test/helpers/react-element";

/**
 * Spec 0010, AC-13: an `entry` id that cannot be resolved says so.
 *
 * THE REGRESSION THIS LOCKS. `/check verify` on 2026-09-02 found that a
 * MALFORMED entry id (`?edit=experience&entry=not-a-uuid`) rendered the plain
 * list and said nothing at all, while a well formed id that matched no row
 * correctly rendered `COPY-4`. The two are the same event to the reader, and
 * AC-13 asks for the same render, so the malformed half was simply missing.
 *
 * The cause was that `parsePageState` collapsed an unusable id to the plain
 * `view` state, throwing away the only fact the page needed. The fix gave that
 * case its own member of the union. This file is what stops it collapsing
 * again: the two ids below take different paths through the parser and must
 * still produce the same sentence.
 *
 * WHY IT DRIVES THE PAGE AND NOT THE PARSER. A parser test would have passed
 * throughout the bug: `parsePageState` was returning a defensible value, and
 * `askedForEntry()` even reported the missing fact correctly. Nothing was wrong
 * until the page composed them, and the page is where nobody was looking. So
 * this asserts what the reader sees.
 *
 * The two reads are replaced at the module boundary so the page can render
 * without a database. Nothing this file asserts comes from them: the fixture
 * carries one work history entry purely so the list has something in it, which
 * is what makes "the list rendered and the line did not" a visible failure
 * rather than an empty page.
 */
const PROFILE = {
  id: "0f5f4f1e-3a2b-4c7d-9e8f-1a2b3c4d5e6f",
  full_name: "Fixture Person",
  location: undefined,
  summary: undefined,
};

/** Replaceable per test; `beforeEach` restores the fixture profile. */
const readOwnProfile = vi.fn();

vi.mock("@/features/profile/queries", () => ({
  readOwnProfile,
  readProfileSections: () =>
    Promise.resolve(
      success({
        skills: [],
        experience: [
          {
            id: "d64bb7db-92f4-40c7-bc47-c40cbc5b3839",
            company: "Northwind Labs",
            title: "Backend Engineer",
            location: undefined,
            description: undefined,
            started_on: "2019-03-01",
            ended_on: undefined,
          },
        ],
        preferences: undefined,
      }),
    ),
}));

/**
 * The resume card's read (spec 0024, AC-10), replaced for the same reason as
 * the two above: the page renders without a database. `beforeEach` restores
 * "no resume yet"; the AC-10 tests below replace it.
 */
const readResumeHistory = vi.fn();

vi.mock("@/features/resume/queries", () => ({ readResumeHistory }));

const { default: ProfilePage } = await import("./page");
const { IdentityForm } = await import("@/features/profile/identity-form");

beforeEach(() => {
  readOwnProfile.mockReset();
  readResumeHistory.mockReset();
  readOwnProfile.mockResolvedValue(success(PROFILE));
  readResumeHistory.mockResolvedValue(
    success({ versions: [], current: undefined }),
  );
});

/** `COPY-4`, the engineer's, asserted verbatim. */
const GONE = "That entry is no longer on your profile.";

/**
 * The page as a request would reach it.
 *
 * `renderDeep` invokes the page's own section modules, which is where this
 * composition lives. Every component on the plain view path is a plain function
 * with no state and no hooks, so calling it is its whole behaviour; the edit
 * forms are client components and are deliberately not on any path here.
 */
function render(searchParams: Record<string, string>) {
  return ProfilePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(searchParams),
  });
}

describe("AC-13: an entry id that resolves to nothing says so", () => {
  it("says it for a well formed id that matches no row", async () => {
    expect(
      textOf(
        renderDeep(
          (await render({
            edit: "experience",
            entry: "11111111-2222-4333-8444-555555555555",
          })) as never,
        ),
      ),
    ).toContain(GONE);
  });

  it("says it for a malformed id, which is the case that regressed", async () => {
    expect(
      textOf(
        renderDeep(
          (await render({ edit: "experience", entry: "not-a-uuid" })) as never,
        ),
      ),
    ).toContain(GONE);
  });

  it("says it for a malformed id on the delete URL", async () => {
    expect(
      textOf(
        renderDeep(
          (await render({ delete: "experience", entry: "zzz" })) as never,
        ),
      ),
    ).toContain(GONE);
  });

  it("stays silent when no entry was asked for, so the line means something", async () => {
    expect(textOf(renderDeep((await render({})) as never))).not.toContain(GONE);
  });
});

describe("the resume card (spec 0024, AC-10)", () => {
  it("names the current version and when it was saved, linking to /resume", async () => {
    // covers: AC-10
    readResumeHistory.mockResolvedValue(
      success({
        versions: [
          {
            id: "33333333-aaaa-4aaa-8aaa-333333333333",
            versionNumber: 3,
            createdAt: "2026-09-30T15:00:00Z",
          },
        ],
        current: undefined,
      }),
    );

    const text = textOf(renderDeep((await render({})) as never));

    expect(text).toContain(
      "Resume: version 3, last updated September 30, 2026.",
    );
    expect(text).toContain("Open your resume");
  });

  it("shows only its own failure line when its read fails, and the rest of the page still renders", async () => {
    /**
     * The isolation is the claim: a broken resume read must cost the reader
     * the card and nothing else. So the assertions reach past the card, to
     * the identity and the work history the page renders either side of it.
     */
    // covers: AC-10
    /**
     * The failure's own message differs from `COPY-29` on purpose, so the
     * line below can only come from the card's copy, never from the page
     * echoing whatever the read reported.
     */
    readResumeHistory.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "Fixture outage, never shown.",
      }),
    );

    const text = textOf(renderDeep((await render({})) as never));

    expect(text).toContain("We couldn't load your resume just now.");
    expect(text).not.toContain("Fixture outage, never shown.");
    expect(text).toContain("Fixture Person");
    expect(text).toContain("Northwind Labs");
    expect(text).not.toContain("Resume:");
  });

  it("does not render at all before a profile row exists", async () => {
    /**
     * Spec 0010 AC-1's identity only first run: no section card renders, and
     * this one does not either. `IdentityForm` is a client component, so the
     * walk stops at it rather than calling its hooks.
     */
    // covers: AC-10
    readOwnProfile.mockResolvedValue(
      failure({
        kind: "record_not_found",
        severity: "expected",
        message: "No profile yet.",
      }),
    );

    const tree = renderDeep((await render({})) as never, [IdentityForm]);
    const text = textOf(tree);

    expect(text).toContain("Your name is all this needs to start.");
    expect(text).not.toContain("No resume yet.");
    expect(text).not.toContain("Resume:");
  });
});
