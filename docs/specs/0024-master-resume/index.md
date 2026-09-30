# 0024. Master resume

**Date**: 2026-09-28
**Status**: In Progress

## Summary

This spec adds one canonical resume per user, kept as its own markdown text document rather than rendered from the profile tables. It is seeded once from the profile, editable at any time on its own `/resume` page, reached by a card on `/profile`, and every save keeps the old text rather than overwriting it, so a later feature can cite exactly which text a tailored version came from. Two tabs saving at once are caught by the database rather than by hoping nobody does that. Nothing here calls an outside service.

## Context

See [rationale.md](rationale.md).

## Requirements

**User stories**:

- As a signed in user with a profile, I want a resume seeded from what I already typed, so I do not start from a blank page.
- As a signed in user, I want to edit my resume's wording directly, since a resume needs sentences the profile tables were never built to hold.
- As a signed in user, I want my past resume text kept, not overwritten, so an earlier version is never simply gone.
- As a signed in user editing from two tabs, I want to be told when my save would silently replace someone else's more recent edit (my own, from the other tab), rather than losing it without knowing.

**Out of scope**: rendering a tailored, per listing resume (feature 25), extracting a profile from an uploaded resume (feature 36, which does overwrite this feature's canonical version outright per the resume permanence decision already recorded in `docs/scope/scope.md` under feature 24), and a rendered live preview while typing (the view state renders the saved version; the editor is plain text).

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: A signed in user with a profile row and no resume version yet sees, at `/resume`, an empty state naming that no resume exists yet, with a control to start from their profile.
- **AC-2**: Opening the editor (`/resume?edit=resume`) with no resume version yet prefills the textarea with exactly this template, built from the profile: a line with `full_name`, then `location` on its own line if present; a blank line, then `summary` as a paragraph if present; a `## Skills` heading followed by one bullet per `profile_skill.name` (omit the whole heading if there are no skills); a `## Experience` heading with one entry per `work_experience` row, most recently started first, each as `**title** — company (started month year – ended month year, or "Present" when `ended_on` is absent)` followed by its `description` as a paragraph if present (omit the whole heading if there is no work history); and a `## Education` heading with nothing under it, always present. Month names and ordering match `src/features/profile/calendar.ts`; `work_experience.location` is not included, matching AC-18's existing "no role or years field" restraint on showing only what the profile actually models. The seed carries no contact line: `public.profile` has no email or phone column, and the sign in email belongs to authentication, not to a value this feature was given. If the seed itself is over 20000 characters (a summary and several long descriptions together can exceed it), it is not truncated; it renders in full and Save fails with the ordinary AC-3 over length error until the reader trims it, so nothing already typed into the profile is silently dropped. Nothing is written to `resume_version` until Save succeeds.
- **AC-3**: `content` is required (not blank after trimming) and at most 20000 characters, refused by the database as well as by a Zod parse at the boundary. A submission failing either rule writes nothing and returns a visible error with the typed text kept in place, via the editor's own `useActionState` return value (see Feature design).
- **AC-4**: Saving valid content when no version exists creates version 1. Saving again, with no conflict (AC-9), creates the next version in sequence. No row in `resume_version` is ever updated or deleted; every save is an insert.
- **AC-5**: The plain view at `/resume` (no `edit` parameter) shows the current version's content rendered from markdown to formatted output (headings, lists, emphasis), never the raw `**`/`#` characters, plus when it was last saved and how many versions exist in total, and an "Edit" control opening `/resume?edit=resume`. Opening the editor with `from` absent prefills the current version's text when one exists (AC-2 covers the case where none does); `from=profile` prefills the profile seed instead, regardless of whether a resume already exists, and is what the empty state's own "Start from my profile" control (AC-1) and the plain view's own "start from my profile again" control both link to. An unrecognised `edit` value renders the plain view, never an error page, the same fallback rule spec 0010 AC-13 already uses for an unrecognised state. (A malformed or foreign `from` value is AC-8's case, not this one.)
- **AC-6**: The plain view also lists every version, newest first: its version number, when it was saved, and a Restore control opening `/resume?edit=resume&from=<versionId>`. The current version is visibly marked as current. No version is ever hidden by a page limit. Nothing is written by viewing this list or following a Restore link; the editor only prefills. Restore and "start from my profile" live only on the plain view, never beside an open editor, so neither control can ever be reached while unsaved text exists in the editor (AC-7 covers what can).
- **AC-7**: Leaving the editor while its text differs from what it was loaded with warns before the loss. Two mechanisms cover this, because the app mixes real page loads with client routed transitions: a `beforeunload` prompt (the browser's own generic warning, available because the editor is a client component) covers reloading, closing the tab, and typing a different address; and the editor's own Cancel control, an ordinary `next/link` Button (the only exit control the editor itself renders; Edit and Restore live on the plain view per AC-6 and are never reachable from inside a dirty editor, so neither needs this guard), supplies an `onNavigate` handler that, when the editor is dirty, asks for confirmation before letting the client side transition proceed, and lets it proceed unasked when the editor is not dirty. **What neither mechanism reaches, named together rather than scattered:** the shared app header's Search, Profile and logo links (client routed, outside this feature's own controls), the Sign out control (a Server Action form handled client side when JavaScript runs), and the browser's Back or Forward button (a `popstate` transition that fires neither `beforeunload` nor `onNavigate`). Leaving through any of these three loses unsaved text silently. With JavaScript disabled, `onNavigate` never runs and `beforeunload` is the only guard modern browsers still honour, itself only as a generic prompt with no custom wording; the loss is otherwise silent, the same as leaving any ordinary form.
- **AC-8**: A `from` reference naming a version id that is malformed, or is not one of the caller's own rows, renders the plain view with a visible line saying the version is no longer there, the same answer spec 0010 AC-13 gives a stale work history entry, never a blank or broken form.
- **AC-9**: Saving content submitted against a version number that is no longer current (this profile's row for that exact next version number already exists, from a save in another tab) is refused by the `resume_version` unique constraint on `(profile_id, version_number)`. This is not a `Failure`: it is the database doing exactly what it is asked, so the action returns a `ResumeSaveState` with `status: "conflict"`, carrying `currentVersionNumber` and the newer version's own raw text, per `src/lib/result.ts`'s rule that a refusal which is the system working as designed is never a `Failure` (binding rule 3). This follows the same principle spec 0011 AC-5 and spec 0021's refresh apply for a gate refusal, a named outcome that is not a `Failure`, even though `ResumeSaveState` is its own type shaped for `useActionState` rather than the plain `Result` union those two return directly. The hidden `previousVersionNumber` field the form submits is always the profile's current `MAX(version_number)` **as read when the editor loaded**, never the version number of whichever text happens to be displayed; restoring an old version and saving it still submits the *current* number, so a restore is never mistaken for a conflict against the very version it was restored from. The first save from a profile with no prior version submits `previousVersionNumber = 0`, a value `version_number` can never hold (checked `> 0`), so the very first save is never mistaken for a conflict either. On a conflict, the reader keeps their typed text, still editable, sees the newer version's own raw text displayed read only beside it (not rendered, so the comparison is markdown to markdown), and gets a "Save my text as a new version anyway" control that resubmits with `previousVersionNumber` set to the `currentVersionNumber` the conflict reported.
- **AC-10**: `/profile` gains a resume card showing when the resume was last updated and how many versions exist (or that none exists yet), with a link into `/resume`. It renders only once a profile row exists: in the identity only, no profile yet state (spec 0010 AC-1), no other section card renders, and this one does not either. Reaching `/resume` directly with no profile row redirects to `/profile`. If reading the resume for the card fails, only the card shows a failure line; the rest of `/profile` renders normally.
- **AC-11**: `resume_version` has row level security enabled and forced. `authenticated` is granted `select` and `insert` only, with no `update` and no `delete` grant at all, confirmed directly with `has_table_privilege` the same way spec 0003 confirms `anon` and `service_role` hold nothing. The table carries a `select` policy and an `insert` policy, both keyed on `(select auth.uid()) = profile_id`, and no `update` or `delete` policy. `profile_id` references `profile(id) on delete cascade`, so deleting a profile removes its whole resume history.
- **AC-12**: `resume_version` and all five of its columns (`id`, `profile_id`, `version_number`, `content`, `created_at`) are registered in `src/features/legal/stored-fields.ts` in the same change that adds the migration, under a new "Your resume" heading placed after "Your work history" in `PERSONAL_DATA_TABLES`, so `stored-fields.test.ts` passes rather than failing on an unclassified table. The `content` column is described honestly as free text the reader wrote, which may include contact details or anything else they chose to type, not as a narrower list the column does not actually enforce. The privacy notice's effective date is bumped, since a new stored table is a material change to what it describes.
- **AC-13**: The shared markdown renderer (used only by this feature's own view state and reused unmodified by features 25 and 36; it never runs in the browser, see Feature design) is proven safe by a real test asserting three things against the real renderer: a script tag typed into the source does not reach the output as an executable element (react-markdown never parses raw HTML from markdown text into real elements unless `rehype-raw` is added, which this renderer never does); a `javascript:` link URI is rejected rather than rendered as a clickable `href` (react-markdown 10.1.0's own default `urlTransform` allows only `http`, `https`, `irc`, `ircs`, `mailto`, `xmpp` and protocol relative URLs, verified against its published source on 2026-09-28, so no extra configuration is needed for this); and an image, even one with an otherwise safe `https` URL, does not render at all, because `disallowedElements={["img"]}` is set explicitly, since the default URL transform alone does not stop a legitimate looking external image from loading and acting as a tracking beacon. It lives under `src/lib`, takes only the markdown text, and exposes no option that could re-enable raw HTML, an unsafe URL scheme, or images.
- **AC-14**: Spec 0010's two references to education belonging to "feature 26" (`index.md` lines 23 and 218) are corrected in this change to point at this spec, since feature 26 was dropped and split on 2026-09-22 into rows that do not include education. Education has no profile table: it exists only as a heading inside the resume's own text (AC-2), a decision recorded here rather than left as a gap the next reader has to re-raise.

## Options considered

See [rationale.md](rationale.md).

## Decision

**Chosen option**: Option 1: a separate, versioned markdown document, seeded once from the profile and never synced back to it.

The canonical resume is its own text, stored as an append only sequence of immutable versions in a new `resume_version` table, edited on a dedicated `/resume` page reached by a card on `/profile`. The profile tables are read once to seed the first version and never again; nothing about editing the resume changes the profile, and nothing about editing the profile changes an already saved resume. The editor is a client component using `useActionState`, the same pattern spec 0010 already built for every profile form, because keeping 20000 characters of typed text across a failed or conflicted submit needs the action's own return value, exactly as spec 0010's own forms already do.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning, the options weighed, and references: see [rationale.md](rationale.md).

## Copy

**Written by the engineer, used verbatim**, the same rule spec 0007, spec 0010 and spec 0023 already state for their own `## Copy` tables: `/develop` must not invent or reword any of these, and spec 0007's punctuation rule applies with no carve out (no em dashes, no en dashes, no semicolons). These land in a new `src/features/resume/copy.ts`, this feature's own file rather than `src/features/profile/copy.ts` (folder by feature; the two features share no state or copy module even where the shapes rhyme), so numbering restarts at this spec's own `COPY-1` with no collision to avoid. The file gets its own `copy.test.ts` with an `EVERY_SLOT` array, the same guard spec 0010's and spec 0023's copy files carry, enforcing the punctuation rule and that no slot is left blank.

The one numeric value quoted below (the 20000 character ceiling) is not copy: it is a named constant `saveResumeVersion()` and its Zod schema both import, never hardcoded twice in a string here, the same discipline spec 0023's `limits.ts` established for its own quoted numbers.

| ID | Context | Text |
|---|---|---|
| `COPY-1`, `emptyState` | `/resume` with no resume version yet (AC-1) | `You haven't written a resume yet.` |
| `COPY-2`, `startFromProfileLabel` | The control that opens the editor seeded from the profile, on the empty state and, unchanged, on the plain view once a resume already exists (AC-1, AC-5) | `Start from my profile` |
| `COPY-3`, `editLabel` | The plain view's control opening the editor on the current version (AC-5) | `Edit` |
| `COPY-4`, `restoreLabel` | Each version list row's control (AC-6) | `Restore` |
| `COPY-5`, `currentVersionLabel` | The marker on the version list row that is the current version (AC-6) | `Current` |
| `COPY-6`, `versionGone` | A `from` reference that is malformed or not the caller's own (AC-8) | `That version is no longer there.` |
| `COPY-7`, `conflictMessage(versionNumber)` | The conflict state, above the newer version's own raw text (AC-9) | `Someone (likely you, in another tab) saved version ${versionNumber} while you were editing. Here's what it says now:` |
| `COPY-8`, `saveAnywayLabel` | The conflict state's resubmit control (AC-9) | `Save my text as a new version anyway` |
| `COPY-9`, `leaveWithoutSavingConfirm` | The `onNavigate` confirmation before Cancel discards unsaved text (AC-7); the separate `beforeunload` path shows the browser's own generic prompt, which no modern browser lets a page customise | `Leave without saving? Your changes to this resume will be lost.` |
| `COPY-10`, `blankContent` | Save refused for blank (or whitespace only) content (AC-3) | `Write something before saving your resume.` |
| `COPY-11`, `tooLongContent(max)` | Save refused for content over the character ceiling (AC-3) | `Keep your resume to ${max} characters or fewer.` |
| `COPY-12`, `resumeCard(versionNumber, date)` | The `/profile` resume card, once a resume exists (AC-10) | `Resume: version ${versionNumber}, last updated ${date}.` |
| `COPY-13`, `resumeCardEmpty` | The `/profile` resume card, before any resume exists (AC-10) | `No resume yet.` |
| `COPY-14`, `pageHeading` | The `/resume` `h1`, in every state (AC-1, AC-5) | `Resume` |
| `COPY-15`, `editorHeading` | The `h1` while the editor is open (AC-2, AC-5) | none, deliberately: the editor reuses `COPY-14` (see below) |
| `COPY-16`, `savedSummary(date, count)` | The plain view, under the heading (AC-5) | `Last saved ${date}. ${count} version${count === 1 ? "" : "s"} saved.` |
| `COPY-17`, `versionsHeading` | The `h2` above the version list (AC-6) | `Versions` |
| `COPY-18`, `versionRow(versionNumber, date)` | Each version list row (AC-6) | `Version ${versionNumber}, saved ${date}` |
| `COPY-19`, `restoreAccessibleName(versionNumber)` | The accessible name of each Restore control, whose visible label is `COPY-4` on every row (AC-6) | `Restore version ${versionNumber}` |
| `COPY-20`, `editorLabel` | The textarea's label, including during a conflict (AC-2, AC-3, AC-9) | `Your resume` |
| `COPY-21`, `editorHint` | Under the editor label (AC-2) | `Markdown formatting works here. Headings start with ## and bold text is wrapped in **.` |
| `COPY-22`, `saveLabel` | The editor's submit control (AC-4) | `Save` |
| `COPY-23`, `cancelLabel` | The editor's exit control, the one carrying `onNavigate` (AC-7) | `Cancel` |
| `COPY-24`, `conflictTextLabel` | The accessible name of the read only newer text (AC-9) | none, deliberately: the newer text is labelled by `COPY-7` (see below) |
| `COPY-25`, `resumeCardHeading` | The resume card's heading on `/profile` (AC-10) | none, deliberately: the card has no heading (see below) |
| `COPY-26`, `resumeCardLinkLabel` | The card's link into `/resume` (AC-10) | with a resume, `Open your resume`, and with none yet, `Write your resume` |
| `COPY-27`, `readFailed` | `/resume` when a read fails: the plain view, the editor prefill by version id, or the profile seed read, answering `database_unavailable`, `response_malformed` and `external_service_failed` (AC-2, AC-5) | `We couldn't load your resume. Nothing has been lost, and trying again usually works.` |
| `COPY-28`, `readFailedRetry` | The control under `COPY-27`, reloading `/resume` (AC-5) | `Try again` |
| `COPY-29`, `cardReadFailed` | The resume card's own failure line on `/profile`, answering the same three kinds as `COPY-27`; the rest of `/profile` renders normally (AC-10) | `We couldn't load your resume just now.` |
| `COPY-30`, `saveSessionMissing` | The editor, above the field, answering `session_missing` from the action's own caller check (AC-3) | `Your session has expired, so nothing was saved. Copy your text somewhere safe, then sign in again.` |
| `COPY-31`, `saveProfileMissing` | The editor, above the field, answering `record_not_found` (no profile row, or a `23503` when the profile is deleted mid edit) (AC-3) | `We couldn't find your profile, so there is nothing to attach this resume to. Open your profile, save it, then try again.` |
| `COPY-32`, `saveUnavailable` | The editor, above the field, answering `database_unavailable` (including a failure of the conflict payload's follow up select) and `external_service_failed` (AC-3, AC-9) | `We couldn't save your resume just now. Your text is still here, so try again in a moment.` |
| `COPY-33`, `saveValidationMessage` | The editor, above the field, answering `validation_failed` only when no field message applies: a malformed `previousVersionNumber` (AC-3). Never shown alongside `COPY-10` or `COPY-11`, which already sit on the field for blank or over length content | `We couldn't read that save, so nothing was written. Copy your text somewhere safe, then reload this page.` |

Three slots hold no text on purpose, and each is a decision rather than an omission:

- **`COPY-15`, no editor heading.** The editor is a state of the same page, so its `h1` stays `COPY-14`. A second heading would give one route two outlines for no gain to the reader.
- **`COPY-24`, no separate label for the newer text.** `COPY-7` sits directly above the read only text and already says what it is, so the text is labelled by that sentence (for example with `aria-labelledby`) rather than by a second string saying the same thing.
- **`COPY-25`, no card heading.** `src/features/profile/copy.test.ts` pins `/profile` at one `h1` and four `h2` headings (spec 0010 AC-17). A fifth heading would mean amending that spec and its test for a card whose text already opens with "Resume:" (`COPY-12`), so the card renders its sentence and its link with no heading.

## Feature design

**Data model sketch**

`resume_version` (append only; a row is never changed or removed once written)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | Primary key, `gen_random_uuid()`. |
| `profile_id` | uuid | yes | References `profile(id)` on delete cascade. Indexed by the unique constraint below. |
| `version_number` | integer | yes | Starts at 1 per profile, increases by 1 per save. Check `version_number > 0`. |
| `content` | text | yes | The resume, as markdown, stored and shown exactly as written (AC-13's renderer formats it for display; nothing rewrites the stored text). Check `length(btrim(content)) > 0` (mirrors `profile.full_name`'s own non blank rule) and `char_length(content) <= 20000`. |
| `created_at` | timestamptz | yes | Defaults to now. The only timestamp this table needs: there is no `updated_at`, because a row is never updated. |

Unique constraint on `(profile_id, version_number)`. This is the whole mechanism behind AC-9: two saves racing to write the same next version number cannot both succeed, and the one that loses is told so rather than silently overwriting. It is also the index that serves both reads this feature needs (the current version, and the version list in order): a unique constraint on `(a, b)` is a btree ordered by `(a, b)` ascending, and Postgres serves `MAX(version_number) WHERE profile_id = X` and `ORDER BY version_number DESC WHERE profile_id = X` equally cheaply by scanning that same index backwards. No second index is added.

Ownership chain: `profile` (already spec 0003) gains one more child, `resume_version`, cascading the same way every other child table does.

**State transitions**

None as a state machine, but a shape worth naming since it is easy to misread as one: `resume_version` only ever grows. "Current" is not a stored flag, it is `MAX(version_number)` for the profile, computed at read time. The unique constraint on `(profile_id, version_number)` is a hard database guarantee: it is what makes two racing saves unable to both claim the same number, which is the whole of AC-9. That the sequence stays dense from 1 with no gaps is kept by the application (every save computes `previousVersionNumber + 1`), not separately enforced by the database against a caller who used their own session to call the Data API directly rather than this feature's own action; that would only let a user's own resume history gain a gap or an out of order timestamp, never let one user reach another's data, so it is accepted rather than defended against with a trigger. A trigger that computed the next number itself was considered and rejected: it would make two racing saves both succeed as consecutive numbers with no violation, silently defeating the whole point of AC-9, which depends on the caller's own guess about the current version being checked, not corrected.

**Editor state (`ResumeSaveState`)**

A dedicated type in `src/features/resume/form-state.ts`, not a reuse of `src/features/profile/form-state.ts`'s `ActionState` (folder by feature: the two features share no state module, even though the shapes rhyme):

```ts
interface ResumeSaveState {
  readonly status: "idle" | "failed" | "conflict";
  readonly message?: string;
  readonly errors: Readonly<Record<string, string>>;
  readonly values: Readonly<Record<string, string>>; // submitted content, echoed back
  readonly currentVersionNumber?: number; // present when status is "conflict"
  readonly currentVersionContent?: string; // present when status is "conflict"; raw text, never rendered
}
```

`saveResumeVersion(prevState: ResumeSaveState, formData: FormData): Promise<ResumeSaveState>` never returns on success; it redirects, the same rule `src/features/profile/actions.ts` already follows. The conflict branch's hidden `previousVersionNumber` field renders from `state.currentVersionNumber` when `status === "conflict"`, and from the value the editor loaded with otherwise, so there is exactly one field and "save anyway" is a plain resubmit of the same form, not a second control with its own field.

**Why the dirty check cannot read `defaultValue`.** React 19 resets an uncontrolled field's rendered value after an action returns, to whatever the new render passes as `defaultValue`, which after a failed or conflicted save is the echoed `state.values.content`, the reader's own just typed text (this is precisely why `src/features/profile/form-state.ts` exists, per its own doc comment: "the browser's own hold on an uncontrolled input's value covers the JavaScript path only", so the state carries the value back explicitly). If the unsaved changes check compared the textarea's live value against its own `defaultValue`, it would compare that echoed text against itself after any failed submit and report "not dirty" while genuinely unsaved text sits in the field. The baseline the dirty check compares against is therefore a fixed prop, the content the editor was loaded with (AC-2's seed, or the named version's text via `from`), captured once and never updated by a later render; a change in `from` (a different Restore target) remounts the editor with a fresh baseline via a `key` on the search parameter, rather than the same instance reusing stale state.

**API surface**

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/resume` (plain view) | Server Component read | none, caller from session | current version's rendered content, its `created_at`, version count, the full version list | signed in, verified independently per binding rule 6 | `session_missing` (expected), `record_not_found` when no profile row exists (expected, redirects to `/profile` per AC-10), `database_unavailable` (unexpected), `response_malformed` (unexpected) |
| `/resume?edit=resume[&from=<versionId\|profile>]` | Server Component read, rendering a client boundary (the editor) | `from`, a version id or the literal `profile` | the editor, its textarea prefilled per AC-2 or from the named version/profile, and the fixed baseline prop the dirty check reads | signed in | a malformed or foreign `from` value renders the plain view (AC-8) |
| `saveResumeVersion(prevState, formData)` in `src/features/resume/actions.ts` | Server Action write | `content: string`, a hidden `previousVersionNumber` field, parsed as a non negative integer (a non numeric value is `validation_failed`, not a raw database error) | on success, redirects to `/resume`; on conflict, a `ResumeSaveState` with `status: "conflict"` rendered inline by the editor; the caller's own `content` is always echoed back on any non redirect outcome | signed in, verified independently via `getClaims()` inside the action (never a caller supplied id), write confined to the caller's own `profile_id` by row level security | `session_missing`; `validation_failed` (blank content, over length content, or a non numeric `previousVersionNumber`, from the Zod parse, plus as a backstop if a `23514` check violation ever reaches the database call directly); `record_not_found` (no profile row, or a `23503` foreign key violation, e.g. the profile was deleted mid edit); `database_unavailable` (anything else, including a failure of the follow up `select` that builds the conflict payload); a `23505` unique violation on `(profile_id, version_number)` is the version conflict above and is never a `Failure` |
| `resume_version` | Postgres, through the Data API | per column above | rows the caller owns | `authenticated` role, `select` and `insert` policies only (AC-11) | permission denied for `anon`, unique violation on `(profile_id, version_number)` (the conflict AC-9 handles explicitly, never surfaced as a raw database error) |

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| profile seed (AC-2) | header block, skills, experience entries | `profile`, `profile_skill`, `work_experience` rows for the caller, formatted into the fixed markdown template AC-2 spells out |
| profile seed | contact line | deliberately none; `public.profile` has no email or phone column, and the sign in email is never copied in (AC-2) |
| profile seed | `Education` heading | a fixed literal heading with nothing under it (AC-14); no table backs it |
| create version (Save) | `profile_id` | `auth.uid()` from `getClaims()`, read inside the action itself, never a value the form submits |
| create version | `version_number` | one more than `previousVersionNumber` |
| create version | `previousVersionNumber` | the profile's current `MAX(version_number)` **read when the editor loaded**, a hidden form field; never the version number of the text being displayed, so restoring an old version still compares against what is actually current (AC-9) |
| create version | conflict detection | the unique constraint on `(profile_id, version_number)`; the action does not pre check with a `select`, since that would only move the race, not close it |
| create version | `currentVersionNumber`, `currentVersionContent` on a conflict | one follow up `select` of the row with the highest `version_number` for the profile, run only after the insert has already failed; `currentVersionContent` is the raw stored text, not passed through the renderer |
| plain view | current version, its `created_at` | the `resume_version` row with the highest `version_number` for the caller, read through the `resume.read` span |
| plain view | version count | `count(*)` on `resume_version` for the caller |
| plain view | rendered output | the shared markdown renderer (AC-13), fed the current version's `content` unmodified; this is the only place the renderer runs (it is a Server Component read, never shipped to the browser) |
| resume card on `/profile` | last updated, version count | the same plain view reads, reused rather than duplicated; a failure here is caught locally so it degrades only the card (AC-10) |
| editor prefill | which version or "your profile" | the `from` search parameter, parsed against a uuid or the literal `profile`, resolved against the caller's own rows only |
| editor prefill | the dirty check's fixed baseline | the same prefilled text, captured once as a prop when the editor mounts (keyed on `from`), never re-derived from the field's own `defaultValue` after a later render |
| unsaved changes warning (real page loads) | whether the editor is dirty | compared client side, the textarea's live value against the fixed baseline prop above |
| unsaved changes warning (Edit / Restore / Cancel) | whether to confirm before a client routed transition | the same dirty comparison, read inside each control's `onNavigate` handler |
| privacy notice (feature 21) | the resume's stored fields | this spec's data model, registered in `src/features/legal/stored-fields.ts` (AC-12) |

**Key invariants**

1. A `resume_version` row is never updated and never deleted. Enforced by granting `authenticated` no `update` and no `delete` privilege at all on the table, so the guarantee is a database property, not a rule application code is trusted to keep, and confirmed directly by `has_table_privilege` (AC-11).
2. `(profile_id, version_number)` is unique, a hard database guarantee that is what makes AC-9's conflict detection real. The sequence staying dense from 1 with no gaps is application logic, not separately enforced (see State transitions).
3. `content` is never blank and never exceeds 20000 characters, checked in Postgres and mirrored in Zod.
4. No row in `resume_version` is reachable by a user other than its owner (row level security, forced).
5. The rendered view never emits raw HTML, an unsafe URL scheme, or an image, from the stored `content` (AC-13); the renderer's own configuration is the only place that decision is made, so no caller can opt back into any of the three. The renderer itself never runs in the browser.
6. A save is never silently lost: it either becomes a new version or is refused as a named conflict with the text intact and the newer text visible (AC-9).
7. The conflict check always compares against the current version, never against whichever version's text happens to be on screen (AC-9).

**Security model**

- Reads and writes confined to the caller's own rows, predicate `(select auth.uid()) = profile_id`, the same pattern as every table in spec 0003.
- `select` and `insert` policies only; no `update` or `delete` policy exists, and neither privilege is granted to `authenticated`, matching `profile_skill`'s precedent of granting only the actions a table actually needs (spec 0003).
- `anon` and `service_role` hold nothing, same as every other table (spec 0003, AC-2).
- The resume body is free text the reader controls entirely. It is not sanitised or restricted at write time (this project stores values raw, per root `AGENTS.md`), so the privacy notice describes it as "whatever you write" rather than a narrower claim (AC-12). What is enforced is at render: never interpreted as HTML, never an unsafe link scheme, never an image (AC-13), which are display safety rules, not content restrictions.
- No new compliance scope: `resume_version` holds the same class of personal data (name, employment history, self description) the six existing tables already hold, under the same policies.

**Configuration required**

None. No new environment variable, secret, or third party credential. `react-markdown` and `remark-gfm` are ordinary npm dependencies, not credentials.

The load bearing strings themselves are `## Copy`, above; the date format used in `COPY-12` matches `/applications`' own existing display of `applied_at`.

**Critical test scenarios**

- Happy path, first resume: a profile with skills and experience opens `/resume`, sees the empty state, opens the editor, sees it prefilled per AC-2 with no contact line, edits, saves, and lands back on `/resume` showing version 1 rendered, verifies **AC-1**, **AC-2**, **AC-4**, **AC-5**.
- Immutability: after two saves, a direct query confirms `resume_version` holds two rows and neither's `content` has changed, and `has_table_privilege` confirms `authenticated` has no `update` or `delete` privilege on the table, verifies **AC-4**, **AC-11**.
- Conflict: two saves built against the same `previousVersionNumber` are submitted in sequence; the second is refused as a conflict, keeps its own typed text editable, shows the newer version's raw text inline with no navigation, and "save anyway" then succeeds as the next version, verifies **AC-9**.
- Restore then save is not a false conflict: with versions 1 through 5 saved, restoring version 2 and saving inserts version 6, not a conflict against version 3, proving `previousVersionNumber` tracks the current version rather than the displayed one, verifies **AC-9**.
- Unsaved changes warning, internal navigation: the editor is dirtied, then Cancel is clicked; a confirmation appears before the transition proceeds, and declining it leaves the editor exactly as typed, verifies **AC-7**.
- Unsaved changes warning, real navigation: the editor is dirtied, then the tab is reloaded; a `beforeunload` prompt is observed (proved with a real browser, since this cannot be driven from a server only test), verifies **AC-7**.
- Failed save stays dirty: submitting content over 20000 characters fails, the typed text is kept in the field exactly as typed, and the dirty check still reports the editor as unsaved afterward, proving the baseline is not re-derived from the echoed value, verifies **AC-3**, **AC-7**.
- Stale reference: a `from` value naming a version id that does not belong to the caller renders the plain view with the "no longer there" line, never a blank editor, verifies **AC-8**.
- No profile: a signed in caller with no profile row is redirected from `/resume` to `/profile`, and the identity only view renders no resume card, verifies **AC-10**.
- Security: `has_table_privilege` confirms `anon` and `service_role` hold nothing on `resume_version`, and `authenticated` holds exactly `select` and `insert`, verifies **AC-11**.
- Render safety: the shared markdown renderer, given content containing `<script>`, a `javascript:` link, and an `https` image, produces output containing none of the three, verifies **AC-13**.
- Legal registry: `pnpm test` fails if `resume_version` or any of its columns is removed from `stored-fields.ts` without the corresponding schema change, and passes as shipped, verifies **AC-12**.

## Build plan

Tracer Bullet, the project's default: land the whole vertical thread (schema through a real save and a real render) before thickening it with restore, conflicts, and the profile card.

1. Write the migration: `resume_version` with its checks, the unique constraint, `enable`/`force row level security`, the explicit `grant select, insert` to `authenticated` and nothing else, and the `select`/`insert` policies. Regenerate `src/lib/supabase/database.types.ts`. Satisfies **AC-11**.
2. Register `resume_version` and its columns in `src/features/legal/stored-fields.ts` under the new "Your resume" heading, and bump the privacy notice's effective date in `publication.ts`. Satisfies **AC-12**.
3. Add `src/features/resume/copy.ts` (`## Copy`'s `COPY-1` through `COPY-33`, verbatim, less the three slots recorded there as holding no text) and its own `copy.test.ts` with an `EVERY_SLOT` array, the same guard `src/features/profile/copy.test.ts` runs. Satisfies the `## Copy` contract feeding every later step below.
4. Add the shared markdown renderer under `src/lib` (`react-markdown` plus `remark-gfm`, no `rehype-raw`, `disallowedElements={["img"]}`, no caller configurable options), with the injection test from AC-13 (script, `javascript:` link, image) written and proven to fail against a naive stand in before it passes against the real renderer. Confirm in this step that it renders with no `"use client"` boundary of its own, and that nothing else in this feature imports it into a client component (the conflict pane shows raw text, not the rendered version, precisely to keep this true). Satisfies **AC-13**.
5. Add `src/features/resume/` queries (current version, version count, version list, one version by id scoped to the caller, the `resume.read` span registered in `docs/observability/spans.md`) and the profile seed function (profile plus skills plus experience, formatted to markdown, per AC-2's exact template). Satisfies **AC-2**, **AC-5**, **AC-6**.
6. Add `src/features/resume/form-state.ts` (`ResumeSaveState`, distinct from the profile feature's `ActionState`) and `saveResumeVersion()` in `src/features/resume/actions.ts`: the `resume.save_version` span as its first statement (`db.query`), the session check, the Zod parse (blank or over length content, `previousVersionNumber` as a non negative integer), the insert against `previousVersionNumber + 1`, mapping `23505` to the conflict state (with the follow up select for `currentVersionNumber`/`currentVersionContent`, both fed straight into `ResumeSaveState`), `23503` to `record_not_found`, `23514` to `validation_failed`, and anything else to `database_unavailable`. On success it calls `revalidatePath` for `/resume` and `/profile` inside the span, then `redirect("/resume")` outside it (a `redirect()` inside the span would record the operation as failing at the moment it succeeded), the same order all six actions in `src/features/profile/actions.ts` follow: each calls `revalidatePath("/profile")` before its `redirect`. (Corrected 2026-09-30: this step previously said no cache invalidation was needed, "the same as every other profile action", which was false.) Register the span; no alert is built on it yet, and a conflict must never be added to one later, since it is the system working correctly, matching `search.run`'s treatment of a gate refusal. Satisfies **AC-3**, **AC-4**, **AC-9**.
7. Add `src/app/(app)/resume/page.tsx` and the client component editor (`"use client"`, `useActionState`, mirroring `identity-form.tsx`): the plain view (empty state, or the rendered current version plus the version list with the current one marked, an Edit control, and Restore controls, none of which sit beside an open editor per AC-6), the editor prefilled per AC-2 or from `from` with a fixed baseline prop keyed on `from`, the `beforeunload` guard comparing the live value to that baseline, and the same dirty check wired into the editor's own Cancel control's `onNavigate` handler (the only exit control the editor itself renders). Compose `AppHeader` with no `current` (matching `/applications` and `/health`). Redirect to `/profile` when no profile row exists. Satisfies **AC-1**, **AC-5**, **AC-6**, **AC-7**, **AC-10**.
8. Render the conflict state inline in the editor from the action's returned `currentVersionContent` as raw, unrendered text, with the "save anyway" resubmit control reusing the single `previousVersionNumber` field. A malformed or foreign `from` value renders the plain view with the AC-8 line. Satisfies **AC-8**, **AC-9**.
9. Add the resume card to `/profile`, reusing the same reads as step 7, rendered only once a profile row exists, with its own failure isolated to the card. Satisfies **AC-10**.
10. Correct spec 0010's two "feature 26" references (`index.md` lines 23 and 218) to point at this spec. Satisfies **AC-14**.
11. Prove the constraint sweep by hand against the real development project: the immutability grant check, the unique violation on a manufactured conflict, and the cascade from deleting a profile. Satisfies **AC-9**, **AC-11**.

## Consequences

**Positive**

- The resume gets real prose (bullets, phrasing, education) with no pressure to bend the profile tables to hold it.
- Every save is recoverable: nothing is ever destructively edited, which is what lets feature 25 cite an exact version later.
- Two tabs can never silently clobber each other; the failure is visible, the newer text is shown, and nothing typed is lost.
- Features 25 and 36 inherit a working, safety tested markdown renderer and a resume table already shaped for a snapshot to point at.

**Negative and tradeoffs**

- Every save writes the whole document again, not a diff. At 20000 characters a version, this is cheap for one person's history, but it is a real, named cost, not a free one: storage grows with `versions × up to 20000 characters`, unbounded, since nothing here prunes old versions. Revisit if it ever matters; the fix is an explicit retention decision, not a schema change.
- The resume and the profile can now say different things (a skill added to the profile does not appear on an already saved resume) by design; this is the cost of "seeded once, never synced" and is what feature 24's own resume permanence decision already chose over the alternative.
- The version list has no page cap. Fine at this scale; if a reader ever accumulates enough versions for it to matter, the fix is an `ORDER BY version_number DESC LIMIT n` plus a count, not a schema change.
- **The unsaved changes warning has a named, accepted blind spot**: the shared app header's Search, Profile and logo links, the Sign out control, and the browser's Back or Forward button all leave a dirty editor with no warning at all (AC-7). Closing the header and Sign out gap would mean adding navigation guarding to shared chrome every other page also uses; closing Back would mean abandoning client routing for this one page. Both were weighed and declined; see Rationale.
- `react-markdown` and `remark-gfm` are new dependencies, both last released in early 2025 with no release since (checked 2026-09-28). Accepted rather than missed: see References.
- Feature 25's scope row (`docs/scope/scope.md`) currently describes its numeral check as testing bullets against "the user's own profile data". Once the master resume is its own document, a resume can honestly state a number that exists on the resume but not in any profile table (a graduation year, a GPA, a team size). This spec settles the corpus that check must use: the current master resume version's text, not the profile tables. The scope row's wording is stale against that and needs a `/scope` pass to reword it; not corrected here, since scope.md is `/scope`'s file, not this spec's.

**Neutral**

- A new route, `/resume`, reached only by a link on `/profile`, the same placement spec 0008 already uses for `/applications`; the signed in navigation stays at two items, spec 0008 AC-1 and AC-4 are untouched.
- A new feature directory, `src/features/resume/`, alongside `profile` rather than inside it, since the editor, its version list, and its confirmation states are a materially different surface from the four existing profile sections.
- This feature's editor is a client component, the same as every existing profile form; nothing here is a new pattern for this codebase.

## Follow-up

- [ ] `docs/scope/scope.md` feature 25's wording ("drops any bullet containing a number not present in the user's own profile data") needs correcting through `/scope` to name the master resume's current version text as the check's corpus, per this spec's Consequences.
- [ ] Feature 25 (resume tailoring) and feature 36 (resume upload with extraction) both reuse the `src/lib` markdown renderer this feature adds; neither should add its own.
- [ ] Feature 36's upload overwrites this feature's canonical version outright, per the resume permanence decision already recorded under feature 24 in `docs/scope/scope.md`; it still needs to decide whether an overwrite starts a new `resume_version` row (consistent with "append only, never overwritten") or is itself a distinct action, since that decision belongs to feature 36's own design.
- [ ] If a Sentry alert is ever built on the `resume.save_version` span, confirm a version conflict outcome is excluded from its numerator by construction (it is a `ResumeSaveState`, never a `Failure`, so it cannot appear there by accident, but a future alert built on span status alone rather than on `Failure` kind should still double check this).
- [x] `COPY-14` to `COPY-33` were added on 2026-09-30, during the build, because the `## Copy` table missed twenty of the page's strings. The table had been promoted into its own section during the design pass, with the verbatim rule and thirteen slots, and still missed them, because it was written from the strings that came to mind rather than derived from each acceptance criterion's rendered surfaces. A later spec's Copy table should be built by walking every surface each AC renders (headings, labels, controls, accessible names, and one message per failure kind the surface can show).
- [ ] AC-7's named gap (the app header's client routed links, Sign out, and the browser's Back/Forward do not trigger any unsaved changes warning) is accepted here as out of proportion to fix for one page; revisit only if it causes a real reported loss.

## References

**Project sources** (verifiable, in this repo):
- Root `AGENTS.md`, the functional/immutable rule, the folder by feature rule, and the RLS on every table rule
- `src/components/ui/AGENTS.md:7`, the design system boundary a shared renderer must stay outside of
- `src/lib/result.ts:14` to `24`, the rule that a refusal which is the system working as designed is never a `Failure`
- Spec [0003](../0003-data-model/index.md), the data model conventions (RLS shape, trigger, cascade pattern) this feature's table follows
- Spec [0010](../0010-profile-entry/index.md), AC-1 (no other section card before a profile exists), AC-10 (no row until an explicit first save), AC-13 (a stale or malformed reference renders the plain view with a visible line), and its Consequences and `src/features/profile/form-state.ts`'s own doc comment (its forms are client components using `useActionState` specifically because the browser's own hold on an uncontrolled field covers only the JavaScript path, the same reasoning this spec's dirty check baseline rests on)
- Spec [0008](../0008-app-shell-and-navigation/index.md), AC-1, the precedent for a route reached by a link on `/profile` rather than added to the navigation
- Spec [0021](../0021-seeded-demo-account/index.md), the principle of a success carrying a named outcome for a refusal that is not a `Failure`
- `src/features/legal/stored-fields.ts`, the privacy registry a new personal data table must satisfy
- `src/components/ui/button.tsx`, confirming an `href` Button renders through `next/link` (client routed)
- `node_modules/next/dist/client/app-dir/link.d.ts`, confirming `next/link`'s `onNavigate` handler, the mechanism this spec uses to guard a client routed exit from the editor without falling back to a full page load

**Practices & standards**:
- Append only, immutable version history, enforced by withheld database privilege rather than by convention
- Optimistic concurrency via a unique constraint on a caller supplied version number, refusing a stale write rather than silently overwriting it
- The browser's native `beforeunload` prompt, and the router's own pre navigation hook, for an unsaved changes warning, rather than a custom modal

**Links** (checked 2026-09-28):
- react-markdown 10.1.0 (published 2025-03-07): https://www.npmjs.com/package/react-markdown/v/10.1.0
- react-markdown 10.1.0's own README, the basis for "safe by default, no `dangerouslySetInnerHTML`, raw HTML needs `rehype-raw`": https://unpkg.com/react-markdown@10.1.0/readme.md
- react-markdown 10.1.0's published source for `defaultUrlTransform`, confirming the allowed protocol list (`http`, `https`, `irc`, `ircs`, `mailto`, `xmpp`, and relative URLs) that AC-13 rests on: https://raw.githubusercontent.com/remarkjs/react-markdown/10.1.0/lib/index.js
- remark-gfm 4.0.1 (published 2025-02-10): https://www.npmjs.com/package/remark-gfm/v/4.0.1
