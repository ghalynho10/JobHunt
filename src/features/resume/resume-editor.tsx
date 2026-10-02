"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldError } from "@/components/ui/field";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";

import { saveResumeVersion } from "./actions";
import {
  CONTROLS,
  EDITOR_HINT,
  EDITOR_LABEL,
  LEAVE_WITHOUT_SAVING_CONFIRM,
  SAVE_ANYWAY_LABEL,
  conflictMessage,
} from "./copy";
import { IDLE_RESUME_STATE } from "./form-state";

/**
 * The resume editor (spec 0024, AC-2, AC-3, AC-7, AC-9).
 *
 * A CLIENT COMPONENT, for the same reason every profile form is one:
 * `useActionState` is what brings 20000 typed characters back after a refused
 * or conflicted save (AC-3), and the unsaved changes guards need the browser.
 * It still submits with JavaScript off, as a real `<form>` posting to a Server
 * Action, and the action's echoed `content` is what refills the field then.
 *
 * IT NEVER IMPORTS THE MARKDOWN RENDERER. The conflict pane shows the newer
 * version as raw text on purpose (AC-9), which is also what keeps the renderer
 * out of the client bundle (spec 0024, invariant 5).
 *
 * THE PAGE MOUNTS IT WITH A `key` ON THE `from` SOURCE, so a different Restore
 * target is a fresh instance with a fresh baseline, never this one reusing a
 * stale one.
 */

/**
 * Whether the field holds text that differs from what the editor opened with.
 *
 * ONE FUNCTION FOR BOTH GUARDS, so the `beforeunload` prompt and Cancel's
 * confirmation cannot disagree about what "unsaved" means. It reads the live
 * field rather than React state, so no keystroke re-renders the editor.
 */
function hasUnsavedText(
  form: HTMLFormElement | null,
  baseline: string,
): boolean {
  const field = form?.elements.namedItem("content");

  return field instanceof HTMLTextAreaElement && field.value !== baseline;
}

interface ResumeEditorProps {
  /**
   * The text the editor opened with: the current version, a restored one, or
   * the profile seed. It is also the dirty check's baseline, captured once.
   */
  readonly initialContent: string;
  /**
   * `MAX(version_number)` as read when the editor loaded, `0` when no version
   * exists yet (AC-9). Never the number of the text on screen.
   */
  readonly previousVersionNumber: number;
}

export function ResumeEditor({
  initialContent,
  previousVersionNumber,
}: ResumeEditorProps) {
  const [state, formAction, pending] = useActionState(
    saveResumeVersion,
    IDLE_RESUME_STATE,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const conflictId = useId();

  /**
   * THE BASELINE IS THE PROP, NEVER THE FIELD'S OWN `defaultValue` (spec 0024,
   * "Why the dirty check cannot read `defaultValue`"). After a refused save
   * React resets the field to the new `defaultValue`, which is the reader's own
   * echoed text, so comparing against it would call a field full of unsaved
   * text clean.
   */
  const baseline = useRef(initialContent);

  /**
   * AC-7, the real page load half: reloading, closing the tab, typing another
   * address. The browser shows its own generic prompt; no modern browser lets
   * a page choose the words, which is why `COPY-9` is not used here.
   */
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedText(formRef.current, baseline.current)) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const conflict = state.status === "conflict";

  /**
   * ONE HIDDEN FIELD, TWO SOURCES, in a fixed order (AC-9). After a conflict it
   * is the number the conflict reported, so "save anyway" is a plain resubmit
   * of the same form; otherwise it is what was current when the editor loaded.
   */
  const submittedPrevious =
    conflict && state.currentVersionNumber !== undefined
      ? state.currentVersionNumber
      : previousVersionNumber;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      {state.message === undefined ? undefined : (
        <FieldError>{state.message}</FieldError>
      )}

      <input
        type="hidden"
        name="previousVersionNumber"
        value={submittedPrevious}
      />

      {conflict ? (
        <div className="flex flex-col gap-3">
          {/*
           * `role="alert"`, ON ITS OWN ELEMENT, NOT THROUGH `FieldError` (spec
           * 0024, AC-9). An outcome the server returns for a submitted form
           * is announced assertively, the same as every other Save outcome in
           * this form (`COPY-10`, `COPY-11`, `COPY-30` to `COPY-33`); a
           * refusal a field raises itself, client side, before anything is
           * sent is polite, which is spec 0023's chip refusal (the rule is in
           * spec 0024's rationale, "Announcing an outcome"). `FieldError` would
           * announce it too, but a conflict is explicitly not a `Failure`, and
           * the error component would say otherwise in markup. The role sits
           * on this `div` because `Text` drops every `role` and `aria-*` prop.
           * Found missing by `/check review` on 2026-10-02: until then the
           * conflict was announced to nobody.
           */}
          <div id={conflictId} role="alert">
            <Text>{conflictMessage(state.currentVersionNumber ?? 0)}</Text>
          </div>
          {/*
           * `COPY-24` holds no text on purpose: the newer version's `<figure>` is
           * labelled by `COPY-7` directly above it (a `<pre>` cannot take a
           * name). Raw, never rendered, so the reader
           * compares markdown with markdown (AC-9).
           */}
          <figure aria-labelledby={conflictId}>
            <Card tone="flat" className="max-w-full">
              <pre className="font-mono text-small break-words whitespace-pre-wrap text-secondary">
                {state.currentVersionContent}
              </pre>
            </Card>
          </figure>
        </div>
      ) : undefined}

      <Field
        id="resume-content"
        label={
          <>
            {EDITOR_LABEL}{" "}
            <span className="font-normal text-muted">{EDITOR_HINT}</span>
          </>
        }
      >
        {/*
         * NO `maxLength` AND NO `required`, deliberately. A seed over the
         * ceiling must render in full and reach `COPY-11` on save (AC-2), and
         * a blank save must reach `COPY-10` (AC-3). The browser's own
         * constraint messages would stop either submit first, in words the
         * spec did not choose.
         */}
        <Textarea
          id="resume-content"
          name="content"
          rows={24}
          defaultValue={state.values["content"] ?? initialContent}
          error={state.errors["content"]}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {conflict ? SAVE_ANYWAY_LABEL : CONTROLS.save}
        </Button>
        {/*
         * The editor's only exit control (AC-7). `onNavigate` runs before the
         * client side transition and cancels it unless the reader confirms.
         *
         * WHILE A SAVE IS IN FLIGHT IT DOES NOT LEAVE AT ALL, and asks nothing.
         * Leaving mid save would land on `/resume` before the save it started
         * had redirected there, so the plain view could show the version before
         * it. A link cannot be disabled (`Button` forbids it, there is no
         * disabled anchor), so the transition is refused instead, while Save
         * beside it shows the pending state. Found by `/check review` on
         * 2026-10-02.
         */}
        <Button
          variant="tertiary"
          href="/resume"
          onNavigate={(event) => {
            if (pending) {
              event.preventDefault();
              return;
            }
            if (
              hasUnsavedText(formRef.current, baseline.current) &&
              !window.confirm(LEAVE_WITHOUT_SAVING_CONFIRM)
            ) {
              event.preventDefault();
            }
          }}
        >
          {CONTROLS.cancel}
        </Button>
      </div>
    </form>
  );
}
