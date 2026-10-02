// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResumeSaveState } from "./form-state";
import { ResumeEditor } from "./resume-editor";
import { saveResumeSchema } from "./schemas";

/**
 * THE TWO BOUNDARIES REPLACED FOR THE SAVE TESTS, and only those two.
 *
 * `saveResumeVersion` is a Server Action, so from the editor's side it is the
 * network. Replacing it lets a test choose what the server answers (a conflict,
 * or nothing yet) without a running app; the conflict shape it returns is the
 * real `ResumeSaveState` the integration suite proves the action produces.
 *
 * `next/link` needs an app router this environment does not have, which is why
 * the first tests here read the guard through `beforeunload`. The stand in is
 * an anchor that calls `onNavigate` exactly the way Link does, before any
 * transition, and records whether the reader would have left. The handler
 * under test is the editor's own, unchanged.
 */
const server = vi.hoisted(() => ({ save: vi.fn() }));

vi.mock("./actions", () => ({ saveResumeVersion: server.save }));

const links = vi.hoisted(() => ({ followed: [] as string[] }));

vi.mock("next/link", () => ({
  default: ({
    href,
    onNavigate,
    children,
    className,
  }: {
    readonly href: string;
    readonly onNavigate?: (event: { preventDefault: () => void }) => void;
    readonly children: ReactNode;
    readonly className?: string;
  }) => (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        const transition = { refused: false };
        onNavigate?.({
          preventDefault: () => {
            transition.refused = true;
          },
        });
        if (!transition.refused) links.followed.push(href);
      }}
    >
      {children}
    </a>
  ),
}));

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

/** Submits the editor's own form, the way pressing Save does. */
async function save(field: HTMLTextAreaElement) {
  await act(async () => {
    field.form?.requestSubmit();
    await Promise.resolve();
  });
}

/** The Cancel link, found by its visible label. */
function cancelIn(field: HTMLTextAreaElement): HTMLAnchorElement {
  const cancel = [...(field.form?.querySelectorAll("a") ?? [])].find(
    (link) => link.textContent === "Cancel",
  );
  if (cancel === undefined) throw new Error("The editor rendered no Cancel.");
  return cancel;
}

describe("the outcome of pressing Save is announced (AC-9, WCAG 4.1.3)", () => {
  beforeEach(() => {
    server.save.mockReset();
    links.followed.length = 0;
  });

  it("announces a conflict assertively, on its own element, labelling the newer text", async () => {
    /**
     * `role="alert"`, like every other Save outcome in this form, and NOT
     * through `FieldError`: a conflict is not a `Failure` (spec 0024 AC-9 and
     * its rationale). Until `/check review` on 2026-10-02 it was announced to
     * nobody, because the conflict state carries no `message`.
     */
    // covers: AC-9
    const conflict: ResumeSaveState = {
      status: "conflict",
      errors: {},
      values: { content: "# Mine" },
      currentVersionNumber: 4,
      currentVersionContent: "# Theirs",
    };
    server.save.mockResolvedValue(conflict);
    const field = mountEditor("# Mine");

    await save(field);

    const alerts = [...(field.form?.querySelectorAll('[role="alert"]') ?? [])];
    const figure = field.form?.querySelector("figure");

    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "Someone (likely you, in another tab) saved version 4 while you were editing. Here's what it says now:",
    ]);
    expect(figure?.getAttribute("aria-labelledby")).toBe(alerts[0]?.id);
    expect(figure?.textContent).toBe("# Theirs");
  });

  it("does not leave while a save is in flight, and asks nothing", async () => {
    // covers: AC-7
    server.save.mockReturnValue(new Promise(() => undefined));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const field = mountEditor("# Mine");
    field.value = "# Mine, edited";

    await save(field);
    await act(async () => {
      cancelIn(field).click();
      await Promise.resolve();
    });

    expect(links.followed).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("still leaves through Cancel once nothing is in flight", async () => {
    /**
     * The control for the case above, through the same stand in: without it,
     * a stand in that never recorded a departure would pass as "refused".
     */
    // covers: AC-7
    mountEditor("# Mine");
    const field = document.querySelector("textarea");
    if (field === null) throw new Error("No editor.");

    await act(async () => {
      cancelIn(field).click();
      await Promise.resolve();
    });

    expect(links.followed).toEqual(["/resume"]);
  });
});
