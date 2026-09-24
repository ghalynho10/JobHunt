# Verify: chip input for skills, titles and locations · spec 0023
_Steps derived from spec 0023 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Per AC-16, most of these are already proven by `chip-field.dom.test.tsx` before this file ever runs; the steps below marked **(browser only)** are the three things this design system has never automated for any component, or that this feature's own jsdom harness cannot honestly reproduce, and are the reason this file exists at all._

## UI / manual

- [x] Open `?edit=skills` on a profile with skills already saved under the old textarea flow → every skill renders as a chip, same values, same casing, in the same `lower(name)` sorted order it already rendered in before this feature → AC-1
- [x] Open `?edit=preferences` on a profile with `desired_titles` / `desired_locations` already saved → both render as chips in their exact stored order → AC-1
- [x] Type a skill and press Enter → it becomes a chip; the entry box is empty and ready for the next value → AC-1
- [x] Type a location containing a comma ("Chicago, IL") and press Enter → one chip, not two → AC-2
- [x] With the entry box focused, press Enter → the form does not submit → AC-2
- [ ] Disable JavaScript, open `?edit=skills`, submit one value per line → saved exactly as before this feature; the chip UI never appears → AC-4
- [ ] With JavaScript enabled, force a `validation_failed` response with a temporary, uncommitted local edit that removes only `chip-field.tsx`'s own client side count check (not `limits.ts`, which both sides share and which would refuse the same input on both ends), then commit a 51st `desired_titles` value and submit → the server's field error still renders next to the field through `FieldError`, proving the mounted swap never buries it, and it is visually distinct from the transient refusal paragraph → AC-3, AC-4
- [ ] **(browser only)** On a throttled connection, type into the visible `Textarea` in the brief window before the chip control mounts, then let it mount → the typed value survives as a chip, seeded from the `Textarea`'s own DOM value; this scenario cannot be reproduced in `chip-field.dom.test.tsx`'s `createRoot` based harness (documented in that file's own docblock) → AC-4
- [x] With `React` already committed, type `react` and press Enter → no second chip; the message reads `"React" is already added.`; the existing chip still reads `React` → AC-5
- [x] Type a 101 character value and press Enter → refused immediately with the `Keep each skill to 100 characters or fewer.` message (or the matching title/location wording), quoting the actual configured limit → AC-6
- [ ] On `desired_titles`, commit a 50th value, then attempt a 51st → refused with `Add at most 50 titles.`; on `skills`, commit more than 50 values with no refusal → AC-6
- [ ] Paste a clipboard value of three lines, two of which are already committed elsewhere in the field → one chip is created; one message names two values not added, in the plural, not two separate messages → AC-7
- [ ] Paste a value containing a `\r` character (a Windows style line ending pasted from another application) → no committed chip contains `\r` or `\n` → AC-7
- [x] Type a duplicate value, do not press Enter, click Save → the save does not go through, the message shows, the text is still in the box → AC-8
- [ ] Type a new, valid value, do not press Enter, click Save → it is saved as a chip alongside the others → AC-8
- [ ] Type a valid value, do not press Enter, click somewhere outside the field entirely → it commits as a chip on blur, before any Save → AC-8
- [ ] Type a valid value, do not press Enter, click a chip's own remove control inside the same field → the typed value is not auto committed by that click (the entry box never left the field), and remains in the box → AC-8
- [ ] Fail an unrelated field in the same form (for example, `minimum_pay` with no currency) while `desired_titles` holds valid, uncommitted pending text → the pending text auto commits or the save is blocked per its own validity, and `chip-field.tsx`'s displayed chips after the failed submit match what was on screen before submitting → AC-8
- [ ] Click a chip's remove control → the chip disappears, focus lands on the entry box, and a screen reader announces "Removed {value}." **(browser only, screen reader)** → AC-9
- [ ] With a refusal message showing, remove the chip the message was about → the message clears → AC-8, AC-9
- [x] Measure a chip's remove control in the browser → at least 24 by 24 CSS pixels, its own fixed size box, and its hit area does not extend into an adjacent chip **(browser only)** → AC-9
- [x] Read the remove control's accessible name in the accessibility tree → "Remove {value}", not the page's generic "Remove" label → AC-9
- [ ] With the entry box empty, press Backspace once → the last chip shows a visible, shape based pending removal state; a screen reader announces the `chipPendingRemoval` message **(browser only, screen reader)** → AC-10
- [ ] Press Backspace a second time immediately after → the chip is removed, focus lands on the entry box, and "Removed {value}." is announced → AC-9, AC-10
- [ ] After marking a chip pending removal, type a character instead of pressing Backspace again → the pending mark clears and its clearing is announced → AC-10
- [ ] After marking a chip pending removal, click elsewhere on the page (outside the field) → the pending mark clears → AC-10
- [ ] After marking a chip pending removal, click that same chip's own remove control → the chip is removed and the pending mark does not linger on any other chip → AC-10
- [ ] Click directly on a chip's text (not its remove control) → nothing happens; there is no way to edit a chip's text in place → AC-11
- [x] Save two desired locations, reload `/profile`, then remove the first one and re-add it with a different value → the field's label already stated this value is used to prefill search; load `/search` with no query params and confirm the new value is what prefilled it → AC-12
- [ ] Click Save and, while the request is pending, attempt to type in the entry box or click a remove control → the whole field is disabled, matching the Save button → AC-13
- [x] Read `src/components/ui/chip.tsx` and `src/features/profile/chip-field.tsx` → no `"use client"` directive, no hook, and no event handler prop appears in `chip.tsx`; `action` and `pendingRemoval` are only assignable when `state="editable"`; every handler lives in `chip-field.tsx`, whose top comment cites `src/components/ui/AGENTS.md` line 7; `chip-field.tsx`'s outer field box uses `controlSurface` from `field.tsx` → AC-14
- [x] Run `pnpm test` → every existing `schemas.test.ts` assertion for `newlineList()`, `skillsSchema` and `preferencesSchema` still passes unchanged, byte for byte, proving the extraction to `copy.ts` and `limits.ts` lost nothing → AC-15
- [x] Run `pnpm test` → `chip-field.dom.test.tsx` exists and passes, covering commit, duplicate and limit refusal, paste splitting, both auto commit paths, and the full Backspace two step sequence on the mounted branch, plus a separate `renderToStaticMarkup` based case proving the unmounted branch renders the `Textarea` with no hidden input; its docblock names the pre hydration scenario neither case covers → AC-16
- [x] Confirm `package.json` gained no new test dependency for this feature, and `src/features/profile/limits.ts` has no imports of its own → AC-16, Feature design

## Value sourcing

One step per row of the spec's Value sourcing table, exercising the edge that breaks if the source is wrong.

- [x] Load `?edit=preferences` on a profile whose `desired_titles` and `desired_locations` were saved before this feature shipped → both render as chips sourced from the same arrays `queries.ts` already returns, with nothing re-typed → row 3
- [x] Trigger the duplicate refusal on a value with mixed case → the message names the currently committed chip's exact stored casing, not the newly typed casing → row 4
- [ ] Change `LIST_VALUE_MAX_LENGTH` or `PREFERENCE_LIST_MAX_COUNT` in `limits.ts` in a local, uncommitted edit, reload `?edit=preferences` → the client side refusal fires at the new number and the new number appears in the message text, proving the client reads the same constant and the same message function rather than a hard coded copy → row 5
- [ ] Force a `validation_failed` response, then read the rendered field → the error comes through `FieldError` with `fieldErrorId(id)` wiring `aria-describedby`, the same as `Textarea` renders it, not a bespoke element → row 8

## Not yet observed

- AC-4's no JavaScript fallback (item 11), the server side `validation_failed` field error rendering (item 12, value sourcing row 8), the pre hydration DOM seeding scenario (item 13, documented as a known automation limit), paste splitting live in a browser (items 17, 18, already covered by `chip-field.dom.test.tsx`), a handful of the AC-8 auto commit sub cases (items 20 to 23), the AC-10 Backspace two step sequence live in a browser (items 28 to 32, already covered by `chip-field.dom.test.tsx`), the disabled state while a submit is pending (item 35), the count cap at exactly 50 (item 16, already covered by `chip-field.dom.test.tsx`, and a rapid synthetic input stress test this run gave an inconclusive 49-of-50 result that does not match realistic per-keystroke interaction and is not treated as a finding), and a real screen reader pass (items 24, 26, 28, 29) all remain unexercised in this run, blocked on time and on the browser only nature of the last one.

## Finding (2026-09-23, /check verify)

**A real click on Save can silently miss the button and lose unsaved chips, when a refusal message is showing and gets cleared right as Save is clicked.**

Reproduced three times against a running dev server and a real signed in session: type a genuinely new skill (e.g. "Kubernetes"), commit it with Enter, then trigger an unrelated duplicate refusal (type "kubernetes", Enter), clear the entry box with real Backspace key presses (not a scripted value assignment), then click the Save button with a real pointer click (Playwright's own `locator.click()`, not a coordinate hack). The new skill is not saved; a fresh page load shows only the skills that were already stored before this attempt. The dev server's own log confirms no `saveSkills` Server Action ever ran for that click (`grep saveSkills` on the terminal log shows only the one call from an earlier, unrelated save).

Root cause, confirmed by direct evidence, not by reading the code:
- `chip-field.tsx`'s own submit guard logic is correct. A temporary `console.log` inside `handleSubmit` shows it runs, reads an empty `raw`, computes `result: undefined`, and does not call `preventDefault()`, whenever Save is clicked programmatically (`element.click()` via `page.evaluate`), even with a refusal freshly cleared. The same programmatic click also correctly blocks the submit and keeps the text in the box when the box is left non-empty (item 19), proving `evaluateCandidate` and `handleSubmit` both behave exactly as specced.
- The failure is specific to a real, coordinate based pointer click (`locator.click()`). The `console.log` never fires at all in the failing case, meaning the "submit" event never reaches the form, meaning the click itself did not land on the Save button.
- The mechanism: clicking Save first blurs the entry input. `onEntryBlur` calls `commitFromEntry()`, which (correctly, since the box is empty) calls `setRefusal(undefined)`. That removes the refusal `<p>` from the DOM, which sits above the Save button in `skills-form.tsx`'s `flex flex-col gap-5` layout, shifting the button upward. If this reflow lands between the pointer's mousedown and mouseup (or between Playwright's own visibility/stability check and its dispatch), the click can resolve against whatever is now at the old coordinates instead of the button, and nothing happens: no error, no redirect, no console output, and the chip the reader just typed is gone with no warning.

This reproduces on `skills-form.tsx`; `preferences-form.tsx` renders the same `ChipField` the same way and is architecturally exposed to the same layout shift, though it was not separately reproduced there in this run.

Not a logic bug in `evaluateCandidate` or `handleSubmit`, both proven correct above. It is a layout stability issue: the refusal paragraph's appearance/disappearance shifts content below it, including the Save button, at the exact moment a real click can be resolving. → `/debug`. A fix likely needs to keep the Save button's position stable regardless of whether the refusal paragraph is showing (reserved space, an overlay, or moving the message somewhere that cannot shift the button), rather than a change to the commit or refusal logic itself, which is already correct.

The fixture session used to reproduce this (local Supabase only; email `chip-verify-cb1c6ca9-7eb6-4e69-9f7c-fd298b77930a@example.test`, user id `0af13dbc-314d-4c42-9422-d63cf493957a`) was left in place rather than deleted, so `/debug` can reproduce against the same state without re-seeding: skills `Rust`, `TypeScript`, `Zephyr`; preferences `desired_locations: ["Austin, TX"]`, `desired_titles: []`. Mint a fresh session cookie for that same email with `test/helpers/session.ts`'s `mintSession()` (the earlier one has already expired); `DEV_SESSION_ENABLED=true` is already set in `.env.local`. The dev server this run started (`pnpm dev`, logging to `/tmp/jobhunt-dev-server.log`) and the local Supabase stack were left running.

### Resolved (2026-09-23, /debug)

Reproduced the exact sequence above against the same fixture session with a real Playwright pointer click, on the first attempt: the click focused the Save button but no `submit` event reached the form and no `saveSkills` call appeared in the dev server log, confirmed by a page reload showing "Kubernetes" never persisted.

Root cause confirmed against spec 0023 AC-8's own text: AC-8 requires only the SUBMIT handler to clear a stale refusal message ("that same synchronous handler ... clears any stale inline message before evaluating a new attempt"); nothing in AC-8, AC-9, or AC-10 requires blur to clear it. `commitFromEntry()`'s own `setRefusal(undefined)` on an empty box was incidental, not spec required, and it is what fired on every blur, including the one a Save click's own mousedown triggers.

Fix, in `chip-field.tsx`: `commitFromEntry()` no longer clears `refusal` when the box is empty (an empty commit is a no-op now, matching AC-8's letter); a new `onEntryChange` handler clears a shown refusal as soon as the reader types, which is what still makes a stale message go away for someone correcting their entry, decoupled from blur's timing entirely. In the corrected browser run, the refusal already cleared while backspacing, well before Save was touched, so no reflow competed with the click.

Verified: the same real click now completes the save on both `skills-form.tsx` and `preferences-form.tsx` (separately reproduced on the `desired_locations` field, closing the gap this Finding left open), `pnpm test` passes at 1411 of 1411, and two new jsdom cases in `chip-field.dom.test.tsx` pin the state-clearing mechanism itself (confirmed to fail against the pre-fix code first). The click-miss reflow still needs a real layout engine and has no automated coverage; re-run the two repro sequences above by hand if `chip-field.tsx`'s blur or refusal handling changes again.
