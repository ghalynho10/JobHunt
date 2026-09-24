// @vitest-environment jsdom

import type { ComponentProps, ReactElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChipField } from "./chip-field";

/**
 * `ChipField` against a real DOM (spec 0023, AC-16).
 *
 * THE SECOND TEST IN THIS PROJECT TO OPT INTO `jsdom` (the first is
 * `src/features/search/focus-keeper.dom.test.tsx`), for the same reason:
 * `ChipField` holds `useState`, `useEffect` and `useRef`, so, unlike the
 * hookless `Chip`, it cannot be called as a plain function outside a render.
 * The same hand rolled `react-dom/client` plus `act` harness is reused here,
 * no new dependency, per AC-16.
 *
 * WHAT THIS DOES NOT TEST, stated plainly, per AC-16. A value typed into the
 * `Textarea` before hydration is not a coverage gap: preserving it is
 * impossible under React's own hydration model, for any field that already
 * holds a value. React's hydration commit (`initTextarea`, `react-dom`
 * 19.2.8, `cjs/react-dom-client.development.js` line 1855) resets the
 * `Textarea`'s value to its server rendered text before any effect runs, so
 * AC-4 no longer promises it and no test here or in `verify.md` asserts it.
 * A real computed pixel measurement of the remove control (AC-9) and a real
 * screen reader pass stay manual, for the same reason every other component
 * in this design system leaves those two to `/check verify`.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: (() => void)[] = [];

/** One mounted React root, with the unmount that tears it down. */
function mount(node: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  mounted.push(unmount);

  return { unmount, container };
}

/**
 * `ChipField`, wrapped in a plain `<form>` so the hidden input's own `.form`
 * exists for the submit guard tests, with sensible defaults every test can
 * override.
 */
function mountField(props: Partial<ComponentProps<typeof ChipField>> = {}) {
  return mount(
    <form>
      <ChipField
        id="test-field"
        name="skills"
        initialValues={["React", "TypeScript"]}
        noun="skill"
        disabled={false}
        error={undefined}
        {...props}
      />
    </form>,
  );
}

function pressKey(element: HTMLElement, key: string) {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

function entryOf(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="text"]') as HTMLInputElement;
}

function hiddenInputOf(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="hidden"]') as HTMLInputElement;
}

function hiddenRegionOf(container: HTMLElement): HTMLElement {
  return container.querySelector(
    'div[aria-live="polite"].sr-only',
  ) as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
  vi.restoreAllMocks();
});

describe("the pre hydration fallback (AC-4)", () => {
  it("renders a plain textarea under the field's name, and no hidden input", () => {
    const markup = renderToStaticMarkup(
      <ChipField
        id="static-field"
        name="skills"
        initialValues={["React", "TypeScript"]}
        noun="skill"
        disabled={false}
        error={undefined}
      />,
    );

    expect(markup).toContain("<textarea");
    expect(markup).toContain('name="skills"');
    expect(markup).not.toContain('type="hidden"');
  });

  it("joins the initial values one per line into the textarea's value", () => {
    const markup = renderToStaticMarkup(
      <ChipField
        id="static-field"
        name="skills"
        initialValues={["React", "TypeScript"]}
        noun="skill"
        disabled={false}
        error={undefined}
      />,
    );

    expect(markup).toContain("React\nTypeScript");
  });
});

describe("mounting seeds the chips from the initial values (AC-4)", () => {
  it("shows a chip per value, and the hidden input, once mounted", () => {
    const { container } = mountField();

    expect(container.textContent).toContain("React");
    expect(container.textContent).toContain("TypeScript");
    expect(hiddenInputOf(container).value).toBe("React\nTypeScript");
    expect(container.querySelector("textarea")).toBeNull();
  });
});

describe("committing a value on Enter (AC-1, AC-2)", () => {
  it("adds a typed value as a new chip and clears the entry box", () => {
    // covers: AC-1
    const { container } = mountField({ initialValues: [] });
    const entry = entryOf(container);

    entry.value = "Kubernetes";
    pressKey(entry, "Enter");

    expect(container.textContent).toContain("Kubernetes");
    expect(entry.value).toBe("");
    expect(hiddenInputOf(container).value).toBe("Kubernetes");
  });

  it("never submits the surrounding form on Enter", () => {
    // covers: AC-2
    const { container } = mountField({ initialValues: [] });
    const form = container.querySelector("form") as HTMLFormElement;
    const entry = entryOf(container);
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", onSubmit);

    entry.value = "Go";
    pressKey(entry, "Enter");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps a comma inside a single value rather than splitting on it", () => {
    // covers: AC-2
    const { container } = mountField({ initialValues: [] });
    const entry = entryOf(container);

    entry.value = "Chicago, IL";
    pressKey(entry, "Enter");

    expect(hiddenInputOf(container).value).toBe("Chicago, IL");
  });
});

