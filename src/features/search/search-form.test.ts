import { describe, expect, it } from "vitest";

import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import {
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { SEARCH_COPY } from "./copy";
import { SearchForm } from "./search-form";

/**
 * The search form (spec 0013, Decision, AC-2, AC-9).
 *
 * THE `GET` SHAPE IS THE DECISION, NOT A DETAIL. Spec 0013 chose a plain form
 * that navigates to `/search?q=...&where=...` over a Server Action, so that a
 * search is shareable, survives a reload, and reuses spec 0008's already tested
 * deep link path. Switching it to `method="post"` or adding a submit handler
 * would silently undo that decision while the page still appeared to work, so
 * the method and the field names are asserted here.
 */

const render = (props: Parameters<typeof SearchForm>[0] = {}) =>
  renderDeep(SearchForm(props) as never, [Field, Input, FieldError]);

function form(props: Parameters<typeof SearchForm>[0] = {}) {
  return flatten(render(props)).find((element) => element.type === "form");
}

function inputs(props: Parameters<typeof SearchForm>[0] = {}) {
  return flatten(render(props)).filter((element) => element.type === Input);
}

describe("the search form", () => {
  it("navigates by GET to /search, shipping no client JavaScript", () => {
    const props = form()!.props as { method?: string; action?: string };

    expect(props.method).toBe("get");
    expect(props.action).toBe("/search");
  });

  it("names its fields q and where, which is what the URL carries", () => {
    // Rename either and every shared link and the whole deep link path breaks.
    expect(
      inputs().map((input) => (input.props as { name: string }).name),
    ).toEqual(["q", "where"]);
  });

  it("labels both fields with the engineer's copy", () => {
    /**
     * COPY-1 and COPY-2, used verbatim; /develop may not reword them. Read off
     * the `label` prop rather than the rendered text, because `Field` takes the
     * label as a prop and this tree stops at `Field`.
     */
    const labels = flatten(render())
      .filter((element) => element.type === Field)
      .map((element) => (element.props as { label?: string }).label);

    expect(labels).toEqual([SEARCH_COPY.titleLabel, SEARCH_COPY.locationLabel]);
  });

  it("ties each field to its label by id, so the label is real", () => {
    for (const input of inputs()) {
      const props = input.props as { id: string };
      const field = flatten(render()).find(
        (element) =>
          element.type === Field &&
          (element.props as { id?: string }).id === props.id,
      );

      expect(field, `no Field wraps ${props.id}`).toBeDefined();
    }
  });

  it("prefills both fields from what it is given (AC-9)", () => {
    const values = inputs({ title: "data engineer", location: "Boston" }).map(
      (input) => (input.props as { defaultValue?: string }).defaultValue,
    );

    expect(values).toEqual(["data engineer", "Boston"]);
  });

  it("leaves both fields empty when there is nothing to prefill (AC-9)", () => {
    // Blank, never a placeholder standing in for a real stated preference.
    const values = inputs().map(
      (input) => (input.props as { defaultValue?: string }).defaultValue,
    );

    expect(values).toEqual([undefined, undefined]);
  });

  it("bounds each field at the server's own limit", () => {
    // Mirrors the 200 character cap the Zod schema enforces. The browser stops
    // the overrun early; the parse is still the real check.
    for (const input of inputs()) {
      expect((input.props as { maxLength?: number }).maxLength).toBe(200);
    }
  });

  it("marks neither field required, since either one alone is a valid search", () => {
    /**
     * AC-2 is a rule ABOUT THE PAIR: at least one of the two. No single field
     * is required, and marking one `required` would let the browser block a
     * legitimate location only search before it was ever submitted.
     */
    for (const input of inputs()) {
      expect((input.props as { required?: boolean }).required).not.toBe(true);
    }
  });
});

describe("the blank submission message (AC-2)", () => {
  it("shows COPY-3 when both fields were submitted empty", () => {
    expect(textOf(render({ error: SEARCH_COPY.bothFieldsBlank }))).toContain(
      SEARCH_COPY.bothFieldsBlank,
    );
  });

  it("attaches the message to the form, not to either field", () => {
    /**
     * Neither field is individually wrong, so a `FieldError` with no `id` is
     * the right shape: it announces through `role="alert"` without pointing
     * `aria-describedby` at an input that is fine.
     */
    const error = flatten(render({ error: SEARCH_COPY.bothFieldsBlank })).find(
      (element) => element.type === FieldError,
    );

    expect(error).toBeDefined();
    expect((error!.props as { id?: string }).id).toBeUndefined();
  });

  it("shows no message at all on an ordinary render", () => {
    expect(
      flatten(render()).filter((element) => element.type === FieldError),
    ).toHaveLength(0);
  });
});
