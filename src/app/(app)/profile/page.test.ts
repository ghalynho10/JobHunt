import { describe, expect, it, vi } from "vitest";

import { success } from "@/lib/result";

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

const { default: ProfilePage } = await import("./page");

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
