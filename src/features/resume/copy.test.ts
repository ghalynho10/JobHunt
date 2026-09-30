import { describe, expect, it } from "vitest";

import {
  BLANK_CONTENT,
  CONTROLS,
  CURRENT_VERSION_LABEL,
  EDITOR_HINT,
  EDITOR_LABEL,
  EMPTY_STATE,
  LEAVE_WITHOUT_SAVING_CONFIRM,
  PAGE_HEADING,
  READ_FAILURES,
  RESUME_CARD_EMPTY,
  RESUME_CARD_LINK,
  SAVE_ANYWAY_LABEL,
  SAVE_FAILURES,
  VERSIONS_HEADING,
  VERSION_GONE,
  conflictMessage,
  restoreAccessibleName,
  resumeCard,
  savedSummary,
  tooLongContent,
  versionRow,
} from "./copy";
import { RESUME_MAX_LENGTH } from "./limits";

/**
 * Spec 0024's `## Copy` table, and the rule it carries.
 *
 * The same shape as `src/features/profile/copy.test.ts`: the strings are the
 * engineer's, used verbatim, so these tests are about the RULES (no forbidden
 * punctuation, no blank slot) plus a character for character check of each
 * sentence, because a paraphrase is exactly the change nobody notices in review.
 */

/** Every slot, flattened, for the rules that apply to all of them. */
const EVERY_SLOT: readonly string[] = [
  EMPTY_STATE,
  ...Object.values(CONTROLS),
  CURRENT_VERSION_LABEL,
  VERSION_GONE,
  conflictMessage(4),
  SAVE_ANYWAY_LABEL,
  LEAVE_WITHOUT_SAVING_CONFIRM,
  BLANK_CONTENT,
  tooLongContent(RESUME_MAX_LENGTH),
  resumeCard(3, "September 30, 2026"),
  RESUME_CARD_EMPTY,
  PAGE_HEADING,
  savedSummary("September 30, 2026", 1),
  savedSummary("September 30, 2026", 3),
  VERSIONS_HEADING,
  versionRow(3, "September 30, 2026"),
  restoreAccessibleName(3),
  EDITOR_LABEL,
  EDITOR_HINT,
  ...Object.values(RESUME_CARD_LINK),
  ...Object.values(READ_FAILURES),
  ...Object.values(SAVE_FAILURES),
];

describe("the punctuation rule spec 0007 set and spec 0024 carries with no carve out", () => {
  it.each(EVERY_SLOT)("uses no em dash, en dash or semicolon in %j", (slot) => {
    expect(slot).not.toMatch(/[—–;]/);
  });

  it.each(EVERY_SLOT)("is not left blank in %j", (slot) => {
    expect(slot.trim().length).toBeGreaterThan(0);
  });

  it("covers all thirty text slots, so a new one cannot skip the guard", () => {
    /**
     * `COPY-1` to `COPY-33` less the three the spec records as holding no text
     * (`COPY-15`, `COPY-24`, `COPY-25`) is thirty. `COPY-16` is listed twice
     * (singular and plural) and `COPY-26` is two strings, so the flattened list
     * is thirty two.
     */
    expect(EVERY_SLOT).toHaveLength(32);
  });
});

