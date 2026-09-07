// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FOCUS_KEY_ATTRIBUTE, RESULTS_LIST_ATTRIBUTE } from "./focus-key";
import { FocusRecorder, FocusRestorer } from "./focus-keeper";

/**
 * Keyboard focus across the ranked list's reveal, against a real DOM (spec
 * 0015, AC-17, and the focus half of AC-16).
 *
 * THE FIRST TEST IN THIS PROJECT TO OPT INTO `jsdom`, which spec 0004 said
 * would happen exactly here: the unit project is `node`, and jsdom "arrives
 * with the first test that genuinely needs a browser", opted into per file by
 * the docblock above rather than switched on for everybody. Nothing else in
 * the unit suite changes environment.
 *
 * WHAT THIS CAN PROVE AND WHAT IT CANNOT, stated plainly so nobody reads more
 * safety into it than it has. The bug this file exists to catch was that
 * `FocusRecorder` listened in the BUBBLE phase: React's selective hydration
 * stops propagation of an event whose target sits inside a Suspense boundary
 * that has not resolved yet, so the recorder heard nothing during the one
 * window that matters and the reader lost their place. **jsdom cannot
 * reproduce that.** It has no streaming SSR and no dehydrated boundary, so a
 * bubble phase listener would pass every test below. What jsdom CAN do is pin
 * the contract that the fix depends on (the capture flag) and prove the rest
 * of AC-17's rules against real focus moving between real elements. The
 * end to end proof stays browser only and lives in this spec's `verify.md`.
 *
 * NO TESTING LIBRARY AND NO MOCK DOM. `react-dom/client` renders into jsdom,
 * which is a real DOM implementation, so focus really moves and `focusin`
 * really fires. A hand written fake `document` would encode the very
 * assumption under test, which `AGENTS.md` forbids.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Every root mounted by the current test, torn down in `afterEach`.
 *
 * TEARDOWN IS CENTRAL RATHER THAN PER TEST ON PURPOSE. `FocusRecorder` puts a
 * listener on the document, so a test that fails an assertion before its own
 * cleanup line would leak that listener into the next test and make it fail for
 * a reason that has nothing to do with it. That happened while writing this
 * file, and it turned one real failure into two.
 */
const mounted: (() => void)[] = [];

/** One mounted React root, with the unmount that tears it down. */
function mount(node: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });

  const unmount = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  mounted.push(unmount);

  return { unmount };
}

const KEY_A = "adzuna:111:posting-link";
const KEY_B = "adzuna:222:apply";

/** The results list as `/search` renders it: keyed controls inside a named list. */
function renderList(keys: readonly string[]): void {
  const list = document.createElement("ul");
  list.setAttribute(RESULTS_LIST_ATTRIBUTE, "true");
  list.setAttribute("tabindex", "-1");
  list.setAttribute("aria-label", "Search results");

  for (const key of keys) {
    const item = document.createElement("li");
    const control = document.createElement("a");
    control.setAttribute("href", "#");
    control.setAttribute(FOCUS_KEY_ATTRIBUTE, key);
    control.textContent = key;
    item.append(control);
    list.append(item);
  }

  document.body.append(list);
}

const controlFor = (key: string): HTMLElement =>
  document.querySelector(`[${FOCUS_KEY_ATTRIBUTE}="${key}"]`) as HTMLElement;

const activeKey = (): string | null =>
  document.activeElement?.getAttribute(FOCUS_KEY_ATTRIBUTE) ?? null;

/**
 * THE RE-SORT, AS THE READER MEETS IT. The reveal does not move nodes, it
 * destroys the pending list and builds the ranked one, which is the whole
 * reason focus has to be restored rather than preserved. Rebuilding in a new
 * order is therefore the honest simulation, and it is what drops focus to the
 * body just as the real reveal does.
 */
function revealRanked(keys: readonly string[]): void {
  document.querySelector(`[${RESULTS_LIST_ATTRIBUTE}]`)?.remove();
  renderList(keys);
}

/**
 * Empties the module level key between tests.
 *
 * IT USES THE PRODUCTION PATH RATHER THAN REACHING INTO THE MODULE, because
 * there is deliberately no way to read the key without clearing it (AC-17,
 * rule 3). Mounting a restorer while a live element holds focus consumes the
 * key and, by rule 1, does nothing else.
 */
