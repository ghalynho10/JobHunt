"use client";

import { useEffect } from "react";

import { FOCUS_KEY_ATTRIBUTE, RESULTS_LIST_ATTRIBUTE } from "./focus-key";

/**
 * Keyboard focus across the ranked list's reveal (spec 0015, AC-17, and the
 * focus half of AC-16).
 *
 * FOCUS IS RESTORED, NOT PRESERVED, and the mechanism forces that. The ranked
 * list arrives as a `<Suspense>` reveal, which destroys the fallback's nodes
 * outright, so the browser drops focus to `<body>` the moment the control the
 * reader was on stops existing. Nothing short of client JavaScript can hold
 * focus across that, which is why this file exists at all on a page that spent
 * years of design effort staying server rendered (spec 0015, Consequences).
 *
 * TWO COMPONENTS, ONE MODULE, BECAUSE THEY SIT ON OPPOSITE SIDES OF THE
 * BOUNDARY. `FocusRecorder` renders OUTSIDE the Suspense boundary so the
 * reveal never unmounts it and it keeps listening throughout. `FocusRestorer`
 * renders INSIDE the resolved content, so its mount effect IS the signal that
 * the reveal happened; there is nothing else to subscribe to. React state
 * cannot carry the key between them for the same reason, so the handoff lives
 * in module state below.
 */

/**
 * The one remembered key.
 *
 * A `const` HOLDING A CLOSURE RATHER THAN A `let`, because `AGENTS.md` allows
 * only constants at module level. The mutation is real and deliberate, and
 * keeping it behind `remember` and `consume` is what makes AC-17's third rule
 * mechanical rather than a habit: there is no way to read the key without also
 * clearing it.
 */
function createFocusMemory() {
  let key: string | undefined;

  return {
    remember: (next: string): void => {
      key = next;
    },
    /**
     * AC-17, rule 3: READS AND CLEARS, ALWAYS. Two searches in one browser tab
     * share this module instance, and Adzuna returns overlapping results for
     * similar searches, so a key left over from the first search could match a
     * listing that also appears in the second and pull focus onto a control the
     * reader never touched on this page. That is the same focus steal rule 1
     * exists to prevent, arriving by a different door.
     */
    consume: (): string | undefined => {
      const taken = key;
      key = undefined;
      return taken;
    },
  };
}

const memory = createFocusMemory();

/**
 * AC-17, rule 1: focus counts as orphaned only when nothing live is holding it.
 *
 * PURE AND EXPORTED SO A TEST CAN REACH IT. The unit project is `node` with no
 * jsdom and no layout, so this decision is the largest part of the restore
 * that a test in this repo can prove at all. Everything around it needs a real
 * browser and lives in `verify.md` instead.
 *
 * `document.activeElement === body` IS A PROXY FOR "THE REVEAL ORPHANED THIS
 * READER", NOT A MEASUREMENT OF IT (spec 0015, Consequences). A reader who
 * clicked blank page space moments before the reveal reads the same way here.
 * Accepted as narrow rather than engineered around.
 */
export function focusWasOrphaned(
  active: Element | null,
  body: Element,
): boolean {
  return active === null || active === body;
}

/**
 * The control carrying one key.
 *
 * NO ATTRIBUTE SELECTOR STRING, DELIBERATELY. `sourceJobId` comes from Adzuna,
 * so its characters are not ours to promise, and a quote or a backslash in one
 * would turn a hand built `[data-focus-key="…"]` selector into a syntax error
 * that throws inside the effect. Comparing the attribute across at most forty
 * nodes costs nothing and cannot be broken by a value.
 */
function findByFocusKey(key: string): Element | undefined {
  for (const element of document.querySelectorAll(`[${FOCUS_KEY_ATTRIBUTE}]`)) {
    if (element.getAttribute(FOCUS_KEY_ATTRIBUTE) === key) return element;
  }

  return undefined;
}

/**
 * Remembers which card control the reader was last on (AC-17).
 *
 * RENDERS NOTHING AND MUST SIT OUTSIDE THE SUSPENSE BOUNDARY. Inside it, the
 * reveal would unmount the listener at the exact moment its answer is needed.
 */
