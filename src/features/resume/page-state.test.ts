import { describe, expect, it } from "vitest";

import { parseResumePageState } from "./page-state";

/** The `/resume` URL states (spec 0024, AC-5, AC-6, AC-8). */

const VERSION_ID = "3f2b8c1e-7d4a-4e5b-9c6d-1a2b3c4d5e6f";

describe("parseResumePageState", () => {
  it("renders the plain view with no parameters", () => {
    // covers: AC-5
    expect(parseResumePageState({})).toEqual({ kind: "view" });
  });

  it.each(["profile", "Resume", "", "experience"])(
    "renders the plain view for an unrecognised edit value %j, never an error",
    (edit) => {
      // covers: AC-5
      expect(parseResumePageState({ edit })).toEqual({ kind: "view" });
    },
  );

  it("opens the editor on the current version when from is absent", () => {
    // covers: AC-5
    expect(parseResumePageState({ edit: "resume" })).toEqual({
      kind: "edit",
      source: { kind: "current" },
    });
  });

  it("opens the editor on the profile seed for from=profile", () => {
    // covers: AC-1, AC-5
    expect(parseResumePageState({ edit: "resume", from: "profile" })).toEqual({
      kind: "edit",
      source: { kind: "profile" },
    });
  });

  it("opens the editor on a named version for a uuid", () => {
    // covers: AC-6
    expect(parseResumePageState({ edit: "resume", from: VERSION_ID })).toEqual({
      kind: "edit",
      source: { kind: "version", versionId: VERSION_ID },
    });
  });

  it.each(["not-a-uuid", "1", "PROFILE", "'; drop table resume_version; --"])(
    "says the version is gone for a malformed from %j",
    (from) => {
      // covers: AC-8
      expect(parseResumePageState({ edit: "resume", from })).toEqual({
        kind: "version-gone",
      });
    },
  );

  it("treats a repeated parameter as absent", () => {
    expect(parseResumePageState({ edit: ["resume", "resume"] })).toEqual({
      kind: "view",
    });
    expect(
      parseResumePageState({ edit: "resume", from: ["profile", VERSION_ID] }),
    ).toEqual({ kind: "edit", source: { kind: "current" } });
  });

  it("ignores from on the plain view", () => {
    expect(parseResumePageState({ from: "not-a-uuid" })).toEqual({
      kind: "view",
    });
  });
});
