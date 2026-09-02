import { describe, expect, it } from "vitest";

import { FieldError, fieldErrorId } from "./field";
import { Select } from "./select";
import {
  findAllByType,
  findByType,
  textOf,
} from "../../../test/helpers/react-element";

/**
 * Spec 0010, AC-17: the closed choice control.
 *
 * It keeps the NATIVE appearance, chevron included, and that is a decision worth
 * a test: spec 0005 AC-11 settles the icon set at five, and drawing a chevron
 * would have widened that inventory on the way past. The native control is also
 * the one that already behaves correctly on a phone, in a forced palette, and
 * with a screen reader.
 */

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
];

function propsOf(rendered: unknown): Record<string, unknown> {
  return (findByType(rendered as never, "select")?.props ?? {}) as Record<
    string,
    unknown
  >;
}

function optionsOf(rendered: unknown) {
  return findAllByType(rendered as never, "option");
}

describe("Select renders the options it is given", () => {
  it("is a real select carrying the id its label points at", () => {
    // covers: AC-17
    const props = propsOf(
      Select({
        id: "experience-started-month",
        name: "started_month",
        options: MONTHS,
      }),
    );

    expect(props.id).toBe("experience-started-month");
    expect(props.name).toBe("started_month");
  });

  it("renders one option per choice, in the order given", () => {
    // covers: AC-7
    const options = optionsOf(Select({ id: "x", name: "x", options: MONTHS }));

    expect(options.map((o) => (o.props as { value: string }).value)).toEqual([
      "1",
      "2",
    ]);
    expect(textOf(options[0])).toBe("January");
  });

  it("invents no options of its own", () => {
    /**
     * The month names, the year bounds and the four remote preference values are
     * all fixed by spec 0010 and by the column's own check constraint, so they
     * live with the feature that owns them. A list built in here would be a
     * second source of truth that starts out agreeing and stops.
     */
    expect(optionsOf(Select({ id: "x", name: "x", options: [] }))).toHaveLength(
      0,
    );
  });
});

describe("Select and the choice a form accepts unset", () => {
  it("adds a leading empty option when given a label for it", () => {
    /**
     * It carries the value `""` rather than no value, so an unset choice arrives
     * at the action as an empty string and is trimmed to absent there, the same
     * as every other optional field.
     */
    // covers: AC-7
    const options = optionsOf(
      Select({
        id: "x",
        name: "ended_month",
        options: MONTHS,
        emptyLabel: "Still there",
      }),
    );

    expect(options).toHaveLength(3);
    expect((options[0]?.props as { value: string }).value).toBe("");
    expect(textOf(options[0])).toBe("Still there");
  });

  it("offers no empty option for a genuinely required choice", () => {
    const options = optionsOf(Select({ id: "x", name: "x", options: MONTHS }));

    expect(
      options.every((o) => (o.props as { value: string }).value !== ""),
    ).toBe(true);
  });
});

describe("Select carrying an error", () => {
  const rendered = Select({
    id: "preferences-remote",
    name: "remote_preference",
    options: MONTHS,
    error: "Choose one of the four options.",
  });

  it("shows the sentence and marks itself invalid from the same one prop", () => {
    // covers: AC-12, AC-17
    expect(propsOf(rendered)["aria-invalid"]).toBe(true);
    expect(
      (findByType(rendered as never, FieldError)?.props as { children: string })
        .children,
    ).toBe("Choose one of the four options.");
  });

  it("points aria-describedby at the message it rendered", () => {
    // covers: AC-17
    expect(propsOf(rendered)["aria-describedby"]).toBe(
      fieldErrorId("preferences-remote"),
    );
  });

  it("describes nothing when there is no error", () => {
    const clean = Select({ id: "x", name: "x", options: MONTHS });

    expect(propsOf(clean)["aria-invalid"]).toBe(false);
    expect(propsOf(clean)["aria-describedby"]).toBeUndefined();
    expect(findByType(clean as never, FieldError)).toBeUndefined();
  });
});

describe("Select stays uncontrolled", () => {
  it("takes defaultValue and no value or handler", () => {
    const props = propsOf(
      Select({ id: "x", name: "x", options: MONTHS, defaultValue: "2" }),
    );

    expect(props.defaultValue).toBe("2");
    expect(props.value).toBeUndefined();
    expect(props.onChange).toBeUndefined();
  });

  it("can be disabled and required", () => {
    const props = propsOf(
      Select({
        id: "x",
        name: "x",
        options: MONTHS,
        disabled: true,
        required: true,
      }),
    );

    expect(props.disabled).toBe(true);
    expect(props.required).toBe(true);
  });
});
