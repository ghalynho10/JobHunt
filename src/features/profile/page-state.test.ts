import { describe, expect, it } from "vitest";

import { SECTIONS, parsePageState } from "./page-state";

/**
 * Spec 0010, AC-13: every edit state is a URL, parsed against a closed set.
 *
 * WHAT THIS FILE IS REALLY GUARDING. The query string is untrusted input, so the
 * first job is that nothing anybody types produces a crash or an error page. The
 * second is subtler and is where this feature actually broke: the parse must not
 * be LOSSY. `/check verify` on 2026-09-02 found a malformed entry id collapsing
 * into the plain view, which threw away the only fact the page needed to tell
 * the reader their entry was gone. The `entry-gone` cases below are that bug,
 * pinned at the layer where it started.
 *
 * `src/app/(app)/profile/page.test.ts` asserts the same behaviour through the
 * rendered page. Both are worth having: the page test proves the reader sees the
 * sentence, and this one proves the state that carries it, which is where a
 * later refactor would drop it.
 */

const UUID = "d64bb7db-92f4-40c7-bc47-c40cbc5b3839";

describe("the plain view is the fallback for anything unrecognised", () => {
  it("is the state when nothing is asked for", () => {
    expect(parsePageState({})).toEqual({ kind: "view" });
  });

  it.each([
    ["an unknown section", { edit: "banana" }],
    ["an unknown add target", { add: "education" }],
    ["an unknown delete target", { delete: "everything" }],
    ["an empty section name", { edit: "" }],
  ])("is the state for %s, never an error", (_case, params) => {
    // covers: AC-13
    expect(parsePageState(params)).toEqual({ kind: "view" });
  });

  it("ignores a repeated parameter rather than picking one of them", () => {
    /**
     * `?edit=identity&edit=skills` arrives as an array. Choosing either would be
     * this function deciding which of two conflicting instructions the visitor
     * meant, so it decides neither.
     */
    expect(parsePageState({ edit: ["identity", "skills"] })).toEqual({
      kind: "view",
    });
  });
});

describe("each section opens its own edit state", () => {
  it.each(SECTIONS.filter((section) => section !== "experience"))(
    "opens %s from the edit parameter",
    (section) => {
      // covers: AC-13
      expect(parsePageState({ edit: section })).toEqual({
        kind: "edit",
        section,
      });
    },
  );

  it("opens the work history add form", () => {
    expect(parsePageState({ add: "experience" })).toEqual({
      kind: "add-experience",
    });
  });

  it("opens one entry for editing when the id is usable", () => {
    expect(parsePageState({ edit: "experience", entry: UUID })).toEqual({
      kind: "edit-experience",
      entryId: UUID,
    });
  });

  it("opens the delete confirmation when the id is usable", () => {
    expect(parsePageState({ delete: "experience", entry: UUID })).toEqual({
      kind: "delete-experience",
      entryId: UUID,
    });
  });
});

describe("an entry that cannot be resolved is its own state, not a silent fallback", () => {
  it.each([
    ["edit", { edit: "experience", entry: "not-a-uuid" }],
    ["delete", { delete: "experience", entry: "zzz" }],
    ["an empty id", { edit: "experience", entry: "" }],
  ])("reports entry-gone for %s", (_case, params) => {
    /**
     * THE REGRESSION. Each of these used to return `{ kind: "view" }`, which is
     * a defensible value and the wrong one: the page then rendered the list and
     * said nothing, so somebody who followed a stale link saw a page that simply
     * ignored them.
     */
    // covers: AC-13
    expect(parsePageState(params)).toEqual({ kind: "entry-gone" });
  });

  it("stays the plain view when the section is named but no entry is", () => {
    /**
     * The distinction the fix turns on, and the easy thing to get wrong while
     * making the case above work. `?edit=experience` alone is the add form's URL
     * without the add: nothing was asked for, so there is nothing to report as
     * missing.
     */
    // covers: AC-13
    expect(parsePageState({ edit: "experience" })).toEqual({ kind: "view" });
    expect(parsePageState({ delete: "experience" })).toEqual({ kind: "view" });
  });

  it("treats a repeated entry parameter as none given, not as one gone", () => {
    /**
     * A JUDGEMENT CALL, WRITTEN DOWN RATHER THAN ASSUMED. `?entry=a&entry=b`
     * arrives as an array, and `single()` treats every repeated parameter as
     * absent on purpose, because choosing one would be the parser deciding which
     * of two conflicting instructions the visitor meant. Applied here that means
     * the plain view, the same as naming no entry at all.
     *
     * The alternative reading is that the reader did ask for an entry and should
     * be told it is not there. Nothing the product links to can build this URL,
     * so the two only differ for a hand typed one. Recorded so a later reader
     * sees it was decided, not overlooked.
     */
    expect(parsePageState({ edit: "experience", entry: [UUID, UUID] })).toEqual(
      {
        kind: "view",
      },
    );
  });

  it("ignores an entry id on a section that has no entries", () => {
    /** Only work history has rows to address, so an id elsewhere means nothing. */
    expect(parsePageState({ edit: "identity", entry: "not-a-uuid" })).toEqual({
      kind: "edit",
      section: "identity",
    });
  });
});

describe("a URL naming more than one thing resolves the same way every time", () => {
  it("puts delete ahead of add and edit", () => {
    /**
     * The product's own links never build these, so this is only about a hand
     * typed combination rendering predictably rather than depending on the key
     * order of an object.
     */
    expect(
      parsePageState({
        delete: "experience",
        add: "experience",
        edit: "skills",
        entry: UUID,
      }),
    ).toEqual({
      kind: "delete-experience",
      entryId: UUID,
    });
  });

  it("puts add ahead of edit", () => {
    expect(parsePageState({ add: "experience", edit: "skills" })).toEqual({
      kind: "add-experience",
    });
  });
});
