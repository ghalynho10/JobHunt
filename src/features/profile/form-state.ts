import { z } from "zod";

/**
 * The shape every profile Server Action returns to its form (spec 0010, AC-12).
 *
 * IT CARRIES WHAT THE USER TYPED, and that is not a convenience. A failed
 * submit must keep the values in place (AC-3, AC-12), and with JavaScript
 * switched off the form is re-rendered from scratch on the server, so the only
 * thing that can put the values back is the action's own return value. The
 * browser holding an uncontrolled input's value covers the JavaScript path
 * only, and covering one of two paths is the kind of half fix that looks
 * finished.
 *
 * NOTHING IS RETURNED ON SUCCESS. Every action ends in `redirect()`, so a
 * success branch here would be a state nothing can ever render.
 *
 * Every field is a plain string because that is what `FormData` holds. Keeping
 * it that way means the state crosses the server to client boundary as data
 * with no reviver, and the form renders the exact characters that were
 * submitted rather than a re-serialised version of them.
 */
export interface ActionState {
  /** `idle` is the initial state, before any submit. */
  readonly status: "idle" | "failed";
  /**
   * A whole form sentence, for a failure that is not about one field: no
   * session, no profile row yet, the database unreachable. `undefined` when
   * every message belongs to a field.
   */
  readonly message?: string;
  /** One message per field name, keyed by the `FormData` key. */
  readonly errors: Readonly<Record<string, string>>;
  /** What was submitted, echoed back so the form can render it again. */
  readonly values: Readonly<Record<string, string>>;
}

/** The state a form starts in, before anything has been submitted. */
export const IDLE_STATE: ActionState = {
  status: "idle",
  errors: {},
  values: {},
};

/**
 * Every string entry of a `FormData`, for echoing back on failure.
 *
 * FILE ENTRIES ARE DROPPED RATHER THAN COERCED. `FormData.get` returns
 * `string | File`, and `String(file)` would put `[object File]` into a text
 * input. No profile form has a file field today, so dropping is the honest
 * handling of a value that should not be there at all.
 *
 * THE `$ACTION_` KEYS ARE DROPPED TOO. React puts its own fields in the same
 * `FormData`, and echoing them back into the state would send the action's
 * internal wiring across the boundary and into the rendered HTML.
 */
export function submittedValues(
  formData: FormData,
): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string") continue;

    values[key] = value;
  }

  return values;
}

/**
 * A Zod error as one message per field.
 *
 * IT WALKS `issues` RATHER THAN CALLING `z.flattenError`, because the cross
 * field rules in this feature are `superRefine` checks whose `path` names the
 * field the message belongs beside (an ended month with no ended year reports on
 * the year). `flattenError` reads the same paths, but only the first segment of
 * each, and these schemas are flat, so walking the issues directly is the same
 * result with the nesting assumption written down instead of implied.
 *
 * THE FIRST MESSAGE PER FIELD WINS. A field with two failing rules shows one
 * sentence, because a stack of messages under one input is read as noise and
 * the second rule is checked again on the next submit anyway.
 */
export function fieldErrors(
  error: z.ZodError,
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const [field] = issue.path;

    if (typeof field !== "string") continue;
    if (field in errors) continue;

    errors[field] = issue.message;
  }

  return errors;
}

/**
 * A failed state carrying per field messages and the values to render back.
 *
 * @param formData The submitted form, echoed back into `values`.
 * @param error The parse failure the messages come from.
 * @param message The whole form sentence, when the failure has one.
 */
export function failedState(
  formData: FormData,
  error: z.ZodError,
  message: string,
): ActionState {
  return {
    status: "failed",
    message,
    errors: fieldErrors(error),
    values: submittedValues(formData),
  };
}

/**
 * A failed state with no per field messages: the caller has no session, the
 * profile row is missing, the database is unreachable.
 */
export function failedStateWithMessage(
  formData: FormData,
  message: string,
): ActionState {
  return {
    status: "failed",
    message,
    errors: {},
    values: submittedValues(formData),
  };
}
