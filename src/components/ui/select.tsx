import { FieldError, controlSurface, fieldErrorId } from "./field";

/**
 * The closed choice control (spec 0010, AC-17).
 *
 * IT KEEPS THE NATIVE APPEARANCE, chevron included. Resetting `appearance` and
 * drawing a chevron would mean a sixth icon, and spec 0005 AC-11 settles the
 * icon set at five: this feature was authorised to add four base components,
 * not to widen the icon inventory on the way past. The native control is also
 * the one that already behaves correctly on a phone, in a forced palette, and
 * with a screen reader, none of which a hand drawn replacement gets for free.
 *
 * EVERY OPTION IS PASSED IN, none is derived here. The month names, the year
 * bounds and the four remote preference values are all fixed by spec 0010 and
 * by `public.job_preference`'s own check constraint, so they live with the
 * feature that owns them and this component never invents a list.
 */

export interface SelectOption {
  /** Submitted verbatim, and parsed against a closed set in the action. */
  readonly value: string;
  readonly label: string;
}

type SelectProps = {
  /** Also the `htmlFor` of the `Field` around it. That pair is the label link. */
  readonly id: string;
  /** The `FormData` key the Server Action reads. */
  readonly name: string;
  readonly options: readonly SelectOption[];
  readonly defaultValue?: string;
  /**
   * The label of a leading empty option, for a field the form accepts unset.
   *
   * It carries the value `""` rather than being an option with no value, so an
   * unset choice arrives at the action as an empty string and is trimmed to
   * absent there, the same as every other optional field. Omit it and the
   * control has no way to say "not set", which is the right shape for a
   * genuinely required choice.
   */
  readonly emptyLabel?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  /**
   * The message from the last failed submit, or `undefined`. Its presence is
   * what sets `aria-invalid` and `aria-describedby`.
   */
  readonly error?: string;
  readonly className?: string;
};

/** A closed choice control, with its own error state. */
export function Select({
  id,
  name,
  options,
  defaultValue,
  emptyLabel,
  required = false,
  disabled = false,
  error,
  className,
}: SelectProps) {
  const invalid = error !== undefined;

  return (
    <div className={className}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={invalid ? fieldErrorId(id) : undefined}
        className={controlSurface({ invalid })}
      >
        {emptyLabel === undefined ? undefined : (
          <option value="">{emptyLabel}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {invalid ? (
        <FieldError id={fieldErrorId(id)}>{error}</FieldError>
      ) : undefined}
    </div>
  );
}
