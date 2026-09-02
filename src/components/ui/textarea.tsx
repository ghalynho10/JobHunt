import { FieldError, controlSurface, fieldErrorId } from "./field";

/**
 * The multi line text control (spec 0010, AC-17).
 *
 * IT CARRIES THE PRODUCT'S TWO LIST FIELDS AS WELL AS ITS PROSE FIELDS. Skills,
 * desired titles and desired locations are all entered one value per line rather
 * than comma separated, because a location can itself contain a comma (spec
 * 0010, AC-9) and a separator that appears inside the values is a parser that
 * quietly loses data. The newline is the separator, so this control is the whole
 * input for those fields and there is no tag or token widget.
 *
 * `resize-y`, never `resize-none`: a reader with a long work history is allowed
 * to make the box big enough to read what they wrote.
 */

type TextareaProps = {
  /** Also the `htmlFor` of the `Field` around it. That pair is the label link. */
  readonly id: string;
  /** The `FormData` key the Server Action reads. */
  readonly name: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  /** The visible height in lines. The box still grows by hand from there. */
  readonly rows?: number;
  /**
   * Mirrors the server's own limit so the browser stops the overrun early. It
   * is never the check: the Zod parse in the action is.
   *
   * Left unset on the newline list fields on purpose. Their limits are per line
   * and per list (spec 0010, AC-6, AC-9), not per box, so a single character
   * cap here would be a different rule wearing the same name.
   */
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /**
   * The message from the last failed submit, or `undefined`. Its presence is
   * what sets `aria-invalid` and `aria-describedby`.
   */
  readonly error?: string;
  readonly className?: string;
};

/** A multi line text control, with its own error state. */
export function Textarea({
  id,
  name,
  defaultValue,
  placeholder,
  rows = 4,
  maxLength,
  required = false,
  disabled = false,
  error,
  className,
}: TextareaProps) {
  const invalid = error !== undefined;

  return (
    <div className={className}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        className={controlSurface({
          invalid,
          class: "resize-y leading-[1.6]",
        })}
      />
      {invalid ? (
        <FieldError id={fieldErrorId(id)}>{error}</FieldError>
      ) : undefined}
    </div>
  );
}