describe("the sentences, character for character", () => {
  it("names the empty state and its way forward (COPY-1, COPY-2)", () => {
    // covers: AC-1
    expect(EMPTY_STATE).toBe("You haven't written a resume yet.");
    expect(CONTROLS.startFromProfile).toBe("Start from my profile");
  });

  it("labels every control once (COPY-3, COPY-4, COPY-22, COPY-23)", () => {
    expect(CONTROLS).toEqual({
      startFromProfile: "Start from my profile",
      edit: "Edit",
      restore: "Restore",
      save: "Save",
      cancel: "Cancel",
    });
  });

  it("marks the current version and says a missing one is gone (COPY-5, COPY-6)", () => {
    // covers: AC-6, AC-8
    expect(CURRENT_VERSION_LABEL).toBe("Current");
    expect(VERSION_GONE).toBe("That version is no longer there.");
  });

  it("names the newer version in the conflict message (COPY-7, COPY-8)", () => {
    // covers: AC-9
    expect(conflictMessage(4)).toBe(
      "Someone (likely you, in another tab) saved version 4 while you were editing. Here's what it says now:",
    );
    expect(SAVE_ANYWAY_LABEL).toBe("Save my text as a new version anyway");
  });

  it("asks before Cancel discards unsaved text (COPY-9)", () => {
    // covers: AC-7
    expect(LEAVE_WITHOUT_SAVING_CONFIRM).toBe(
      "Leave without saving? Your changes to this resume will be lost.",
    );
  });

  it("quotes the real ceiling, never a hardcoded number (COPY-10, COPY-11)", () => {
    // covers: AC-3
    expect(BLANK_CONTENT).toBe("Write something before saving your resume.");
    expect(tooLongContent(RESUME_MAX_LENGTH)).toBe(
      "Keep your resume to 20000 characters or fewer.",
    );
    expect(tooLongContent(42)).toBe(
      "Keep your resume to 42 characters or fewer.",
    );
  });

  it("describes the card in both states (COPY-12, COPY-13, COPY-26)", () => {
    // covers: AC-10
    expect(resumeCard(3, "September 30, 2026")).toBe(
      "Resume: version 3, last updated September 30, 2026.",
    );
    expect(RESUME_CARD_EMPTY).toBe("No resume yet.");
    expect(RESUME_CARD_LINK).toEqual({
      existing: "Open your resume",
      empty: "Write your resume",
    });
  });

  it("heads the page and the version list (COPY-14, COPY-17)", () => {
    // covers: AC-1, AC-5, AC-6
    expect(PAGE_HEADING).toBe("Resume");
    expect(VERSIONS_HEADING).toBe("Versions");
  });

  it("counts versions in the singular and the plural (COPY-16)", () => {
    // covers: AC-5
    expect(savedSummary("September 30, 2026", 1)).toBe(
      "Last saved September 30, 2026. 1 version saved.",
    );
    expect(savedSummary("September 30, 2026", 3)).toBe(
      "Last saved September 30, 2026. 3 versions saved.",
    );
  });

  it("names each row and each Restore by its version number (COPY-18, COPY-19)", () => {
    // covers: AC-6
    expect(versionRow(3, "September 30, 2026")).toBe(
      "Version 3, saved September 30, 2026",
    );
    expect(restoreAccessibleName(3)).toBe("Restore version 3");
    /** WCAG 2.5.3: the accessible name contains the visible label. */
    expect(restoreAccessibleName(3)).toContain(CONTROLS.restore);
  });

  it("labels and explains the editor (COPY-20, COPY-21)", () => {
    // covers: AC-2
    expect(EDITOR_LABEL).toBe("Your resume");
    expect(EDITOR_HINT).toBe(
      "Markdown formatting works here. Headings start with ## and bold text is wrapped in **.",
    );
  });

  it("says a read failed, on the page and on the card (COPY-27 to COPY-29)", () => {
    // covers: AC-5, AC-10
    expect(READ_FAILURES).toEqual({
      page: "We couldn't load your resume. Nothing has been lost, and trying again usually works.",
      retry: "Try again",
      card: "We couldn't load your resume just now.",
    });
  });

  it("says why a save was refused, one sentence per kind (COPY-30 to COPY-33)", () => {
    // covers: AC-3
    expect(SAVE_FAILURES).toEqual({
      sessionMissing:
        "Your session has expired, so nothing was saved. Copy your text somewhere safe, then sign in again.",
      profileMissing:
        "We couldn't find your profile, so there is nothing to attach this resume to. Open your profile, save it, then try again.",
      unavailable:
        "We couldn't save your resume just now. Your text is still here, so try again in a moment.",
      unreadable:
        "We couldn't read that save, so nothing was written. Copy your text somewhere safe, then reload this page.",
    });
  });
});
