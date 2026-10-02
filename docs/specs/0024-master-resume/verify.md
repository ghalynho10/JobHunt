# Verify: Master resume · spec 0024
_Steps derived from spec 0024 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Written before the feature is built; boxes tick as `/check verify` actually runs each one against the real app._

## UI / manual

- [ ] Sign in as a profile with skills and work history but no resume yet, open `/resume` → the empty state names that no resume exists and offers "Start from my profile" → AC-1
- [ ] Follow "Start from my profile" into the editor → the textarea holds exactly the AC-2 template: the name, a blank line, the location, then the summary paragraph, a `## Skills` bulleted list, a `## Experience` section with entries ordered most recently started first in the `**title** — company (month year – month year or Present)` shape, and an empty `## Education` heading; no email or phone appears anywhere → AC-2
- [ ] Same profile with no skills and no work history → the seeded editor omits the `## Skills` and `## Experience` headings entirely rather than showing them empty → AC-2
- [ ] A profile whose summary plus several long work history descriptions sum past 20000 characters → the seed still renders in full, unedited, and the first Save attempt fails with the over length message rather than a silently truncated seed → AC-2, AC-3
- [ ] Submit a blank (whitespace only) textarea → refused with a visible message, nothing written, the editor stays open with the text as typed → AC-3
- [ ] Submit content over 20000 characters → same refusal shape as the blank case → AC-3
- [ ] Save valid content twice in a row (no conflict) → `/resume` shows version 1, then version 2, after each redirect → AC-4
- [ ] On `/resume` with a saved resume, read the rendered output → headings, bold and lists render as formatted output, never literal `**`/`#` characters → AC-5
- [ ] Click "Edit" from the plain view with a resume already saved → the editor opens prefilled with the CURRENT version's text, not the profile seed → AC-5
- [ ] The version list shows every saved version, newest first, the current one visibly marked, with no page cutoff even past a handful of versions → AC-6
- [ ] Click Restore on an older version from the plain view → the editor opens prefilled with that version's own text, unsaved; nothing is written by this click alone → AC-6
- [ ] Confirm Restore and "Start from my profile" never appear anywhere while the editor is open (only on the plain view) → AC-6, AC-7
- [ ] Dirty the editor (type without saving), click Cancel → a confirmation names the unsaved loss before the navigation completes; declining it leaves the typed text exactly in place **(browser only)** → AC-7
- [ ] Dirty the editor, reload the tab → the browser's own `beforeunload` prompt appears **(browser only, exact wording is the browser's, not this app's)** → AC-7
- [ ] Dirty the editor, then leave through the app header's Search or Profile link, through Sign out, and through the browser's Back button, one at a time → each of the three leaves silently, with no warning, confirming the named accepted gap rather than a surprise → AC-7
- [ ] With JavaScript disabled, dirty the editor and leave any way at all → no warning of any kind appears → AC-7
- [ ] Visit `/resume?edit=resume&from=<a uuid that is not one of this caller's own versions>` → the plain view renders with "That version is no longer there.", never a blank or broken editor → AC-8
- [ ] Same with a malformed (non uuid) `from` value → same result → AC-8
- [ ] Open the editor in two tabs on the same resume, save in tab A, then submit a save in tab B built against the version A already replaced → tab B shows the conflict state: B's own typed text stays in the field and editable, the newer (A's) version's raw markdown text is shown read only beside it, unrendered → AC-9
- [ ] From that conflict state, click "Save my text as a new version anyway" → it succeeds as the next version after A's → AC-9
- [ ] With versions 1 through 5 already saved, restore version 2 and save it unmodified → the result is version 6, not a false conflict against version 3 → AC-9
- [ ] Submit a save whose `previousVersionNumber` field has been tampered with to a non numeric value (browser dev tools) → refused as a visible validation error, never a raw database error → AC-9 (Feature design, `Key errors`)
- [ ] `/profile` for a profile with a saved resume shows a card naming the version number and last saved date, linking to `/resume` → AC-10
- [ ] `/profile` for a profile with no resume shows the card's own "No resume yet." state → AC-10
- [ ] `/profile` for a caller with no profile row at all → the identity only view renders, with no resume card at all → AC-10
- [ ] Visit `/resume` directly with no profile row → redirected to `/profile` → AC-10
- [ ] Force the resume card's read to fail (temporarily break its query) → only the card shows a failure line; the rest of `/profile` (identity, skills, experience, preferences) renders normally → AC-10
- [ ] Read `docs/specs/0010-profile-entry/index.md` lines 23 and 218 → both now point at spec 0024, not "feature 26" → AC-14

## Commands

- [ ] `has_table_privilege('authenticated', 'resume_version', 'select')` and `'insert'` → true; `'update'`, `'delete'`, `'truncate'` → false; `has_table_privilege('anon', 'resume_version', 'select')` and `has_table_privilege('service_role', 'resume_version', 'select')` → both false → AC-11
- [ ] Insert a `resume_version` row directly as one profile, then attempt to `update` or `delete` it as that same profile through the Data API → refused by the missing grant, not by a policy (there is no update or delete policy to even evaluate) → AC-11
- [ ] Insert two rows for the same `profile_id` and `version_number` → refused by the unique violation, proving the constraint AC-9 depends on actually exists → AC-9, AC-11
- [ ] `pnpm test` → `stored-fields.test.ts` passes with `resume_version` and all five columns present under "Your resume"; delete one column's entry locally and confirm the suite fails → AC-12
- [ ] Read `src/features/legal/publication.ts` → the effective date reflects this change → AC-12
- [ ] Run the markdown renderer's own safety test (once written) → content containing `<script>`, a `javascript:` link, and an `https` image produces output with none of the three; break `disallowedElements` locally and confirm the image assertion then fails → AC-13
- [ ] Read the renderer's own module and its callers → no `"use client"` directive anywhere in the chain, and the conflict pane's raw text render never imports it → AC-13, Feature design
- [ ] Run the resume feature's own unit and DOM tests (once written) → `previousVersionNumber` semantics, the dirty check baseline, the `ResumeSaveState` conflict shape, and the seed template each have a passing, previously-broken-on-purpose test → AC-2, AC-3, AC-9