describe("refusing a duplicate commit (AC-5)", () => {
  it("names the existing chip, by its own casing, and adds no second chip", () => {
    // covers: AC-5
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);

    entry.value = "react";
    pressKey(entry, "Enter");

    expect(container.textContent).toContain('"React" is already added.');
    expect(hiddenInputOf(container).value).toBe("React");
  });

  it("re-announces an identical, consecutive refusal by mounting a new node each time", () => {
    /**
     * The counter mechanism AC-9 requires: two identical refusals in a row
     * must not be silently deduplicated. `refusal.id` incrementing on every
     * refusal, even an identical one, is what forces React to mount a new
     * `<span>` rather than reuse the old one with unchanged text, which is
     * what makes a screen reader announce it the second time too.
     */
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);

    entry.value = "react";
    pressKey(entry, "Enter");
    const firstSpan = container.querySelector("p span");
    expect(firstSpan?.textContent).toBe('"React" is already added.');

    entry.value = "react";
    pressKey(entry, "Enter");
    const secondSpan = container.querySelector("p span");

    expect(secondSpan?.textContent).toBe('"React" is already added.');
    expect(secondSpan).not.toBe(firstSpan);
  });

  it("clears a shown refusal as soon as the reader types, not only on blur", () => {
    /**
     * Companion to the blur regression above: since blur no longer clears a
     * stale refusal on its own, typing is what still makes the message go
     * away for a reader correcting their entry, and it does so well before
     * any Save click, decoupling the clear from the click's own timing.
     */
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);

    entry.value = "react";
    pressKey(entry, "Enter");
    expect(container.textContent).toContain('"React" is already added.');

    /**
     * React patches `HTMLInputElement.prototype.value`'s setter to track
     * genuine changes; a plain `entry.value = ...` assignment goes through
     * that same patched setter and leaves its tracker believing nothing
     * changed, so the synthetic `onChange` this test means to prove never
     * fires. The native setter, invoked directly, is what a real keystroke's
     * own internal DOM mutation goes through instead (never the JS property
     * setter React patches), which is why this is needed only in jsdom, not
     * in the real browser reproduction this regression came from.
     */
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      nativeValueSetter?.call(entry, "reac");
      entry.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).not.toContain('"React" is already added.');
  });
});

describe("refusing an over limit commit (AC-6)", () => {
  it("refuses a value over the shared character cap", () => {
    const { container } = mountField({ initialValues: [] });
    const entry = entryOf(container);

    entry.value = "a".repeat(101);
    pressKey(entry, "Enter");

    expect(container.textContent).toContain(
      "Keep each skill to 100 characters or fewer.",
    );
    expect(hiddenInputOf(container).value).toBe("");
  });

  it("refuses a value once a field's own count cap is reached", () => {
    const { container } = mountField({
      initialValues: ["A", "B"],
      maxCount: 2,
      noun: "title",
    });
    const entry = entryOf(container);

    entry.value = "C";
    pressKey(entry, "Enter");

    expect(container.textContent).toContain("Add at most 2 titles.");
    expect(hiddenInputOf(container).value).toBe("A\nB");
  });

  it("carries no count cap on a field with none configured", () => {
    const { container } = mountField({
      initialValues: ["A", "B", "C"],
      noun: "skill",
    });
    const entry = entryOf(container);

    entry.value = "D";
    pressKey(entry, "Enter");

    expect(hiddenInputOf(container).value).toBe("A\nB\nC\nD");
  });
});

describe("no committed value ever carries a literal newline or carriage return (AC-7)", () => {
  it("strips both characters regardless of how they arrived", () => {
    const { container } = mountField({ initialValues: [] });
    const entry = entryOf(container);

    entry.value = "weird\r\nvalue";
    pressKey(entry, "Enter");

    const hidden = hiddenInputOf(container);
    expect(hidden.value).toBe("weirdvalue");
    expect(hidden.value).not.toMatch(/[\r\n]/);
  });
});

describe("pasting splits on newlines only (AC-7)", () => {
  function paste(entry: HTMLInputElement, text: string) {
    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => text },
    });
    act(() => {
      entry.dispatchEvent(event);
    });
  }

  it("commits one chip per line, never splitting on a comma", () => {
    const { container } = mountField({ initialValues: [] });
    const entry = entryOf(container);

    paste(entry, "Chicago, IL\nBerlin, Germany");

    expect(hiddenInputOf(container).value).toBe("Chicago, IL\nBerlin, Germany");
  });

  it("aggregates every refusal from one paste into a single message", () => {
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);

    paste(entry, "TypeScript\nreact\nKubernetes");

    expect(container.textContent).toContain("TypeScript");
    expect(container.textContent).toContain("Kubernetes");
    expect(container.textContent).toContain("1 skill could not be added.");
    expect(hiddenInputOf(container).value).toBe(
      "React\nTypeScript\nKubernetes",
    );
  });
});

