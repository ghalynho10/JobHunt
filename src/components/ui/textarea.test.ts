import { describe, expect, it } from "vitest";

import { FieldError, fieldErrorId } from "./field";
import { Textarea } from "./textarea";
import { findByType } from "../../../test/helpers/react-element";

/**
 * Spec 0010, AC-17: the multi line text control.
 *
 * It carries the product's two newline separated list fields as well as its
 * prose ones, so the assertions here are as much about what it does NOT impose
 * (a character cap that would silently be the wrong rule for a list) as about
 * what it renders.
 */

function propsOf(rendered: unknown): Record<string, unknown> {
  return (findByType(rendered as never, "textarea")?.props ?? {}) as Record<
    string,
    unknown
  >;
}

describe("Textarea with nothing wrong", () => {
  it("is a real textarea carrying the id its label points at", () => {
    // covers: AC-17
    const props = propsOf(Textarea({ id: "skills-list", name: "skills" }));

    expect(props.id).toBe("skills-list");
    expect(props.name).toBe("skills");
    expect(props["aria-invalid"]).toBe(false);
    expect(props["aria-describedby"]).toBeUndefined();
  });

  it("opens tall enough to read, and can be made taller", () => {
    expect(propsOf(Textarea({ id: "x", name: "x" })).rows).toBe(4);
    expect(propsOf(Textarea({ id: "x", name: "x", rows: 8 })).rows).toBe(8);
  });
});

describe("Textarea carrying an error", () => {
  const rendered = Textarea({
    id: "skills-list",
    name: "skills",
    error: "Keep each skill to 100 characters or fewer.",
  });

  it("shows the sentence and marks itself invalid from the same one prop", () => {
    // covers: AC-12, AC-17
    expect(propsOf(rendered)["aria-invalid"]).toBe(true);
    expect(
      (findByType(rendered as never, FieldError)?.props as { children: string })
        .children,
    ).toBe("Keep each skill to 100 characters or fewer.");
  });

  it("points aria-describedby at the message it rendered", () => {
    // covers: AC-17
    const message = findByType(rendered as never, FieldError);

    expect(propsOf(rendered)["aria-describedby"]).toBe(
      fieldErrorId("skills-list"),
    );
    expect((message?.props as { id: string }).id).toBe(
      fieldErrorId("skills-list"),
    );
  });

  it("keeps the newline separated list the reader typed", () => {
    /**
     * The value is the whole box, newlines included. Losing them on a failed
     * submit would silently collapse a reader's skill list into one line.
     */
    // covers: AC-3, AC-12
    expect(
      propsOf(
        Textarea({
          id: "x",
          name: "x",
          defaultValue: "Go\nRust\n",
          error: "no",
        }),
      ).defaultValue,
    ).toBe("Go\nRust\n");
  });
});

describe("Textarea leaves the list rules to the server", () => {
  it("imposes no character cap unless one is given", () => {
    /**
     * The list fields' limits are per line and per list (AC-6, AC-9), not per
     * box. A single character cap here would be a DIFFERENT rule wearing the
     * same name, and it would cut a valid list off mid word.
     */
    // covers: AC-6, AC-9
    expect(propsOf(Textarea({ id: "x", name: "x" })).maxLength).toBeUndefined();
  });

  it("mirrors a prose field's cap when the field genuinely has one", () => {
    expect(
      propsOf(Textarea({ id: "x", name: "x", maxLength: 4000 })).maxLength,
    ).toBe(4000);
  });
});

describe("Textarea stays uncontrolled and resizable", () => {
  it("takes defaultValue and no value or handler", () => {
    const props = propsOf(
      Textarea({ id: "x", name: "x", defaultValue: "text" }),
    );

    expect(props.defaultValue).toBe("text");
    expect(props.value).toBeUndefined();
    expect(props.onChange).toBeUndefined();
  });

  it("lets the reader make the box bigger", () => {
    /**
     * `resize-y`, never `resize-none`: somebody with a long work history is
     * allowed to make the box big enough to read what they wrote.
     */
    expect(propsOf(Textarea({ id: "x", name: "x" })).className).toContain(
      "resize-y",
    );
  });
});