## Value sourcing

One step per row of the spec's Value sourcing table, exercising the edge that breaks if the source is wrong.

- [ ] Seed source: add a skill and a role to the profile, then open a fresh (never saved) editor → both appear in the seed, in the documented order and shape → AC-2
- [ ] Contact line source: confirm no seed ever contains the sign in email, under any account → AC-2
- [ ] `version_number` source: after restoring an old version and editing it, confirm the saved row's `version_number` is `current + 1`, not `restored + 1` → AC-9
- [ ] `previousVersionNumber` source: read the hidden field's rendered value on a freshly loaded editor (view source or dev tools) → it equals the profile's actual current `MAX(version_number)` at that moment, regardless of which version's text is shown → AC-9
- [ ] Conflict payload source: force a conflict and confirm `currentVersionNumber` and the displayed raw text both come from the one follow up read of the actual winning row, not from stale data held from before the insert attempt → AC-9
- [ ] Dirty check baseline source: fail a save (over length content), confirm the field's `defaultValue` is now the echoed typed text, and confirm the dirty check still reports true against the original fixed baseline, not against that new `defaultValue` → AC-3, AC-7
- [ ] Card read source: change the resume, reload `/profile` → the card's version number and date match `/resume`'s own current version exactly, not a cached or separate read → AC-10

## Added by /develop, 2026-09-30

Three steps the build surfaced that the design time list above does not cover.

- [ ] With a resume saved, visit `/resume?edit=resume&from=<a uuid that is not one of this caller's own versions>` → "That version is no longer there." sits above the REAL plain view (the current version rendered, "N versions saved"), never above "You haven't written a resume yet." (the build's own browser pass caught exactly that; locked by `src/app/(app)/resume/page.test.ts`) → AC-8
- [ ] Submit a blank save → only `COPY-10` shows, on the field, with no sentence above it; then tamper `previousVersionNumber` to a non numeric value with valid text → `COPY-33` shows above the field and no field message appears (the two are never shown together) → AC-3
- [x] Once the migration is applied to the hosted development project, run spec 0024 Build plan step 11 there: `has_table_privilege` shows `authenticated` holding select and insert only, a manufactured duplicate `(profile_id, version_number)` insert is refused with `23505`, and deleting a profile removes its `resume_version` rows → AC-9, AC-11 · **passed on jobhunt-dev on 2026-10-01**, run by the engineer as [verify.sql](verify.sql) in the SQL editor after pull request #160's `db-migrate` job logged `Applying migration 20260930120000_resume_version.sql`: 19 rows, one fact line (0 `resume_version` rows before) and 18 ending in `pass`, no `FAIL`, with the truncate line reading "refused by the missing grant [42501]", so the privilege gap is closed on the hosted project and not only locally. All three closing lines clean (0 throwaway auth rows, 0 `resume_version` rows after). The script was proved locally first, and broken on purpose: with `truncate` granted back it reported exactly 2 `FAIL` lines and attempted no truncate.

## Acceptance-criteria coverage

- AC-1 covered by the empty state manual step
- AC-2 covered by the seed template, empty sections, and over length seed manual steps, and the seed value sourcing steps
- AC-3 covered by the blank and over length manual steps, and the dirty baseline value sourcing step
- AC-4 covered by the two-saves-in-a-row manual step
- AC-5 covered by the rendered output and Edit-with-existing-resume manual steps
- AC-6 covered by the version list, Restore, and never-beside-a-dirty-editor manual steps
- AC-7 covered by the Cancel, reload, named-gap, and no-JavaScript manual steps, and the dirty baseline value sourcing step
- AC-8 covered by the malformed and foreign `from` manual steps
- AC-9 covered by the conflict, save-anyway, restore-then-save, and tampered-field manual steps, the version_number and conflict payload value sourcing steps, and the unique violation command step
- AC-10 covered by the card-with-resume, card-without-resume, no-profile, redirect, and card-failure-isolation manual steps, and the card read value sourcing step
- AC-11 covered by the `has_table_privilege` and update/delete refusal command steps
- AC-12 covered by the `stored-fields.test.ts` and effective date command steps
- AC-13 covered by the renderer safety test and the no-client-boundary command steps
- AC-14 covered by the spec 0010 citation manual step

## Not yet observed

Nothing yet: this file is written before the build. The two steps already marked **(browser only)** above (the `beforeunload` prompt and the `onNavigate` confirmation) cannot be driven by a server only test under any circumstance, not just "not yet"; they stay manual permanently, the same way spec 0023 keeps a real screen reader pass manual. `/check verify` should confirm them with a real browser rather than trying to script around that.
