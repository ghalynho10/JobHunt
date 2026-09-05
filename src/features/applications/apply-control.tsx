"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

import { CONTROLS, markAppliedLabel } from "./copy";
import { IDLE_STATE, type ApplicationActionState } from "./form-state";

/**
 * The apply control on one search result (spec 0014, AC-1, AC-9, AC-21).
 *
 * THE ONLY CLIENT COMPONENT ON `/search`, and it is deliberately this small.
 * Spec 0013 shipped that page with no client JavaScript at all, and this costs
 * that property; the boundary is drawn around one button so the page, the form,
 * the twenty cards, both attributions and every salary line all stay server
 * rendered. `ResultCard` itself remains a Server Component.
 *
 * WHY IT HAS TO BE A CLIENT COMPONENT. The apply action deliberately triggers
 * no re-render, because a re-render of `/search` re-runs the Adzuna search and
 * spends one of 25 weekly calls (AC-10). Nothing on the server can therefore
 * update this card after the write, so the returned state has to be rendered
 * here. A plain form with no JavaScript would need the response to be a
 * rendered page, which is the re-render the whole design avoids.
 *
 * IT NEVER FLIPS OPTIMISTICALLY. `alreadyApplied` comes from the server read at
 * render time, and `status === "applied"` only ever comes back from an action
 * that inserted a row. Both mean the record exists.
 */
export function ApplyControl({
  action,
  title,
  companyName,
  alreadyApplied,
}: {
  /**
   * The inline `'use server'` closure this card was rendered with, already
   * carrying its own listing. Passed in rather than imported, because that
   * closure is what Next encrypts per build so the browser can neither read
   * nor forge the listing (spec 0014, `## Decision`).
   */
  readonly action: () => Promise<ApplicationActionState>;
  readonly title: string;
  readonly companyName: string;
  /** From `readAppliedJobIds` at render time (AC-9). */
  readonly alreadyApplied: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  const applied = alreadyApplied || state.status === "applied";

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button
        type="submit"
        variant="secondary"
        /**
         * AC-9: applied is a terminal state for this control. Disabling it is
         * not only tidiness, it stops a second press producing the duplicate
         * refusal, which would read as a bug rather than as information the
         * reader already had on screen.
         */
        disabled={applied || pending}
        label={applied ? undefined : markAppliedLabel(title, companyName)}
      >
        {applied ? CONTROLS.applied : CONTROLS.markApplied}
      </Button>

      {/*
       * `AGENTS.md`: no silent failures. Nothing was written, so the reader is
       * told, beside the control they just pressed.
       */}
      {state.status === "failed" && state.message !== undefined ? (
        <FieldError>
          {state.message}
          {state.action === undefined ? undefined : (
            <>
              {" "}
              <a
                href={state.action.href}
                className="underline underline-offset-2"
              >
                {state.action.label}
              </a>
            </>
          )}
        </FieldError>
      ) : undefined}

      {/*
       * The applied state is announced, not only shown. A disabled button whose
       * label changed is a visual signal; this is the one a screen reader gets.
       */}
      {applied ? (
        <span role="status" className="sr-only">
          {`${CONTROLS.applied}: ${title} at ${companyName}`}
        </span>
      ) : undefined}
    </form>
  );
}
