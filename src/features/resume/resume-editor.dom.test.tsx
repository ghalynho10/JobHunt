// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { ResumeEditor } from "./resume-editor";
import { saveResumeSchema } from "./schemas";

/**
 * The editor's unsaved changes check against a real DOM (spec 0024, AC-7).
 *
 * WHY THIS FILE EXISTS. `/check verify` found on 2026-09-30 that an editor
 * opened on any saved version called itself unsaved before anyone typed:
 * Cancel asked COPY-9 and a clean reload raised `beforeunload`. The browser
 * posts line breaks as `\r\n`, the save stored them that way, and a textarea
 * reopened on that text reports `\n`, so the live value never equalled the
 * baseline. Nothing caught it because this component had no test at all.
 *
 * THE ROUND TRIP IS THE CLAIM, so the text goes through the real save parse
 * before it becomes the editor's baseline, exactly the path a stored version
 * takes back into the editor. A test that handed the editor `\n` text directly
 * would pass against the broken save.
 *
 * THE GUARD IS READ THROUGH `beforeunload`, the one of the two exits jsdom can
 * drive without a Next router. Cancel's `onNavigate` calls the same
 * `hasUnsavedText`, so both guards share this answer by construction. The real
 * prompts themselves stay a browser check in `verify.md`.
 *
 * The same hand rolled `react-dom/client` plus `act` harness as
 * `src/features/profile/chip-field.dom.test.tsx`, no new dependency.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
});

/** The editor, opened on `content` as the page would open it. */
function mountEditor(content: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <ResumeEditor initialContent={content} previousVersionNumber={1} />,
    );
  });

  mounted.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const field = container.querySelector("textarea");
  if (field === null) throw new Error("The editor rendered no textarea.");

  return field;
}

/** Whether leaving now would be held back by the `beforeunload` guard. */
function wouldWarnOnLeave(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/** A saved version, the way it comes back after a real browser posted it. */
function savedFromBrowser(visibleText: string): string {
  return saveResumeSchema.parse({
    content: visibleText.replaceAll("\n", "\r\n"),
    previousVersionNumber: "0",
  }).content;
}

const RESUME = "Jane Doe\n\nChicago, IL\n\n## Skills\n\n- Go\n- Postgres\n";

describe("the unsaved changes check (AC-7)", () => {
  it("calls a saved version clean when nobody has typed", () => {
    // covers: AC-7
    mountEditor(savedFromBrowser(RESUME));

    expect(wouldWarnOnLeave()).toBe(false);
  });

  it("calls it unsaved once the text changes", () => {
    /**
     * The control for the case above: without it, a guard that never warns at
     * all would pass as "clean".
     */
    // covers: AC-7
    const field = mountEditor(savedFromBrowser(RESUME));

    field.value = `${field.value}- Rust\n`;

    expect(wouldWarnOnLeave()).toBe(true);
  });

  it("calls it clean again when the text is put back", () => {
    // covers: AC-7
    const field = mountEditor(savedFromBrowser(RESUME));
    const original = field.value;

    field.value = "something else";
    field.value = original;

    expect(wouldWarnOnLeave()).toBe(false);
  });
});
