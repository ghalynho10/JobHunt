"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

import { saveSkills } from "./actions";
import { ChipField, parseNewlineList } from "./chip-field";
import { CONTROLS } from "./copy";
import { FormMessage } from "./form-message";
import { IDLE_STATE } from "./form-state";

/**
 * The skills edit form (spec 0010, AC-5, AC-6; entry mechanism superseded by
 * spec 0023, AC-1 to AC-6, AC-11, AC-13, AC-14).
 *
 * A CHIP PER SKILL, TYPED AND COMMITTED ONE AT A TIME. The `FormData` contract
 * is unchanged from spec 0010: `ChipField` still submits `skills` as a single
 * newline joined string, so the Server Action's own diff (what was submitted
 * against what is stored) is untouched by this change.
 *
 * THE LINES ARE NOT SORTED HERE. The stored list arrives ordered by lower case
 * name, so the chips render in the order the reader last saw them on the page.
 */

interface SkillsFormProps {
  /** The stored names, already joined one per line. */
  readonly skills: string;
}

export function SkillsForm({ skills }: SkillsFormProps) {
  const [state, formAction, pending] = useActionState(saveSkills, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage message={state.message} />

      <Field id="skills-list" label="Skills">
        <ChipField
          id="skills-list"
          name="skills"
          initialValues={parseNewlineList(state.values.skills ?? skills)}
          noun="skill"
          disabled={pending}
          error={state.errors.skills}
        />
      </Field>

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
