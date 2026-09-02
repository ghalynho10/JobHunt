"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { deleteWorkExperience } from "./actions";
import { CONTROLS, deleteConfirmation } from "./copy";
import { FormMessage } from "./form-message";
import { IDLE_STATE } from "./form-state";

/**
 * The confirmation step before a work history entry is removed (spec 0010,
 * AC-8).
 *
 * THE CONFIRMATION URL MUTATES NOTHING (invariant 7). Reaching
 * `?delete=experience&entry=<id>` only renders this form, which is what keeps
 * that link safe to prefetch, bookmark or send to somebody. The delete happens
 * on this form's own POST and nowhere else, so a later change must not turn the
 * link itself into the action.
 *
 * THE ENTRY IS NAMED IN THE QUESTION, per `COPY-5`. A bare "are you sure" beside
 * a list of five roles does not tell anybody which one is about to go.
 */

interface DeleteExperienceFormProps {
  readonly entryId: string;
  readonly title: string;
  readonly company: string;
}

export function DeleteExperienceForm({
  entryId,
  title,
  company,
}: DeleteExperienceFormProps) {
  const [state, formAction, pending] = useActionState(
    deleteWorkExperience,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage message={state.message} />

      <input type="hidden" name="entry_id" value={entryId} />

      {/* `COPY-5`, the engineer's, used verbatim. */}
      <Text>{deleteConfirmation(title, company)}</Text>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {CONTROLS.remove}
        </Button>
        <Button variant="tertiary" href="/profile">
          {CONTROLS.cancel}
        </Button>
      </div>
    </form>
  );
}
