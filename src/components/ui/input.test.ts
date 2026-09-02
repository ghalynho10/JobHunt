import { describe, expect, it } from "vitest";

import { FieldError, fieldErrorId } from "./field";
import { Input } from "./input";
import { findByType, flatten } from "../../../test/helpers/react-element";

/**
 * Spec 0010, AC-17: the single line text control.
 *
 * THE ONE RULE THIS FILE REALLY PROVES. A validation error has two halves that
 * must agree: the sentence a sighted reader sees, and the `aria-invalid` plus
 * `aria-describedby` pair a screen reader is handed. The component takes ONE
 * prop and derives both, so they cannot disagree. Every assertion about `error`
 * below is checking that one prop still drives all three effects, because the
 * tempting refactor is to split them across `Field` and the control, and the
 * failure that causes is invisible: the message looks right and the control
 * announces itself as valid.
 */

/** The `<input>` inside the wrapper the component returns. */
function inputOf(rendered: unknown) {
  return findByType(rendered as never, "input");
}

function propsOf(rendered: unknown): Record<string, unknown> {
  return (inputOf(rendered)?.props ?? {}) as Record<string, unknown>;
}

describe("Input with nothing wrong", () => {
  it("is a real input carrying the id its label points at", () => {
    // covers: AC-17
    const props = propsOf(
      Input({ id: "identity-full-name", name: "full_name" }),
    );

    expect(props.id).toBe("identity-full-name");
    expect(props.name).toBe("full_name");
  });

  it("announces itself as valid and describes nothing", () => {
    const props = propsOf(Input({ id: "x", name: "x" }));

    expect(props["aria-invalid"]).toBe(false);
    expect(props["aria-describedby"]).toBeUndefined();
  });

  it("renders no message when there is nothing to say", () => {
    expect(
      findByType(Input({ id: "x", name: "x" }) as never, FieldError),
    ).toBeUndefined();
  });

  it("defaults to a plain text field", () => {
    expect(propsOf(Input({ id: "x", name: "x" })).type).toBe("text");
  });
});

describe("Input carrying an error", () => {
  const rendered = Input({
    id: "identity-full-name",
    name: "full_name",
    error: "Enter your name.",
  });

  it("shows the sentence", () => {
    // covers: AC-12
    const message = findByType(rendered as never, FieldError);

    expect(message).toBeDefined();
    expect((message?.props as { children: string }).children).toBe(
      "Enter your name.",
    );
  });

  it("marks itself invalid for assistive technology", () => {
    // covers: AC-12, AC-17
    expect(propsOf(rendered)["aria-invalid"]).toBe(true);
  });

  it("points aria-describedby at the message it just rendered", () => {
    /**
     * The link itself, end to end: the id the control points at is the id the
     * message carries. A mismatch here is the silent failure this design exists
     * to prevent.
     */
    // covers: AC-17
    const message = findByType(rendered as never, FieldError);

    expect(propsOf(rendered)["aria-describedby"]).toBe(
      fieldErrorId("identity-full-name"),
    );
    expect((message?.props as { id: string }).id).toBe(
      fieldErrorId("identity-full-name"),
    );
  });

  it("keeps the value the reader typed beside the error", () => {
    /**
     * AC-3: a failed submission keeps what was typed. Blanking the field would
     * make the reader retype the very thing they need to look at.
     */
    // covers: AC-3
    expect(
      propsOf(
        Input({
          id: "x",
          name: "x",
          defaultValue: "   ",
          error: "Enter your name.",
        }),
      ).defaultValue,
    ).toBe("   ");
  });
});

describe("Input stays on the server side of the client boundary", () => {
  it("is uncontrolled, taking defaultValue and no value or handler", () => {
    /**
     * A controlled input needs state, state needs the client boundary, and
     * `src/components/ui/AGENTS.md` keeps every base component off it. What the
     * reader typed survives a failed submit because the action returns the
     * submitted values, which also works with JavaScript switched off.
     */
    const props = propsOf(Input({ id: "x", name: "x", defaultValue: "Ada" }));

    expect(props.defaultValue).toBe("Ada");
    expect(props.value).toBeUndefined();
    expect(props.onChange).toBeUndefined();
  });
});

describe("Input passes the browser's own affordances through", () => {
  it("mirrors the server's cap so the browser stops an overrun early", () => {
    /**
     * Never the check: the Zod parse in the action is, because a Server Action is
     * a callable endpoint whatever page renders it. This is a courtesy to the
     * person typing.
     */
    expect(
      propsOf(Input({ id: "x", name: "x", maxLength: 200 })).maxLength,
    ).toBe(200);
  });

  it("carries required, autoComplete, placeholder and inputMode when given", () => {
    const props = propsOf(
      Input({
        id: "x",
        name: "x",
        required: true,
        autoComplete: "name",
        placeholder: "Berlin",
        inputMode: "decimal",
      }),
    );

    expect(props.required).toBe(true);
    expect(props.autoComplete).toBe("name");
    expect(props.placeholder).toBe("Berlin");
    expect(props.inputMode).toBe("decimal");
  });

  it("is not required unless it is told to be", () => {
    expect(propsOf(Input({ id: "x", name: "x" })).required).toBe(false);
  });

  it("can be disabled, and says so on the element", () => {
    expect(
      propsOf(Input({ id: "x", name: "x", disabled: true })).disabled,
    ).toBe(true);
  });
});

describe("Input renders one control and nothing else", () => {
  it("returns exactly one input element", () => {
    /** A duplicate would submit the same field twice under one label. */
    const inputs = flatten(Input({ id: "x", name: "x" }) as never).filter(
      (element) => element.type === "input",
    );

    expect(inputs).toHaveLength(1);
  });
});