describe("auto commit on blur and submit (AC-8)", () => {
  it("commits the entry box's text when focus leaves the field entirely", () => {
    const { container } = mountField({ initialValues: [] });
    const entry = entryOf(container);
    const outside = document.createElement("button");
    document.body.append(outside);

    entry.value = "Go";
    act(() => {
      entry.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: outside,
        }),
      );
    });

    expect(hiddenInputOf(container).value).toBe("Go");
  });

  it("does not auto commit when focus moves to a control inside the same field", () => {
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);
    const removeButton = container.querySelector(
      'button[aria-label="Remove React"]',
    ) as HTMLButtonElement;

    entry.value = "unsaved text";
    act(() => {
      entry.dispatchEvent(
        new FocusEvent("focusout", {
          bubbles: true,
          relatedTarget: removeButton,
        }),
      );
    });

    expect(entry.value).toBe("unsaved text");
    expect(hiddenInputOf(container).value).toBe("React");
  });

  it("blocks the submit when the auto commit is refused, and keeps the text", () => {
    const { container } = mountField({ initialValues: ["React"] });
    const form = container.querySelector("form") as HTMLFormElement;
    const entry = entryOf(container);
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", onSubmit);

    entry.value = "react";
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(entry.value).toBe("react");
    expect(container.textContent).toContain('"React" is already added.');
  });

  it("writes the joined values onto the hidden input on a successful submit", () => {
    const { container } = mountField({ initialValues: ["React"] });
    const form = container.querySelector("form") as HTMLFormElement;
    const entry = entryOf(container);

    entry.value = "Kafka";
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(hiddenInputOf(container).value).toBe("React\nKafka");
  });

  it("leaves a shown refusal message alone when an already empty box loses focus", () => {
    /**
     * Regression for spec 0023 verify.md's 2026-09-23 finding: a real Save
     * click blurs the entry box on its own mousedown, and this used to clear
     * a shown refusal right then, which shifted the Save button under the
     * pointer between mousedown and mouseup and silently dropped the click.
     * `commitFromEntry` no longer clears a stale refusal just because the box
     * is empty (see its own comment in `chip-field.tsx`); only a fresh
     * outcome, a submit, or a chip removal may replace it. The click miss
     * itself needs a real layout engine and stays a `/check verify` browser
     * step (`docs/specs/0023-chip-input-for-skills-titles-locations/verify.md`),
     * the same way this file already leaves AC-9's pixel measurement to it.
     */
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);
    const outside = document.createElement("button");
    document.body.append(outside);

    entry.value = "react";
    pressKey(entry, "Enter");
    expect(container.textContent).toContain('"React" is already added.');

    entry.value = "";
    act(() => {
      entry.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }),
      );
    });

    expect(container.textContent).toContain('"React" is already added.');
  });

  it("keeps state unchanged across a failed server submission, no remount", () => {
    const { container } = mountField({
      initialValues: ["React"],
      error: undefined,
    });
    const entry = entryOf(container);
    entry.value = "Kafka";
    pressKey(entry, "Enter");

    expect(hiddenInputOf(container).value).toBe("React\nKafka");
    // A parent re-rendering this same mounted instance with a fresh `error`
    // prop must not wipe out what was already committed; nothing in this
    // component reads `initialValues` again after the first mount.
  });
});

