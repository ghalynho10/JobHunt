import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  IDLE_STATE,
  failedState,
  failedStateWithMessage,
  fieldErrors,
  submittedValues,
} from "./form-state";

/**
 * Spec 0010, AC-12: a failed submit shows a message next to the field and keeps
 * what the reader typed.
 *
 * WHY ECHOING THE VALUES BACK IS A REAL BEHAVIOUR AND NOT A DETAIL. With
 * JavaScript on, the browser keeps an uncontrolled input's value across a failed
 * submit on its own, so a test that only ever exercised that path would pass
 * with this whole mechanism deleted. With JavaScript off the form is rendered
 * fresh by the server, and the action's return value is the only thing that can
 * put the values back. These tests cover the half the browser does not do.
 */

function formDataOf(entries: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(entries)) data.append(key, value);

  return data;
}

describe("the state a form starts in", () => {
  it("carries no message and no values, so nothing renders before a submit", () => {
    expect(IDLE_STATE).toEqual({ status: "idle", errors: {}, values: {} });
  });
});

describe("what comes back to the form after a failure", () => {
  it("echoes every submitted field so the form can render it again", () => {
    // covers: AC-12
    const values = submittedValues(
      formDataOf({ full_name: "Ada", location: "Berlin", summary: "" }),
    );

    expect(values).toEqual({
      full_name: "Ada",
      location: "Berlin",
      summary: "",
    });
  });

  it("drops React's own action fields rather than sending them back to the page", () => {
    /**
     * React puts its wiring in the same `FormData`. Echoing it into the state
     * would send the action's internal identity across the boundary and render
     * it back into the HTML, which is neither useful nor anybody's business.
     */
    const values = submittedValues(
      formDataOf({
        $ACTION_REF_1: "",
        "$ACTION_2:0": '{"id":"abc"}',
        $ACTION_KEY: "k1",
        full_name: "Ada",
      }),
    );

    expect(values).toEqual({ full_name: "Ada" });
  });

  it("drops a file entry instead of coercing it into text", () => {
    /**
     * `FormData.get` returns `string | File`, and `String(file)` would put
     * `[object File]` into a text input. No profile form has a file field, so
     * dropping it is the honest handling of a value that should not be there.
     */
    const data = formDataOf({ full_name: "Ada" });

    data.append("avatar", new File(["x"], "avatar.png"));

    expect(submittedValues(data)).toEqual({ full_name: "Ada" });
  });

  it("keeps a value the reader typed even when it is what failed", () => {
    /**
     * The behaviour AC-3 asks for in terms: a submission that fails keeps the
     * values in place. Blanking the offending field would make the reader retype
     * the thing they need to look at to fix it.
     */
    // covers: AC-3, AC-12
    const state = failedStateWithMessage(
      formDataOf({ full_name: "   ", location: "Berlin" }),
      "Your session has ended.",
    );

    expect(state.values.full_name).toBe("   ");
    expect(state.values.location).toBe("Berlin");
    expect(state.status).toBe("failed");
  });
});

describe("turning a parse failure into per field messages", () => {
  const schema = z.object({
    full_name: z.string().min(1, "Enter your name."),
    summary: z.string().max(3, "Too long."),
  });

  it("keys each message by the field it belongs beside", () => {
    // covers: AC-12
    const parsed = schema.safeParse({ full_name: "", summary: "abcd" });

    expect(fieldErrors(parsed.error!)).toEqual({
      full_name: "Enter your name.",
      summary: "Too long.",
    });
  });

  it("shows one message per field when a field breaks two rules", () => {
    /**
     * A stack of sentences under one input reads as noise, and the second rule
     * is checked again on the next submit anyway. First one wins.
     */
    const twoRules = z.object({
      name: z.string().min(2, "Too short.").regex(/^\d+$/, "Digits only."),
    });
    const parsed = twoRules.safeParse({ name: "a" });
    const errors = fieldErrors(parsed.error!);

    expect(Object.keys(errors)).toEqual(["name"]);
    expect(errors.name).toBe("Too short.");
  });

  it("reads the path a cross field rule reports on, not just the top level", () => {
    /**
     * The pay pair and the ended month and year rules are `superRefine` checks
     * whose `path` names the field the message belongs beside. If this walked
     * only the schema's own keys, those messages would land nowhere and the
     * reader would see a form that refused with no explanation.
     */
    // covers: AC-9
    const paired = z
      .object({ amount: z.string(), currency: z.string() })
      .superRefine((value, ctx) => {
        if (value.amount !== "" && value.currency === "") {
          ctx.addIssue({
            code: "custom",
            path: ["currency"],
            message: "Add the currency this amount is in.",
          });
        }
      });
    const parsed = paired.safeParse({ amount: "10", currency: "" });

    expect(fieldErrors(parsed.error!)).toEqual({
      currency: "Add the currency this amount is in.",
    });
  });

  it("carries the whole form sentence alongside the field messages", () => {
    /**
     * Both halves are shown: the per field messages say what to change, and the
     * form level sentence says nothing was saved, which no field message states.
     */
    // covers: AC-12
    const parsed = schema.safeParse({ full_name: "", summary: "ok" });
    const state = failedState(
      formDataOf({ full_name: "", summary: "ok" }),
      parsed.error!,
      "Nothing was saved. Check the fields marked below.",
    );

    expect(state.message).toBe(
      "Nothing was saved. Check the fields marked below.",
    );
    expect(state.errors.full_name).toBe("Enter your name.");
    expect(state.values.summary).toBe("ok");
  });
});
