"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { addWorkExperience, updateWorkExperience } from "./actions";
import { MONTH_OPTIONS } from "./calendar";
import { CONTROLS } from "./copy";
import { FormMessage } from "./form-message";
import { IDLE_STATE } from "./form-state";

/**
 * The work history form, for adding one entry or editing one (spec 0010, AC-7,
 * AC-7a, AC-13).
 *
 * ONE COMPONENT, TWO ACTIONS, CHOSEN BY WHETHER THERE IS AN ENTRY ID. The fields
 * are identical, so a second component would be the same markup twice, and the
 * two actions stay separate for the reason spec 0010 gives: an insert refused by
 * a policy's `with check` and an update row level security excludes are
 * different failures and each is handled where it happens.
 *
 * THE ENTRY ID TRAVELS AS A HIDDEN FIELD, not only in the URL. The action parses
 * it again as a uuid and lets row level security resolve it, because a Server
 * Action is a callable endpoint whatever page rendered the form: a spoofed id
 * reaches an update that matches zero rows and is reported as a failure
 * (invariant 4), never as a quiet success.
 *
 * THERE IS NO "CURRENT ROLE" CHECKBOX. Leaving the ended month and year unset is
 * what says the role is current, matching `work_experience` having no
 * `is_current` column: two ways of stating one fact can disagree.
 */

interface ExperienceFormProps {
  /** Present for an edit, absent for an add. It picks the action. */
  readonly entryId?: string;
  readonly company?: string;
  readonly title?: string;
  readonly location?: string;
  readonly description?: string;
  readonly startedMonth?: string;
  readonly startedYear?: string;
  readonly endedMonth?: string;
  readonly endedYear?: string;
  /** Built once on the server, bounded at the current year (AC-7). */
  readonly years: readonly SelectOption[];
}

export function ExperienceForm({
  entryId,
  company,
  title,
  location,
  description,
  startedMonth,
  startedYear,
  endedMonth,
  endedYear,
  years,
}: ExperienceFormProps) {
  const [state, formAction, pending] = useActionState(
    entryId === undefined ? addWorkExperience : updateWorkExperience,
    IDLE_STATE,
  );

  const value = (name: string, stored: string | undefined): string =>
    state.values[name] ?? stored ?? "";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormMessage message={state.message} />

      {entryId === undefined ? undefined : (
        <input type="hidden" name="entry_id" value={entryId} />
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="experience-title" label="Job title">
          <Input
            id="experience-title"
            name="title"
            defaultValue={value("title", title)}
            error={state.errors.title}
            maxLength={200}
            required
          />
        </Field>

        <Field id="experience-company" label="Company">
          <Input
            id="experience-company"
            name="company"
            defaultValue={value("company", company)}
            error={state.errors.company}
            maxLength={200}
            required
          />
        </Field>
      </div>

      <Field id="experience-location" label="Location" optional>
        <Input
          id="experience-location"
          name="location"
          defaultValue={value("location", location)}
          error={state.errors.location}
          maxLength={200}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="experience-started-month" label="Started, month">
          <Select
            id="experience-started-month"
            name="started_month"
            options={MONTH_OPTIONS}
            defaultValue={value("started_month", startedMonth)}
            error={state.errors.started_month}
            emptyLabel="Choose a month"
            required
          />
        </Field>

        <Field id="experience-started-year" label="Started, year">
          <Select
            id="experience-started-year"
            name="started_year"
            options={years}
            defaultValue={value("started_year", startedYear)}
            error={state.errors.started_year}
            emptyLabel="Choose a year"
            required
          />
        </Field>

        <Field id="experience-ended-month" label="Ended, month" optional>
          <Select
            id="experience-ended-month"
            name="ended_month"
            options={MONTH_OPTIONS}
            defaultValue={value("ended_month", endedMonth)}
            error={state.errors.ended_month}
            emptyLabel="Still there"
          />
        </Field>

        <Field id="experience-ended-year" label="Ended, year" optional>
          <Select
            id="experience-ended-year"
            name="ended_year"
            options={years}
            defaultValue={value("ended_year", endedYear)}
            error={state.errors.ended_year}
            emptyLabel="Still there"
          />
        </Field>
      </div>

      <Field
        id="experience-description"
        label={
          <>
            What you did{" "}
            <span className="font-normal text-muted">in your own words</span>
          </>
        }
        optional
      >
        <Textarea
          id="experience-description"
          name="description"
          rows={5}
          defaultValue={value("description", description)}
          error={state.errors.description}
          maxLength={4000}
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