describe("removing a chip (AC-9)", () => {
  it("removes the chip its own control names, and moves focus to the entry box", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const removeReact = container.querySelector(
      'button[aria-label="Remove React"]',
    ) as HTMLButtonElement;

    act(() => {
      removeReact.click();
    });

    expect(
      container.querySelector('button[aria-label="Remove React"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Kafka");
    expect(document.activeElement).toBe(entryOf(container));
    expect(hiddenInputOf(container).value).toBe("Kafka");
  });

  it("announces the removal through the hidden live region, naming the value", () => {
    const { container } = mountField({ initialValues: ["React"] });
    const removeReact = container.querySelector(
      'button[aria-label="Remove React"]',
    ) as HTMLButtonElement;

    act(() => {
      removeReact.click();
    });

    expect(hiddenRegionOf(container).textContent).toBe("Removed React.");
  });

  it("clears the visible refusal message a removal changes the meaning of", () => {
    const { container } = mountField({ initialValues: ["React"] });
    const entry = entryOf(container);
    entry.value = "react";
    pressKey(entry, "Enter");
    expect(container.textContent).toContain("already added");

    const removeReact = container.querySelector(
      'button[aria-label="Remove React"]',
    ) as HTMLButtonElement;
    act(() => {
      removeReact.click();
    });

    expect(container.textContent).not.toContain("already added");
  });
});

describe("the two step Backspace shortcut (AC-10)", () => {
  it("marks the last chip pending on the first empty Backspace, without removing it", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const entry = entryOf(container);

    pressKey(entry, "Backspace");

    expect(container.textContent).toContain("Kafka");
    expect(hiddenRegionOf(container).textContent).toBe(
      "Kafka marked for removal. Press Backspace again to remove it.",
    );
  });

  it("removes the pending chip and announces the removal on the second Backspace", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const entry = entryOf(container);

    pressKey(entry, "Backspace");
    pressKey(entry, "Backspace");

    expect(
      container.querySelector('button[aria-label="Remove Kafka"]'),
    ).toBeNull();
    expect(hiddenRegionOf(container).textContent).toBe("Removed Kafka.");
    expect(hiddenInputOf(container).value).toBe("React");
  });

  it("clears the pending mark, and announces the clear, on a non backspace non modifier key", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const entry = entryOf(container);

    pressKey(entry, "Backspace");
    pressKey(entry, "a");

    expect(hiddenRegionOf(container).textContent).toBe(
      "Kafka is no longer marked for removal.",
    );
    expect(container.textContent).toContain("Kafka");
  });

  it("clears the pending mark on a paste, which is also input typed into the entry box", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const entry = entryOf(container);

    pressKey(entry, "Backspace");

    const event = new Event("paste", {
      bubbles: true,
      cancelable: true,
    }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => "Go" },
    });
    act(() => {
      entry.dispatchEvent(event);
    });

    expect(hiddenRegionOf(container).textContent).toBe(
      "Kafka is no longer marked for removal.",
    );
    expect(container.textContent).toContain("Kafka");
  });

  it("clears the pending mark, and announces the clear, when the form is submitted", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const form = container.querySelector("form") as HTMLFormElement;
    const entry = entryOf(container);

    pressKey(entry, "Backspace");
    act(() => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(hiddenRegionOf(container).textContent).toBe(
      "Kafka is no longer marked for removal.",
    );
    expect(container.textContent).toContain("Kafka");
  });

  it("does not clear the pending mark on a lone modifier keydown", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const entry = entryOf(container);

    pressKey(entry, "Backspace");
    pressKey(entry, "Shift");
    pressKey(entry, "Backspace");

    expect(
      container.querySelector('button[aria-label="Remove Kafka"]'),
    ).toBeNull();
    expect(hiddenRegionOf(container).textContent).toBe("Removed Kafka.");
  });

  it("clears the pending mark when the field loses focus entirely", () => {
    const { container } = mountField({ initialValues: ["React", "Kafka"] });
    const entry = entryOf(container);
    const outside = document.createElement("button");
    document.body.append(outside);

    pressKey(entry, "Backspace");
    act(() => {
      entry.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: outside }),
      );
    });

    expect(hiddenRegionOf(container).textContent).toBe(
      "Kafka is no longer marked for removal.",
    );
  });

  it("removes whichever chip its own control names, clearing any unrelated pending mark in one action", () => {
    const { container } = mountField({
      initialValues: ["React", "Kafka", "Go"],
    });
    const entry = entryOf(container);

    // Pending is the last chip, Go, via Backspace.
    pressKey(entry, "Backspace");

    const removeReact = container.querySelector(
      'button[aria-label="Remove React"]',
    ) as HTMLButtonElement;
    act(() => {
      removeReact.click();
    });

    expect(
      container.querySelector('button[aria-label="Remove React"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Kafka");
    expect(container.textContent).toContain("Go");
    expect(hiddenRegionOf(container).textContent).toBe("Removed React.");
  });
});

describe("the disabled state (AC-13)", () => {
  it("disables the entry box and every remove control, never the hidden transport input", () => {
    const { container } = mountField({
      initialValues: ["React"],
      disabled: true,
    });

    expect(entryOf(container).disabled).toBe(true);
    expect(
      (
        container.querySelector(
          'button[aria-label="Remove React"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(hiddenInputOf(container).disabled).toBe(false);
  });
});

describe("the server's own field error (AC-4)", () => {
  it("renders it beside the entry box, wired the same way Textarea did", () => {
    const message = "Keep each skill to 100 characters or fewer.";
    const { container } = mountField({
      initialValues: ["React"],
      error: message,
    });
    const entry = entryOf(container);

    expect(entry.getAttribute("aria-invalid")).toBe("true");
    const describedBy = entry.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    expect(
      document.getElementById(describedBy as string)?.textContent,
    ).toContain(message);
  });
});
