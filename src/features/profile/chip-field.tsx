"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardEvent, FocusEvent, KeyboardEvent } from "react";

import { Chip } from "@/components/ui/chip";
import {
  FieldError,
  controlSurface,
  fieldErrorId,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

import {
  alreadyAdded,
  chipPendingRemoval,
  chipPendingRemovalCleared,
  chipRemoved,
  pasteRefusedSome,
  removeChipLabel,
  tooLongValue,
  tooManyValues,
} from "./copy";
import { LIST_VALUE_MAX_LENGTH } from "./limits";

/**
 * The chip input replacing the one line per value textarea for skills,
 * desired titles and desired locations (spec 0023, AC-1 to AC-14).
 *
 * A CLIENT COMPONENT (`src/components/ui/AGENTS.md` line 7: a base component
 * never holds state, takes an event handler, or crosses the client boundary).
 * Every interaction here, typing, committing, removing, the two step
 * Backspace, needs real state and real event handlers, so it lives here
 * rather than in `src/components/ui/chip.tsx`.
 *
 * IT STILL WORKS WITH JAVASCRIPT SWITCHED OFF (AC-4). Before this component
 * mounts, and with no JavaScript at all, the field renders `Textarea` exactly
 * as spec 0010 already did: one value per line, submitting under the same
 * `FormData` key, parsed by the unchanged `newlineList()`. Only once mounted
 * does the chip UI, backed by a hidden `committed.join("\n")` input under the
 * same key, take its place. Exactly one control ever carries the field's
 * `name` at a time.
 */

/** The three fields this control serves, each with its own message noun. */
type Noun = "skill" | "title" | "location";

interface ChipFieldProps {
  /** Placed on the entry input, so `Field`'s `<label htmlFor>` resolves to it. */
  readonly id: string;
  /** The `FormData` key the Server Action reads. */
  readonly name: string;
  /**
   * The stored values (or the last failed submit's own values). The single
   * source for both branches: the unmounted `Textarea`'s `defaultValue`, and
   * the mounted branch's initial committed chips (AC-4). Read once, at first
   * render, by `useState`, so a parent recreating this array by reference on
   * every render never re-seeds chips the reader has since changed.
   */
  readonly initialValues: readonly string[];
  /** The count cap, `desired_titles` and `desired_locations` only. */
  readonly maxCount?: number;
  readonly noun: Noun;
  readonly disabled: boolean;
  readonly error: string | undefined;
}

/**
 * One value per line, trimmed, empty lines dropped. No dedup: trusted input.
 *
 * Exported so a parent form can turn its own `state.values[name] ?? stored`
 * string (the existing `ActionState` echo back pattern) into the array
 * `initialValues` takes, without a second copy of this parsing living beside
 * it in every form.
 */
export function parseNewlineList(raw: string): readonly string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((value) => value !== "");
}

/**
 * A single candidate's outcome: the cleaned value, and an error message when
 * it is refused. `error === undefined` means the value may be committed.
 *
 * `undefined` overall means the candidate was blank and is silently a no-op,
 * matching `newlineList()`'s own empty line drop (AC-1's "no change from an
 * empty commit" invariant).
 */
function evaluateCandidate(
  rawValue: string,
  committed: readonly string[],
  maxCount: number | undefined,
  noun: Noun,
): { readonly value: string; readonly error?: string } | undefined {
  /**
   * No committed chip may ever contain a literal `\n` or `\r` (AC-7),
   * regardless of source: stripped here, at the one place every commit path
   * (Enter, paste, auto commit) funnels through.
   */
  const cleaned = rawValue.replace(/[\r\n]/g, "").trim();

  if (cleaned === "") return undefined;

  const existing = committed.find(
    (value) => value.toLowerCase() === cleaned.toLowerCase(),
  );
  if (existing !== undefined) {
    return { value: cleaned, error: alreadyAdded(existing) };
  }

  if (cleaned.length > LIST_VALUE_MAX_LENGTH) {
    return {
      value: cleaned,
      error: tooLongValue(noun, LIST_VALUE_MAX_LENGTH),
    };
  }

  if (maxCount !== undefined && committed.length >= maxCount) {
    return { value: cleaned, error: tooManyValues(noun, maxCount) };
  }

  return { value: cleaned };
}

/** Keys a keydown that neither commits nor starts the Backspace shortcut. */
const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "OS",
  "Symbol",
  "SymbolLock",
]);

