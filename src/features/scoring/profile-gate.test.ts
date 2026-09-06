import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@/lib/result";

const readOwnProfile = vi.hoisted(() => vi.fn());
const readProfileSections = vi.hoisted(() => vi.fn());

vi.mock("@/features/profile/queries", () => ({
  readOwnProfile,
  readProfileSections,
}));

const { readScoringProfile } = await import("./profile-gate");

/**
 * The AC-7 gate: who gets scored, and who is told to fill their profile in
 * (spec 0015).
 *
 * THE TWO PROFILE READS ARE REPLACED AT THE MODULE BOUNDARY. Their real
 * behaviour against real rows and real policies is spec 0010's own, proved in
 * that feature's integration tests. What is under test here is the DECISION
 * this feature layers on top of them, which is pure branching over three
 * shapes and needs no database to be wrong.
 *
 * THE SHAPE THAT MATTERS MOST IS THE THREE WAY SPLIT. Collapsing "could not
 * read the profile" into "the profile is empty" would tell somebody with a
 * full profile to go and fill it in, during a database outage, and nothing
 * about the resulting screen would look wrong.
 */

const profile = success({
  id: "p",
  full_name: "A",
  location: undefined,
  summary: "s",
});

const sections = (skills: number, experience: number) =>
  success({
    skills: Array.from({ length: skills }, (_unused, index) => ({
      id: `s${index}`,
      name: `Skill ${index}`,
    })),
    experience: Array.from({ length: experience }, (_unused, index) => ({
      id: `e${index}`,
      company: "Acme",
      title: "Engineer",
      location: undefined,
      description: undefined,
      started_on: "2020-01-01",
      ended_on: undefined,
    })),
    preferences: undefined,
  });

beforeEach(() => {
  vi.clearAllMocks();
  readOwnProfile.mockResolvedValue(profile);
});

describe("a profile with nothing to score against (AC-7)", () => {
  it("refuses to score when there are no skills AND no work history", async () => {
    readProfileSections.mockResolvedValue(sections(0, 0));

    expect(await readScoringProfile()).toEqual({ kind: "thin" });
  });

  it("treats a missing profile row as thin, not as an outage", async () => {
    /**
     * No row at all IS zero skills and zero work history. `readOwnProfile()`
     * reports it as an EXPECTED failure rather than a broken database, and the
     * reader needs the same "go and fill this in" sentence either way.
     */
    readOwnProfile.mockResolvedValue(
      failure({
        kind: "record_not_found",
        severity: "expected",
        message: "no profile row",
      }),
    );

    expect(await readScoringProfile()).toEqual({ kind: "thin" });
    expect(readProfileSections).not.toHaveBeenCalled();
  });

  it("spends nothing: it never even reads the sections when there is no row", async () => {
    readOwnProfile.mockResolvedValue(
      failure({
        kind: "record_not_found",
        severity: "expected",
        message: "no profile row",
      }),
    );

    await readScoringProfile();

    expect(readProfileSections).not.toHaveBeenCalled();
  });
});

describe("a profile with either section filled (AC-7)", () => {
  it("scores a profile with skills and no work history", async () => {
    readProfileSections.mockResolvedValue(sections(1, 0));

    const outcome = await readScoringProfile();

    expect(outcome.kind).toBe("score");
  });

  it("scores a profile with work history and no skills", async () => {
    /**
     * THE COUNTERWEIGHT THAT STOPS THE GATE READING AS "BOTH REQUIRED". AC-7
     * says either one on its own is enough, and a gate written with `||` where
     * it meant `&&` would pass every other test in this file.
     */
    readProfileSections.mockResolvedValue(sections(0, 1));

    const outcome = await readScoringProfile();

    expect(outcome.kind).toBe("score");
  });

  it("hands back the bounded profile the prompt will use (AC-13)", async () => {
    readProfileSections.mockResolvedValue(sections(3, 1));

    const outcome = await readScoringProfile();

    expect(outcome.kind === "score" && outcome.profile.skills).toEqual([
      "Skill 0",
      "Skill 1",
      "Skill 2",
    ]);
  });
});

describe("a profile that could not be read", () => {
  it("is unavailable, never thin, when the profile read fails", async () => {
    readOwnProfile.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "down",
      }),
    );

    expect(await readScoringProfile()).toEqual({ kind: "unavailable" });
  });

  it("is unavailable, never thin, when the sections read fails", async () => {
    readProfileSections.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "down",
      }),
    );

    expect(await readScoringProfile()).toEqual({ kind: "unavailable" });
  });
});