export function FocusRecorder(): undefined {
  useEffect(() => {
    /**
     * AC-17, rule 4: the listener sits on the DOCUMENT, filtered by
     * `closest('[data-focus-key]')`, rather than on a results container,
     * because no such container element exists. The `<Suspense>` block is one
     * sibling in a bare fragment alongside the page's notices, so there is
     * nothing to attach to that would still be the same node after the reveal.
     *
     * `focusin` RATHER THAN `focus`, because `focus` does not bubble and this
     * has to hear about controls that do not exist yet when the listener is
     * added.
     *
     * AND IT LISTENS IN THE CAPTURE PHASE, WHICH IS THE WHOLE REASON THIS
     * WORKS AT ALL. React's selective hydration stops the propagation of an
     * event whose target sits inside a Suspense boundary that has not resolved
     * yet: it swallows the event and queues it to replay once that boundary
     * hydrates. Every focus this component exists to record happens in exactly
     * that state, inside the pending result list, so a bubble phase listener
     * hears nothing at all and the reader's place is lost.
     *
     * MEASURED, NOT REASONED. On 2026-09-07, tabbing through a pending
     * `/search`, a capture phase listener on `document` saw all nine focus
     * events while a bubble phase listener on the same node saw only the first
     * seven: the two that landed inside the pending list were missing, and a
     * listener on the list itself saw nothing. The first version of this file
     * listened in the bubble phase and recorded a key only after the reveal,
     * which is the one moment it is no longer needed.
     */
    const record = (event: FocusEvent): void => {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const key = target
        .closest(`[${FOCUS_KEY_ATTRIBUTE}]`)
        ?.getAttribute(FOCUS_KEY_ATTRIBUTE);

      /**
       * A focus on anything without a key (the search box, the header) is a NO
       * OPERATION and leaves the last remembered key alone. It deliberately
       * does not clear it: focus resting on a live element already stops rule 1
       * from firing, so clearing here would buy nothing and would lose the key
       * of a reader who tabbed out of the list and straight back into it.
       */
      if (key === null || key === undefined) return;

      memory.remember(key);
    };

    document.addEventListener("focusin", record, true);

    return () => {
      /**
       * THE `true` HAS TO MATCH THE ONE ABOVE. `removeEventListener` treats
       * the capture flag as part of the listener's identity, so dropping it
       * here would leave the listener attached for the life of the page.
       */
      document.removeEventListener("focusin", record, true);
    };
  }, []);

  return undefined;
}

/**
 * Gives focus back to the control the reader was on, once the ranked list is
 * in place (AC-17).
 *
 * RENDERS NOTHING AND MUST SIT INSIDE THE RESOLVED CONTENT. Mounting IS the
 * reveal signal; there is no other event that says the swap has happened.
 */
export function FocusRestorer(): undefined {
  useEffect(() => {
    /**
     * CONSUMED FIRST, BEFORE ANY OTHER CHECK (AC-17, rule 3). The key is
     * forgotten on every mount whether it is used or declined, so a key this
     * mount refuses cannot survive into the next search.
     */
    const key = memory.consume();

    /**
     * AC-17, rule 1: a reader whose focus is still on a live element, the
     * search box, the header, a card control outside the boundary, is never
     * moved. Stealing focus from somebody who is using the page is a worse
     * defect than the one this fixes.
     */
    if (!focusWasOrphaned(document.activeElement, document.body)) return;

    /**
     * NO RECORDED KEY MEANS NOTHING TO RESTORE, so nothing happens here.
     *
     * THIS IS NOT THE FALLBACK CASE BELOW, and the difference matters. A
     * missing key means the reader was never inside the list, so the reveal
     * cannot be what orphaned them; they got to the body some other way, such
     * as a click on blank space. Moving them onto a card control they never
     * touched would be the same focus steal rule 1 forbids. The fallback below
     * is for a reader who WAS in the list and whose control has gone.
     */
    if (key === undefined) return;

    /**
     * AC-17: when the recorded key is absent from the ranked list, focus goes
     * to the results list itself rather than being left on the body. DEFENSIVE
     * AND NOT EXPECTED TO RUN: the ranked list holds the same `sourceJobId` set
     * as the pending list, only reordered.
     */
    const target =
      findByFocusKey(key) ??
      document.querySelector(`[${RESULTS_LIST_ATTRIBUTE}]`);

    if (!(target instanceof HTMLElement)) return;

    /**
     * NO `preventScroll` (AC-17). A card that moved from the bottom of the list
     * to the top takes the reader with it, which is what keeps the restored
     * focus visible rather than parked off screen (WCAG 2.2, Focus Not
     * Obscured).
     */
    target.focus();
  }, []);

  return undefined;
}
