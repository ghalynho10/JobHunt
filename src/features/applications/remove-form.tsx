"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Text } from "@/components/ui/text";

import { removeApplication } from "./actions";
import { CONTROLS, removeConfirmation } from "./copy";
import { IDLE_STATE } from "./form-state";

/**
 * The confirmation step before an application is removed (spec 0014, AC-11).
 *
 * THE CONFIRMATION URL MUTATES NOTHING. Reaching `/applications?remove=<id>`
 * only renders this form, which is what keeps that link safe to prefetch,
 * bookmark or send to somebody. The removal happens on this form's own POST and
 * nowhere else, so a later change must not turn the link itself into the
 * action. This is spec 0010 AC-8's shape, reused rather than reinvented.
 *
 * WHY IT IS CONFIRMED AT ALL. Removing an application destroys the only
 * surviving copy of a posting that may already have been taken down, and WCAG
 * 2.2 criterion 3.3.4 (Error Prevention, legal, financial and data) asks for a
 * deletion of user controllable data to be reversible, checked, or confirmed.
 * This app's stated bar is AA, so a single click removal would fail it.
 *
 * THE JOB IS NAMED IN THE QUESTION, per `COPY-4`. A bare "are you sure" beside
 * a list of applications does not tell anybody which one is about to go.
 */
export function RemoveForm({
  applicationId,
  title,
  companyName,
}: {
  readonly applicationId: string;
  readonly title: string;
  readonly companyName: string;
}) {
  const [state, formAction, pending] = useActionState(
    removeApplication,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.status === "failed" && state.message !== undefined ? (
        <FieldError>{state.message}</FieldError>
      ) : undefined}

      <input type="hidden" name="application_id" value={applicationId} />

      {/* `COPY-4`, the engineer's, used verbatim. */}
      <Text>{removeConfirmation(title, companyName)}</Text>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {CONTROLS.remove}
        </Button>
        <Button variant="tertiary" href="/applications">
          {CONTROLS.cancel}
        </Button>
      </div>
    </form>
  );
}
