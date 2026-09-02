"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import { saveSkills } from "./actions";
import { CONTROLS } from "./copy";
import { FormMessage } from "./form-message";
import { IDLE_STATE } from "./form-state";

/**
 * The skills edit form (spec 0010, AC-5, AC-6).
 *
 * ONE TEXTAREA, ONE SKILL PER LINE, saved as a whole. There is no tag widget and
 * no per skill add control, because the diff happens in the action: it compares
 * what was submitted against what is stored and writes only the difference. A
 * per skill control would need a write per keystroke and would still need that
 * same comparison behind it.
 *
 * THE LINES ARE NOT SORTED HERE. The stored list arrives ordered by lower case
 * name, so the box opens in the order the reader last saw it on the page.
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

      <Field
        id="skills-list"
        label={
          <>
            Skills <span className="font-normal text-muted">one per line</span>
          </>
        }
      >
        <Textarea
          id="skills-list"
          name="skills"
          rows={8}
          defaultValue={state.values.skills ?? skills}
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
