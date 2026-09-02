import { FieldError } from "@/components/ui/field";

/**
 * The whole form sentence a failed save returns, above the fields.
 *
 * ABOVE, NOT BELOW. It is the first thing after the form opens, so a reader who
 * submits and lands back on the same screen meets the reason immediately rather
 * than discovering it under the button they just pressed.
 *
 * IT RENDERS EVEN WHEN THERE ARE FIELD MESSAGES TOO. On a validation failure it
 * says nothing was saved, which is the part no per field message states, and
 * `AGENTS.md` forbids a failure that is not visible.
 *
 * It reuses `FieldError` rather than drawing its own line, so a form level
 * message and a field level one cannot end up looking like different kinds of
 * thing. `FieldError` takes no id here: this message belongs to no single
 * control, and `role="alert"` is what announces it.
 */
export function FormMessage({ message }: { readonly message?: string }) {
  if (message === undefined) return undefined;

  return <FieldError>{message}</FieldError>;
}
