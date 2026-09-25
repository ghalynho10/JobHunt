// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreferencesForm } from "./preferences-form";

/**
 * `PreferencesForm`'s wiring of its two chip fields (spec 0023, AC-3, AC-6,
 * AC-12).
 *
 * `chip-field.dom.test.tsx` proves the chip control itself. What it cannot
 * prove is how this form configures it: that both list fields carry the 50
 * value cap (a form that forgot `maxCount` would pass every chip field test),
 * that each submits under its own key, and that the label states the first
 * value prefills search. The same hand rolled `react-dom/client` plus `act`
 * harness, no new dependency (AC-16).
 *
 * THE SERVER ACTION IS REPLACED AT THE MODULE BOUNDARY. `actions.ts` is a
 * `"use server"` module reaching Supabase and Sentry; nothing asserted here
 * submits, so the form only needs something to hand `useActionState`.
 */
vi.mock("./actions", () => ({
  savePreferences: vi.fn(),
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const unmounts: (() => void)[] = [];

afterEach(() => {
  while (unmounts.length > 0) unmounts.pop()?.();
});

function mountForm(desiredTitles: string, desiredLocations: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <PreferencesForm
        desiredTitles={desiredTitles}
        desiredLocations={desiredLocations}
        remotePreference="no_preference"
        minimumPay=""
        minimumPayCurrency=""
      />,
    );
  });
  unmounts.push(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  return container;
}

function commit(container: HTMLElement, id: string, value: string) {
  const entry = container.querySelector(`#${id}`) as HTMLInputElement;
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

/** Fifty distinct values, one per line, the way the page passes stored lists. */
const FIFTY = Array.from({ length: 50 }, (_, i) => `Value ${i + 1}`).join("\n");

describe("the two list fields' labels (AC-12)", () => {
  it.each([
    ["preferences-titles", "Job titles you want"],
    ["preferences-locations", "Locations you want"],
  ])("labels %s as %s, saying the first one prefills search", (id, label) => {
    const container = mountForm("", "");
    const labelElement = container.querySelector(`label[for="${id}"]`);

    expect(labelElement?.textContent).toContain(label);
    expect(labelElement?.textContent).toContain(
      "the first one prefills your search",
    );
    expect(container.querySelector(`#${id}`)?.tagName).toBe("INPUT");
  });
});

describe("the 50 value cap on both list fields (AC-6)", () => {
  it("refuses a 51st desired title", () => {
    const container = mountForm(FIFTY, "");

    commit(container, "preferences-titles", "Staff Engineer");

    expect(container.textContent).toContain("Add at most 50 titles.");
    const form = container.querySelector("form") as HTMLFormElement;
    expect(
      String(new FormData(form).get("desired_titles")).split("\n"),
    ).toHaveLength(50);
  });

  it("refuses a 51st desired location", () => {
    const container = mountForm("", FIFTY);

    commit(container, "preferences-locations", "Chicago, IL");

    expect(container.textContent).toContain("Add at most 50 locations.");
    const form = container.querySelector("form") as HTMLFormElement;
    expect(
      String(new FormData(form).get("desired_locations")).split("\n"),
    ).toHaveLength(50);
  });
});

describe("what the form submits (AC-3)", () => {
  it("sends each list once, newline joined, under its own key and in its stored order", () => {
    const container = mountForm(
      "Staff Engineer\nBackend Engineer",
      "Austin, TX\nRemote",
    );

    commit(container, "preferences-locations", "Chicago, IL");

    const data = new FormData(
      container.querySelector("form") as HTMLFormElement,
    );
    expect(data.getAll("desired_titles")).toEqual([
      "Staff Engineer\nBackend Engineer",
    ]);
    expect(data.getAll("desired_locations")).toEqual([
      "Austin, TX\nRemote\nChicago, IL",
    ]);
  });
});
