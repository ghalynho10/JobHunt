// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SkillsForm } from "./skills-form";

/**
 * `SkillsForm`'s wiring of its chip field (spec 0023, AC-3, AC-6).
 *
 * The counterpart to `preferences-form.dom.test.tsx`: skills carry the shared
 * character limit but no count cap, so this pins that the form never passes
 * one, and that the field submits under `skills`, the key `saveSkills` reads.
 * The Server Action is replaced at the module boundary for the same reason
 * that file gives.
 */
vi.mock("./actions", () => ({
  saveSkills: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const unmounts: (() => void)[] = [];

afterEach(() => {
  while (unmounts.length > 0) unmounts.pop()?.();
});

function mountForm(skills: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<SkillsForm skills={skills} />);
  });
  unmounts.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  return container;
}

function commit(container: HTMLElement, value: string) {
  const entry = container.querySelector("#skills-list") as HTMLInputElement;
  entry.value = value;
  act(() => {
    entry.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function submitted(container: HTMLElement): readonly string[] {
  const form = container.querySelector("form") as HTMLFormElement;
  return new FormData(form).getAll("skills").map(String);
}

describe("the skills field", () => {
  it("labels the chip entry box, so the label reaches the control a reader types in", () => {
    const container = mountForm("");

    expect(
      container.querySelector('label[for="skills-list"]')?.textContent,
    ).toContain("Skills");
    expect(container.querySelector("#skills-list")?.tagName).toBe("INPUT");
  });

  it("submits once, newline joined, under the key saveSkills reads (AC-3)", () => {
    const container = mountForm("Rust\nTypeScript");

    commit(container, "Chicago, IL style value");

    expect(submitted(container)).toEqual([
      "Rust\nTypeScript\nChicago, IL style value",
    ]);
  });

  it("carries no count cap, accepting a 51st skill (AC-6)", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => `Skill ${i + 1}`);
    const container = mountForm(fifty.join("\n"));

    commit(container, "Skill 51");

    expect(String(submitted(container)[0]).split("\n")).toHaveLength(51);
    expect(container.textContent).not.toContain("Add at most");
  });
});