function drainRememberedKey(): void {
  const live = document.createElement("button");
  document.body.append(live);
  live.focus();
  mount(<FocusRestorer />).unmount();
  live.remove();
}

beforeEach(() => {
  document.body.innerHTML = "";
  drainRememberedKey();
  document.body.innerHTML = "";
});

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.();
  vi.restoreAllMocks();
});

describe("the recorder's listener (AC-17, the capture phase contract)", () => {
  it("listens in the capture phase, not the bubble phase", () => {
    /**
     * THE REGRESSION GUARD, AND THE ONE ASSERTION IN THIS FILE THAT MAPS ONTO A
     * REAL SHIPPED DEFECT. The first version of `focus-keeper.tsx` registered
     * without the capture flag. Every test below still passed, because jsdom
     * propagates normally, and the feature was still broken in a browser:
     * React swallows an event whose target is inside a Suspense boundary that
     * has not resolved, which is every focus this recorder exists to hear.
     * Pinning the flag is the only mechanical guard this project can hold.
     */
    const addListener = vi.spyOn(document, "addEventListener");

    mount(<FocusRecorder />);

    const registration = addListener.mock.calls.find(
      ([type]) => type === "focusin",
    );

    expect(registration).toBeDefined();
    expect(registration?.[2]).toBe(true);
  });

  it("removes the listener with the same capture flag it added", () => {
    /**
     * `removeEventListener` treats the capture flag as part of the listener's
     * identity, so a cleanup that dropped the `true` would leave the listener
     * attached for the life of the page. That leak is invisible in every other
     * assertion here.
     */
    const removeListener = vi.spyOn(document, "removeEventListener");

    mount(<FocusRecorder />).unmount();

    const removal = removeListener.mock.calls.find(
      ([type]) => type === "focusin",
    );

    expect(removal).toBeDefined();
    expect(removal?.[2]).toBe(true);
  });
});

