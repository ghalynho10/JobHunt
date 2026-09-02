"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { saveIdentity } from "./actions";
import { CONTROLS } from "./copy";
import { FormMessage } from "./form-message";
import { IDLE_STATE } from "./form-state";

/**
 * The identity edit form (spec 0010, AC-1 to AC-4, AC-12).
 *
 * A CLIENT COMPONENT, AND THE FIRST ONE IN THE SIGNED IN TREE. `useActionState`
 * is what puts a per field message next to the field it belongs to (AC-12), and
 * it needs the client boundary. Spec 0010 records this as a deliberate
 * difference from `/` rather than an oversight: spec 0006 AC-4's zero JavaScript
 * contract covers the marketing entry page and never extended to the app.
 *
 * IT STILL WORKS WITH JAVASCRIPT SWITCHED OFF. The form is a real `<form>`
 * posting to a Server Action, so the browser submits it and the server re-renders
 * the page with the returned state. That is also why the action echoes the
 * submitted values back: without them, the no JavaScript path would lose what
 * the reader typed on every failed submit.
 */

interface IdentityFormProps {
  /** The stored values, or `undefined` for a profile that does not exist yet. */
  readonly fullName?: string;
  readonly location?: string;
  readonly summary?: string;
  /**
   * Whether a profile row already exists. It decides only whether the form
   * offers a way out: there is nothing to cancel back to on first run, because
   * the form IS the page (AC-1).
   */
  readonly existing: boolean;
}

export function IdentityForm({
  fullName,
  location,
  summary,
  existing,
}: IdentityFormProps) {
  const [state, formAction, pending] = useActionState(saveIdentity, IDLE_STATE);

  /**
   * The submitted value wins over the stored one, so a failed submit renders
   * exactly what the reader typed rather than reverting them to what was saved
   * before they started (AC-3, AC-12).
   */
  const value = (name: string, stored: string | undefined): string =>
    state.values[name] ?? stored ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage message={state.message} />

      <Field id="identity-full-name" label="Full name">
        <Input
          id="identity-full-name"
          name="full_name"
          defaultValue={value("full_name", fullName)}
          error={state.errors.full_name}
          maxLength={200}
          autoComplete="name"
          required
        />
      </Field>

      <Field id="identity-location" label="Location" optional>
        <Input
          id="identity-location"
          name="location"
          defaultValue={value("location", location)}
          error={state.errors.location}
          maxLength={200}
          autoComplete="address-level2"
        />
      </Field>

      <Field
        id="identity-summary"
        label={
          <>
            Summary{" "}
            <span className="font-normal text-muted">
              what you do, in your own words
            </span>
          </>
        }
        optional
      >
        <Textarea
          id="identity-summary"
          name="summary"
          rows={5}
          defaultValue={value("summary", summary)}
          error={state.errors.summary}
          maxLength={4000}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {CONTROLS.save}
        </Button>
        {existing ? (
          <Button variant="tertiary" href="/profile">
            {CONTROLS.cancel}
          </Button>
        ) : undefined}
      </div>
    </form>
  );
}