/** A small "x" mark, the remove control's own icon. Decorative: the button around it carries the accessible name (AC-9). */
function RemoveMark() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
      <path
        d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChipField({
  id,
  name,
  initialValues,
  maxCount,
  noun,
  disabled,
  error,
}: ChipFieldProps) {
  const [mounted, setMounted] = useState(false);
  const [committed, setCommitted] = useState<readonly string[]>(initialValues);
  const [pendingIndex, setPendingIndex] = useState<number | undefined>(
    undefined,
  );
  const [refusal, setRefusal] = useState<
    { readonly id: number; readonly text: string } | undefined
  >(undefined);
  const [announcement, setAnnouncement] = useState<
    { readonly id: number; readonly text: string } | undefined
  >(undefined);

  const entryRef = useRef<HTMLInputElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((text: string) => {
    setAnnouncement((prior) => ({ id: (prior?.id ?? 0) + 1, text }));
  }, []);

  function showRefusal(text: string) {
    setRefusal((prior) => ({ id: (prior?.id ?? 0) + 1, text }));
  }

  /**
   * `useCallback`, not a plain function: the submit effect below calls this,
   * and giving it a stable identity (recreated only when `pendingIndex` or
   * `committed` actually change) is what keeps that effect from tearing down
   * and re-attaching its capture phase listener on every unrelated render.
   */
  const clearPending = useCallback(() => {
    if (pendingIndex === undefined) return;
    const value = committed[pendingIndex];
    setPendingIndex(undefined);
    if (value !== undefined) announce(chipPendingRemovalCleared(value));
  }, [pendingIndex, committed, announce]);

  /**
   * Enter and blur share this (submit has its own copy in the capture phase
   * handler below, since it must also write the hidden input synchronously).
   *
   * AN EMPTY BOX LEAVES ANY SHOWN REFUSAL ALONE (bug fixed here, spec 0023
   * verify.md's 2026-09-23 finding). Blur fires before a real pointer click's
   * mouseup resolves (a Save click blurs the entry box on its mousedown), so
   * clearing the refusal paragraph here used to unmount it and shift the Save
   * button at the exact moment the click was landing, sometimes moving the
   * button out from under the pointer entirely and silently dropping the
   * click. AC-8 requires only the SUBMIT handler to clear a stale message; an
   * empty commit clears it here only when it actually replaces the refusal
   * with a fresh outcome, never merely because the box is empty. Clearing on
   * typing is handled separately, by `onEntryChange` below.
   */
  function commitFromEntry() {
    const raw = entryRef.current?.value ?? "";
    const result = evaluateCandidate(raw, committed, maxCount, noun);

    if (result === undefined) {
      return;
    }

    if (result.error !== undefined) {
      showRefusal(result.error);
      return;
    }

    setCommitted((previous) => [...previous, result.value]);
    setRefusal(undefined);
    if (entryRef.current !== null) entryRef.current.value = "";
  }

  /**
   * The mount and swap (AC-4). The committed chips are already seeded from
   * `initialValues` by `useState` above, so this only flips `mounted`, which
   * is idempotent and needs no guard against running twice.
   *
   * A value typed into the `Textarea` before this runs is NOT preserved, and
   * no read of the DOM here could preserve it: React's own hydration commit
   * (`initTextarea`, `react-dom` 19.2.8) resets the `Textarea`'s value to its
   * server rendered text before any effect runs (spec 0023 AC-4).
   *
   * SETTING STATE HERE IS THE POINT, NOT AN ANTI-PATTERN THIS RULE USUALLY
   * CATCHES. `mounted` cannot be computed during render: it exists only to
   * tell the first client render apart from every one after it, so the first
   * one matches the server render and no hydration mismatch occurs.
   */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the mount flag AC-4 names, see above
    setMounted(true);
  }, []);

  /**
   * The capture phase submit guard (AC-8). Attached directly to the hidden
   * input's own `<form>`, ahead of React's own bubble phase submit handling,
   * so a refused auto commit can stop the Server Action from ever running.
   * Re-subscribes whenever `committed` changes so the closure this reads
   * never goes stale; the cost is one cheap add/removeEventListener pair per
   * commit, not a rendering concern.
   */
  useEffect(() => {
    if (!mounted) return undefined;

    const form = hiddenInputRef.current?.form ?? null;
    if (form === null) return undefined;

    function handleSubmit(event: SubmitEvent) {
      clearPending();

      const raw = entryRef.current?.value ?? "";
      const result = evaluateCandidate(raw, committed, maxCount, noun);

      if (result !== undefined && result.error !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        showRefusal(result.error);
        return;
      }

      const finalValues =
        result === undefined ? committed : [...committed, result.value];

      if (hiddenInputRef.current !== null) {
        hiddenInputRef.current.value = finalValues.join("\n");
      }

      if (result !== undefined) {
        setCommitted(finalValues);
        if (entryRef.current !== null) entryRef.current.value = "";
      }

      setRefusal(undefined);
    }

    form.addEventListener("submit", handleSubmit, true);
    return () => form.removeEventListener("submit", handleSubmit, true);
  }, [mounted, committed, pendingIndex, maxCount, noun, clearPending]);

  function removeChipAt(index: number) {
    const value = committed[index];
    setCommitted((previous) => previous.filter((_, i) => i !== index));
    setPendingIndex(undefined);
    setRefusal(undefined);
    if (value !== undefined) announce(chipRemoved(value));
    entryRef.current?.focus();
  }

  function onEntryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      clearPending();
      commitFromEntry();
      return;
    }

    const isEmpty = (entryRef.current?.value ?? "") === "";

    if (event.key === "Backspace" && isEmpty) {
      if (pendingIndex !== undefined && pendingIndex === committed.length - 1) {
        removeChipAt(pendingIndex);
      } else if (committed.length > 0) {
        const index = committed.length - 1;
        const value = committed[index];
        setPendingIndex(index);
        if (value !== undefined) announce(chipPendingRemoval(value));
      }
      return;
    }

    if (
      pendingIndex !== undefined &&
      event.key !== "Backspace" &&
      !MODIFIER_KEYS.has(event.key)
    ) {
      clearPending();
    }
  }

  /**
   * Clears a stale refusal as soon as the reader starts a new attempt, since
   * `commitFromEntry` no longer clears one just because the box went empty
   * (see its own comment above). This is what still makes the message go
   * away for a reader who keeps typing, without tying that removal to blur.
   */
  function onEntryChange() {
    setRefusal(undefined);
  }

  function onEntryPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    clearPending();

    const text = event.clipboardData.getData("text");
    const lines = text.split(/\r\n|\r|\n/);

    let working = committed;
    let refusedCount = 0;

    for (const line of lines) {
      const result = evaluateCandidate(line, working, maxCount, noun);
      if (result === undefined) continue;
      if (result.error !== undefined) {
        refusedCount += 1;
        continue;
      }
      working = [...working, result.value];
    }

    setCommitted(working);

    if (refusedCount > 0) {
      showRefusal(pasteRefusedSome(refusedCount, noun));
    } else {
      setRefusal(undefined);
    }
  }

  /**
   * "Loses focus" means focus leaves the field entirely (AC-8), not merely
   * the entry box: a move to a control inside the same field, such as a
   * chip's own remove control, must not auto commit or clear the pending
   * Backspace mark.
   */
  function onEntryBlur(event: FocusEvent<HTMLInputElement>) {
    const next = event.relatedTarget;
    if (next !== null && fieldRef.current?.contains(next) === true) return;

    clearPending();
    commitFromEntry();
  }

  if (!mounted) {
    return (
      <Textarea
        id={id}
        name={name}
        defaultValue={initialValues.join("\n")}
        disabled={disabled}
        error={error}
      />
    );
  }

  const invalid = error !== undefined;

  return (
    <div>
      <div
        ref={fieldRef}
        className={controlSurface({
          invalid,
          class: [
            "flex flex-wrap items-center gap-1.5",
            disabled ? "cursor-not-allowed opacity-55" : undefined,
          ]
            .filter((value) => value !== undefined)
            .join(" "),
        })}
      >
        {committed.map((value, index) => (
          <Chip
            key={value}
            state="editable"
            pendingRemoval={pendingIndex === index}
            action={
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeChipAt(index)}
                aria-label={removeChipLabel(value)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink disabled:cursor-not-allowed"
              >
                <RemoveMark />
              </button>
            }
          >
            {value}
          </Chip>
        ))}

        <input
          ref={entryRef}
          id={id}
          type="text"
          disabled={disabled}
          onKeyDown={onEntryKeyDown}
          onChange={onEntryChange}
          onPaste={onEntryPaste}
          onBlur={onEntryBlur}
          aria-invalid={invalid}
          aria-describedby={invalid ? fieldErrorId(id) : undefined}
          className="min-w-[8ch] flex-1 bg-transparent font-sans text-body text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
      </div>

      {invalid ? (
        <FieldError id={fieldErrorId(id)}>{error}</FieldError>
      ) : undefined}

      {refusal !== undefined ? (
        <p
          aria-live="polite"
          aria-atomic="true"
          className="mt-1.5 font-sans text-small text-secondary"
        >
          <span key={refusal.id}>{refusal.text}</span>
        </p>
      ) : undefined}

      {/*
       * Dedicated, always rendered, and visually hidden: it carries only
       * events with no visible text of their own (AC-9), the chip removed,
       * pending and pending cleared announcements. Each is wrapped in a
       * `key`ed span, so two identical, consecutive announcements each mount
       * a genuinely new node and both are announced, not just the first.
       */}
      <div aria-live="polite" className="sr-only">
        {announcement !== undefined ? (
          <span key={announcement.id}>{announcement.text}</span>
        ) : undefined}
      </div>

      <input
        ref={hiddenInputRef}
        type="hidden"
        name={name}
        readOnly
        value={committed.join("\n")}
      />
    </div>
  );
}