describe("giving the reader their place back (AC-16, AC-17)", () => {
  it("returns focus to the same control after the list is rebuilt in a new order", () => {
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_A).focus();
    expect(activeKey()).toBe(KEY_A);

    /** The reveal destroys the node the reader was on, so focus falls away. */
    revealRanked([KEY_B, KEY_A]);
    expect(document.activeElement).toBe(document.body);

    mount(<FocusRestorer />);

    /**
     * The SAME control, found by its key, in its NEW position. Asserting the
     * key rather than the node is the point: a restore that matched by position
     * would land on `KEY_B` here and look correct to a weaker assertion.
     */
    expect(activeKey()).toBe(KEY_A);
    expect(document.activeElement).toBe(controlFor(KEY_A));
  });

  it("returns focus to the control the reader was on, not merely to some control", () => {
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_B).focus();
    revealRanked([KEY_A, KEY_B]);

    mount(<FocusRestorer />);

    expect(activeKey()).toBe(KEY_B);
  });

  it("never moves a reader whose focus is still on a live element (rule 1)", () => {
    /**
     * THE COUNTERWEIGHT, AND THE MORE IMPORTANT HALF. Stealing focus from
     * somebody using the page is a worse defect than the one this mechanism
     * fixes, and a version that always restored would pass both tests above and
     * fail only this one.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_A).focus();

    const searchBox = document.createElement("input");
    searchBox.setAttribute("name", "q");
    document.body.append(searchBox);
    searchBox.focus();

    revealRanked([KEY_B, KEY_A]);

    /** The reader is still holding a live element, so nothing may move them. */
    expect(document.activeElement).toBe(searchBox);

    mount(<FocusRestorer />);

    expect(document.activeElement).toBe(searchBox);
    expect(activeKey()).toBeNull();
  });

  it("moves nobody when no control was ever focused", () => {
    /**
     * A reader who never entered the list cannot have been orphaned by the
     * reveal; they reached the body some other way, such as a click on blank
     * space. Pulling them onto a card they never touched would be the same
     * steal rule 1 forbids.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    revealRanked([KEY_B, KEY_A]);
    expect(document.activeElement).toBe(document.body);

    mount(<FocusRestorer />);

    expect(document.activeElement).toBe(document.body);
    expect(activeKey()).toBeNull();
  });

  it("forgets the key even on a mount that declined to use it (rule 3)", () => {
    /**
     * THE DECLINED PATH IS THE ONE WORTH PINNING, and it is the half the rule
     * spells out: the key is forgotten "whether it restored anything or not".
     * A restorer that only cleared on a successful restore would pass every
     * other test here and still leave a key alive after a mount that rule 1
     * blocked.
     *
     * Two searches in one browser tab share this module instance, and Adzuna
     * returns overlapping results for similar searches, so a key that outlived
     * its own reveal could match a listing in the next one and pull focus onto
     * a control the reader never touched on that page.
     *
     * NOTE WHY THIS IS NOT WRITTEN AS "RESTORE, THEN REVEAL AGAIN". A restore
     * calls `.focus()`, the recorder hears that `focusin` and records the same
     * key again, so the key legitimately comes back. That is correct: the
     * reader really is on that control, and a later reveal that destroys it
     * should hand it back again. It just cannot be used to observe the clear.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_A).focus();

    /** A live element holds focus, so this mount consumes but declines. */
    const searchBox = document.createElement("input");
    searchBox.setAttribute("name", "q");
    document.body.append(searchBox);
    searchBox.focus();

    mount(<FocusRestorer />).unmount();
    expect(document.activeElement).toBe(searchBox);

    /** Now orphan the reader for real. The key must already be gone. */
    searchBox.remove();
    revealRanked([KEY_B, KEY_A]);
    expect(document.activeElement).toBe(document.body);

    mount(<FocusRestorer />);

    expect(document.activeElement).toBe(document.body);
    expect(activeKey()).toBeNull();
  });

  it("hands the same control back a second time when a later reveal destroys it again", () => {
    /**
     * The other side of the test above, and the reason it is not a defect that
     * a restore re-arms the key: the restore focuses the control, the recorder
     * hears it, and a second reveal that destroys that control returns the
     * reader to it once more. Two reveals, the reader's place kept across both.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_A).focus();
    revealRanked([KEY_B, KEY_A]);
    mount(<FocusRestorer />).unmount();
    expect(activeKey()).toBe(KEY_A);

    revealRanked([KEY_A, KEY_B]);
    expect(document.activeElement).toBe(document.body);

    mount(<FocusRestorer />);

    expect(activeKey()).toBe(KEY_A);
  });

  it("keeps the remembered key when focus passes over something without one", () => {
    /**
     * A focus on the search box or a header link is a no operation: it must not
     * clear the key. The code says so in a comment, and this is what makes that
     * comment true. Without it, tabbing out of the list and back to a control
     * outside it would silently cost the reader their place.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_A).focus();

    const header = document.createElement("a");
    header.setAttribute("href", "#");
    header.textContent = "Profile";
    document.body.append(header);
    header.focus();
    header.remove();

    expect(document.activeElement).toBe(document.body);

    revealRanked([KEY_B, KEY_A]);
    mount(<FocusRestorer />);

    expect(activeKey()).toBe(KEY_A);
  });

  it("falls back to the named results list when the control is gone", () => {
    /**
     * Defensive and not expected to run: the ranked list holds the same job ids
     * as the pending one. What matters is where the reader lands when it does,
     * which is a named list rather than the document body.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />);

    controlFor(KEY_A).focus();

    /** The ranked list comes back without the control the reader was on. */
    revealRanked([KEY_B]);
    expect(controlFor(KEY_A)).toBeNull();

    mount(<FocusRestorer />);

    const list = document.querySelector(`[${RESULTS_LIST_ATTRIBUTE}]`);
    expect(document.activeElement).toBe(list);
    expect(list?.getAttribute("aria-label")).toBe("Search results");
  });

  it("records nothing at all while the recorder is unmounted", () => {
    /**
     * The recorder sits outside the Suspense boundary precisely so the reveal
     * cannot tear it down. This is the shape of the failure if it ever moves
     * inside one: focus is recorded by nobody, and the reader is left on the
     * body.
     */
    renderList([KEY_A, KEY_B]);
    mount(<FocusRecorder />).unmount();

    controlFor(KEY_A).focus();
    revealRanked([KEY_B, KEY_A]);

    mount(<FocusRestorer />);

    expect(document.activeElement).toBe(document.body);
  });
});
