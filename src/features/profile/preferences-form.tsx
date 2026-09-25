"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";

import { savePreferences } from "./actions";
import { ChipField, parseNewlineList } from "./chip-field";
import { CONTROLS } from "./copy";
import { FormMessage } from "./form-message";
import { IDLE_STATE } from "./form-state";
import { PREFERENCE_LIST_MAX_COUNT } from "./limits";

/**
 * The search preferences form (spec 0010, AC-9, AC-10; the two list fields'
 * entry mechanism superseded by spec 0023, AC-1, AC-6, AC-12).
 *
 * THE TWO LISTS ARE CHIPS, NEVER COMMA SEPARATED. A desired location can
 * itself contain a comma ("Berlin, Germany"), so `ChipField` commits only on
 * Enter and never splits a typed value on one; the `FormData` contract is
 * unchanged from spec 0010, a single newline joined string per field.
 *
 * THE PAY PAIR IS SUBMITTED AS TEXT AND CHECKED ON THE SERVER. The amount is not
 * a `number` input, because AC-9 rejects an over precise or out of range amount
 * rather than rounding it, and a browser's own numeric handling would round or
 * reformat before the server ever saw what was typed.
 */

/**
 * The four values, with the labels a reader sees.
 *
 * The values are `public.job_preference`'s own check constraint, restated here
 * for the control the same way the schema restates them for the parse. Spec 0003
 * recorded that cost in terms when it chose a check constraint over an enum
 * type.
 */
const REMOTE_OPTIONS: readonly SelectOption[] = [
  { value: "no_preference", label: "No preference" },
  { value: "on_site", label: "On site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

interface PreferencesFormProps {
  /** The stored lists, already joined one value per line. */
  readonly desiredTitles: string;
  readonly desiredLocations: string;
  readonly remotePreference: string;
  readonly minimumPay: string;
  readonly minimumPayCurrency: string;
}

export function PreferencesForm({
  desiredTitles,
  desiredLocations,
  remotePreference,
  minimumPay,
  minimumPayCurrency,
}: PreferencesFormProps) {
  const [state, formAction, pending] = useActionState(
    savePreferences,
    IDLE_STATE,
  );

  const value = (name: string, stored: string): string =>
    state.values[name] ?? stored;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage message={state.message} />

      <Field
        id="preferences-titles"
        label={
          <>
            Job titles you want{" "}
            <span className="font-normal text-muted">
              the first one prefills your search
            </span>
          </>
        }
        optional
      >
        <ChipField
          id="preferences-titles"
          name="desired_titles"
          initialValues={parseNewlineList(
            value("desired_titles", desiredTitles),
          )}
          maxCount={PREFERENCE_LIST_MAX_COUNT}
          noun="title"
          disabled={pending}
          error={state.errors.desired_titles}
        />
      </Field>

      <Field
        id="preferences-locations"
        label={
          <>
            Locations you want{" "}
            <span className="font-normal text-muted">
              the first one prefills your search
            </span>
          </>
        }
        optional
      >
        <ChipField
          id="preferences-locations"
          name="desired_locations"
          initialValues={parseNewlineList(
            value("desired_locations", desiredLocations),
          )}
          maxCount={PREFERENCE_LIST_MAX_COUNT}
          noun="location"
          disabled={pending}
          error={state.errors.desired_locations}
        />
      </Field>

      <Field id="preferences-remote" label="Where you want to work">
        <Select
          id="preferences-remote"
          name="remote_preference"
          options={REMOTE_OPTIONS}
          defaultValue={value("remote_preference", remotePreference)}
          error={state.errors.remote_preference}
          required
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="preferences-pay" label="Lowest pay you would take" optional>
          <Input
            id="preferences-pay"
            name="minimum_pay"
            inputMode="decimal"
            defaultValue={value("minimum_pay", minimumPay)}
            error={state.errors.minimum_pay}
          />
        </Field>

        <Field
          id="preferences-currency"
          label={
            <>
              Currency{" "}
              <span className="font-normal text-muted">
                three letters, for example EUR
              </span>
            </>
          }
          optional
        >
          <Input
            id="preferences-currency"
            name="minimum_pay_currency"
            defaultValue={value("minimum_pay_currency", minimumPayCurrency)}
            error={state.errors.minimum_pay_currency}
            maxLength={3}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {CONTROLS.save}
        </Button>
        <Button variant="tertiary" href="/profile">
          {CONTROLS.cancel}
        </Button>
      </div>
    </form>
  );
}
