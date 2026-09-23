# Verify: chip input for skills, titles and locations · spec 0023
_Steps derived from spec 0023 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Per AC-16, most of these are already proven by `chip-field.dom.test.tsx` before this file ever runs; the steps below marked **(browser only)** are the three things this design system has never automated for any component, or that this feature's own jsdom harness cannot honestly reproduce, and are the reason this file exists at all._

## UI / manual

- [ ] Open `?edit=skills` on a profile with skills already saved under the old textarea flow → every skill renders as a chip, same values, same casing, in the same `lower(name)` sorted order it already rendered in before this feature → AC-1
- [ ] Open `?edit=preferences` on a profile with `desired_titles` / `desired_locations` already saved → both render as chips in their exact stored order → AC-1
- [ ] Type a skill and press Enter → it becomes a chip; the entry box is empty and ready for the next value → AC-1
- [ ] Type a location containing a comma ("Chicago, IL") and press Enter → one chip, not two → AC-2
- [ ] With the entry box focused, press Enter → the form does not submit → AC-2
- [ ] Disable JavaScript, open `?edit=skills`, submit one value per line → saved exactly as before this feature; the chip UI never appears → AC-4
- [ ] With JavaScript enabled, force a `validation_failed` response with a temporary, uncommitted local edit that removes only `chip-field.tsx`'s own client side count check (not `limits.ts`, which both sides share and which would refuse the same input on both ends), then commit a 51st `desired_titles` value and submit → the server's field error still renders next to the field through `FieldError`, proving the mounted swap never buries it, and it is visually distinct from the transient refusal paragraph → AC-3, AC-4
- [ ] **(browser only)** On a throttled connection, type into the visible `Textarea` in the brief window before the chip control mounts, then let it mount → the typed value survives as a chip, seeded from the `Textarea`'s own DOM value; this scenario cannot be reproduced in `chip-field.dom.test.tsx`'s `createRoot` based harness (documented in that file's own docblock) → AC-4
- [ ] With `React` already committed, type `react` and press Enter → no second chip; the message reads `"React" is already added.`; the existing chip still reads `React` → AC-5
- [ ] Type a 101 character value and press Enter → refused immediately with the `Keep each skill to 100 characters or fewer.` message (or the matching title/location wording), quoting the actual configured limit → AC-6
- [ ] On `desired_titles`, commit a 50th value, then attempt a 51st → refused with `Add at most 50 titles.`; on `skills`, commit more than 50 values with no refusal → AC-6
- [ ] Paste a clipboard value of three lines, two of which are already committed elsewhere in the field → one chip is created; one message names two values not added, in the plural, not two separate messages → AC-7
- [ ] Paste a value containing a `\r` character (a Windows style line ending pasted from another application) → no committed chip contains `\r` or `\n` → AC-7
- [ ] Type a duplicate value, do not press Enter, click Save → the save does not go through, the message shows, the text is still in the box → AC-8
- [ ] Type a new, valid value, do not press Enter, click Save → it is saved as a chip alongside the others → AC-8
- [ ] Type a valid value, do not press Enter, click somewhere outside the field entirely → it commits as a chip on blur, before any Save → AC-8
- [ ] Type a valid value, do not press Enter, click a chip's own remove control inside the same field → the typed value is not auto committed by that click (the entry box never left the field), and remains in the box → AC-8
- [ ] Fail an unrelated field in the same form (for example, `minimum_pay` with no currency) while `desired_titles` holds valid, uncommitted pending text → the pending text auto commits or the save is blocked per its own validity, and `chip-field.tsx`'s displayed chips after the failed submit match what was on screen before submitting → AC-8
- [ ] Click a chip's remove control → the chip disappears, focus lands on the entry box, and a screen reader announces "Removed {value}." **(browser only, screen reader)** → AC-9
- [ ] With a refusal message showing, remove the chip the message was about → the message clears → AC-8, AC-9
- [ ] Measure a chip's remove control in the browser → at least 24 by 24 CSS pixels, its own fixed size box, and its hit area does not extend into an adjacent chip **(browser only)** → AC-9
- [ ] Read the remove control's accessible name in the accessibility tree → "Remove {value}", not the page's generic "Remove" label → AC-9
- [ ] With the entry box empty, press Backspace once → the last chip shows a visible, shape based pending removal state; a screen reader announces the `chipPendingRemoval` message **(browser only, screen reader)** → AC-10
- [ ] Press Backspace a second time immediately after → the chip is removed, focus lands on the entry box, and "Removed {value}." is announced → AC-9, AC-10
- [ ] After marking a chip pending removal, type a character instead of pressing Backspace again → the pending mark clears and its clearing is announced → AC-10
- [ ] After marking a chip pending removal, click elsewhere on the page (outside the field) → the pending mark clears → AC-10
- [ ] After marking a chip pending removal, click that same chip's own remove control → the chip is removed and the pending mark does not linger on any other chip → AC-10
- [ ] Click directly on a chip's text (not its remove control) → nothing happens; there is no way to edit a chip's text in place → AC-11
- [ ] Save two desired locations, reload `/profile`, then remove the first one and re-add it with a different value → the field's label already stated this value is used to prefill search; load `/search` with no query params and confirm the new value is what prefilled it → AC-12
- [ ] Click Save and, while the request is pending, attempt to type in the entry box or click a remove control → the whole field is disabled, matching the Save button → AC-13
- [ ] Read `src/components/ui/chip.tsx` and `src/features/profile/chip-field.tsx` → no `"use client"` directive, no hook, and no event handler prop appears in `chip.tsx`; `action` and `pendingRemoval` are only assignable when `state="editable"`; every handler lives in `chip-field.tsx`, whose top comment cites `src/components/ui/AGENTS.md` line 7; `chip-field.tsx`'s outer field box uses `controlSurface` from `field.tsx` → AC-14
- [ ] Run `pnpm test` → every existing `schemas.test.ts` assertion for `newlineList()`, `skillsSchema` and `preferencesSchema` still passes unchanged, byte for byte, proving the extraction to `copy.ts` and `limits.ts` lost nothing → AC-15
- [ ] Run `pnpm test` → `chip-field.dom.test.tsx` exists and passes, covering commit, duplicate and limit refusal, paste splitting, both auto commit paths, and the full Backspace two step sequence on the mounted branch, plus a separate `renderToStaticMarkup` based case proving the unmounted branch renders the `Textarea` with no hidden input; its docblock names the pre hydration scenario neither case covers → AC-16
- [ ] Confirm `package.json` gained no new test dependency for this feature, and `src/features/profile/limits.ts` has no imports of its own → AC-16, Feature design

## Value sourcing

One step per row of the spec's Value sourcing table, exercising the edge that breaks if the source is wrong.

- [ ] Load `?edit=preferences` on a profile whose `desired_titles` and `desired_locations` were saved before this feature shipped → both render as chips sourced from the same arrays `queries.ts` already returns, with nothing re-typed → row 3
- [ ] Trigger the duplicate refusal on a value with mixed case → the message names the currently committed chip's exact stored casing, not the newly typed casing → row 4
- [ ] Change `LIST_VALUE_MAX_LENGTH` or `PREFERENCE_LIST_MAX_COUNT` in `limits.ts` in a local, uncommitted edit, reload `?edit=preferences` → the client side refusal fires at the new number and the new number appears in the message text, proving the client reads the same constant and the same message function rather than a hard coded copy → row 5
- [ ] Force a `validation_failed` response, then read the rendered field → the error comes through `FieldError` with `fieldErrorId(id)` wiring `aria-describedby`, the same as `Textarea` renders it, not a bespoke element → row 8

## Not yet observed

_Filled in by `/check verify` when it runs against the built feature._
