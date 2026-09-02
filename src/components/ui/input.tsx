import { FieldError, controlSurface, fieldErrorId } from "./field";

/**
 * The single line text control (spec 0010, AC-17).
 *
 * UNCONTROLLED, WITH `defaultValue` AND NOTHING ELSE. No `value`, no `onChange`:
 * a controlled input would need state, state would need the client boundary in
 * this directory, and `src/components/ui/AGENTS.md` keeps every base component
 * on the server side of it. What the reader typed survives a failed submit
 * because the Server Action returns the submitted values and the form renders
 * them back as defaults, which also works with JavaScript switched off.
 *
 * IT OWNS ITS OWN ERROR, both the sentence and the wiring. See `field.tsx` for
 * why the two are not split across two components.
 */

type InputProps = {
  /** Also the `htmlFor` of the `Field` around it. That pair is the label link. */
  readonly id: string;
  /** The `FormData` key the Server Action reads. */
  readonly name: string;
  /**
   * Deliberately narrow. `number` is absent because every numeric field in this
   * product is parsed and bounded on the server (spec 0010, AC-9 rejects an out
   * of range or over precise amount rather than rounding it), and a `number`
   * input hands the server whatever that browser decided to do with the
   * keystrokes first. `inputMode` gets the phone keypad without that.
   */
  readonly type?: "text" | "email" | "url" | "tel";
  readonly inputMode?: "text" | "decimal" | "numeric";
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly autoComplete?: string;
  /**
   * Mirrors the server's own limit so the browser stops the overrun early. It
   * is never the check: the Zod parse in the action is, because a Server Action
   * is a callable endpoint whatever page renders it.
   */
  readonly maxLength?: number;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /**
   * The message from the last failed submit, or `undefined`. Its presence is
   * what sets `aria-invalid` and `aria-describedby`, so the sentence and the
   * announcement can never disagree.
   */
  readonly error?: string;
  readonly className?: string;
};

/** A single line text control, with its own error state. */
export function Input({
  id,
  name,
  type = "text",
  inputMode,
  defaultValue,
  placeholder,
  autoComplete,
  maxLength,
  required = false,
  disabled = false,
  error,
  className,
}: InputProps) {
  const invalid = error !== undefined;

  return (
    <div className={className}>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        className={controlSurface({ invalid })}
      />
      {invalid ? (
        <FieldError id={fieldErrorId(id)}>{error}</FieldError>
      ) : undefined}
    </div>
  );
}
