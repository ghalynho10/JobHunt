# 0010. Profile entry

**Date**: 2026-09-01
**Status**: In Progress

## Summary

This spec is the form that lets a signed in user type in their profile: personal details, skills, work history and job preferences, so scoring later has something real to read. It builds the first write path onto the four tables spec 0003 already applied. The page is view first, not a form filled once: each of the four sections (identity, skills, experience, preferences) saves on its own, editable at any time. Nothing here calls an outside service, and no new schema is added.

## Context

See [rationale.md](rationale.md).

## Requirements

**User stories**:

- As a signed in user, I want to enter and edit my personal details, skills, work history and job preferences so that search and scoring later have something real to read.
- As a signed in user, I want my profile to survive a reload and to stay editable, not just filled once and never seen again.
- As a signed in user, I want a mistake I typed to be shown to me and correctable, not silently discarded.
- As a signed in user, I want a work history entry I added by mistake to be removable, not stuck on my profile forever.

**Out of scope**: education (no table exists for it; belongs to feature 26), matched or missing skill display (that is feature 14's scoring output), and any role or years of experience field (public.profile has no columns for them). See AC-18.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: A signed in user with no profile row sees only the identity section open for editing (full_name, location, summary) on `/profile`. No other section card renders; a single plain text line names what comes next (skills, experience, search preferences) instead of a control that cannot yet do anything.
- **AC-2**: Submitting the identity form with a non blank `full_name` (trimmed, at most 200 characters) creates the profile row, with `id` set to the caller's own auth id. `/profile` then renders its full view first shape: the identity view, Skills, Experience, Search preferences, and the Tracked applications link.
- **AC-3**: `full_name` is required and at most 200 characters. `summary` is optional and at most 4000 characters. `location` is optional. A submission that fails a rule writes nothing and returns a visible error next to the field, with the values the user typed kept in place.
- **AC-4**: An existing profile's identity section can be reopened for editing at any time and re-saved as an update on the same row, never as a second insert.
- **AC-5**: Skills are entered as one field, one skill per line, and saved as a whole. Saving compares the submitted list against the caller's current `profile_skill` rows, case insensitively, matching the unique index that is the authority on skill identity, and deletes only the names that were removed and inserts only the names that are new, never a blanket delete followed by a blanket insert. A submission that changes only a name's capitalisation (`react` for stored `React`) is a no-op; the stored casing stands.
- **AC-6**: The skills parser trims each line, drops empty lines, removes duplicates ignoring case, and enforces the 100 character per name limit before writing, matching the unique index on `(profile_id, lower(name))`. A name that still collides after that cleanup is a visible error, not a silent drop.
- **AC-7**: Work history entries are added and edited one at a time, each its own form. The started month and the ended month are each a `Select` of the twelve named months, submitted as the values `1` to `12`; the month names themselves are fixed by this spec (ordinary calendar names, not product voice), not a `Copy` slot. The started year and the ended year are each a `Select` bounded from 1950 to the current year (no later; a work history entry never starts or ends in the future). Together they are stored as the first day of that month. A started month and year later than the current month is rejected with a visible error. The ended month and year are both present or both absent, never one without the other; an absent pair means the role is current, and there is no separate "current role" control. An ended date before the started date is rejected with a visible error.
- **AC-7a**: `company` and `title` are required, trimmed, and at most 200 characters, mirroring `work_experience`'s own check constraints. `description` is optional and at most 4000 characters, also mirroring its check. `location` is optional; `work_experience.location` carries no database check, so its 200 character cap is an application only limit chosen here to match `company` and `title`, not a mirrored constraint.
- **AC-8**: A work history entry can be removed. Removing one is gated by a confirmation step that names the entry before it is deleted. A delete that touches zero rows (the entry was already gone, or never belonged to the caller) is reported as a visible failure, never treated as a successful removal.
- **AC-9**: Search preferences (`desired_titles`, `desired_locations`, `remote_preference`, `minimum_pay`, `minimum_pay_currency`) are edited together as one section. `desired_titles` and `desired_locations` are each entered as one field, one value per line, never comma separated (a location value can itself contain a comma); each line is trimmed, empty lines are dropped, values are deduplicated ignoring case the same way skills are, each value is at most 100 characters, and each list holds at most 50 values. `remote_preference` is a closed choice among `on_site`, `hybrid`, `remote`, `no_preference`. `minimum_pay` and `minimum_pay_currency` are both present or both absent; an empty `minimum_pay` field is treated as absent before that pairing check runs, never as zero. When present, `minimum_pay` is at least 0, at most 9,999,999,999.99, and at most two decimal places, rejected rather than rounded; `minimum_pay_currency` is a free text field, trimmed and uppercased before checking, then exactly three uppercase letters, with no fixed currency list (the schema has none, and one here would be a second source of truth).
- **AC-10**: No `job_preference` row exists until the user explicitly saves that section for the first time. Until then the section's view reads "not set yet", never a rendered default value. Once the row exists, saving again is an update keyed on its `profile_id`.
- **AC-11**: Every Server Action verifies the caller itself, independently of the page (binding rule 6), before it writes, and every write reaches only the caller's own rows, enforced by row level security. A caller with no session is refused visibly. A write that row level security silently excludes (zero rows affected) is reported as a named failure, never read as success.
- **AC-12**: Validation errors render next to the field they belong to, using each edit form's own state. A failed submission keeps what the user typed rather than clearing the form.
- **AC-13**: Every section's edit, add, and delete confirmation state is reachable at a stable URL on `/profile`, parsed against a closed set of known section names; an unrecognised value renders the plain view, never an error page. An `entry` id is parsed as a uuid; one that is malformed, or valid but no longer one of the caller's own work history rows (deleted in another tab, or never the caller's), also renders the plain view, with a visible line saying the entry is no longer there, never a blank form that would silently turn an edit into an insert. Cancel returns to `/profile` with nothing submitted.
- **AC-14**: The identity save Server Action, as this feature's representative write path, is driven once from a test with no browser (spec 0001's third runner constraint, deferred here by spec 0004's Follow up): fetch the page with the edit form open, read the rendered form's hidden action fields, and post them back; a redirect carrying the session cookie means it ran.
- **AC-15**: Two real signed in accounts, each saving their own profile on the running app, each read back only their own row afterward. This closes the deferred positive half of spec 0007's AC-15.
- **AC-16**: The entry page's "What's real today" card moves its `profile` claim from planned to working (spec 0006, AC-8).
- **AC-17**: The four new base components (`Input`, `Textarea`, `Select`, and a combined `Field`/`Label` wrapper counted as one) render at every variant on `/ui-preview` behind `UI_PREVIEW_ENABLED`, each keyboard reachable with a visible focus indicator and a real accessible label (WCAG 2.2 AA), matching the pass spec 0005 already ran on its own inventory.
- **AC-18**: The identity section shows only the columns `public.profile` actually has (`full_name`, `location`, `summary`), never a role or years field. The skills section shows the caller's own list only, with no matched or missing distinction. Education is not built.

## Options considered

See [rationale.md](rationale.md).

## Decision

**Chosen option**: Option 2, independent per section saves with a URL driven edit state.

Each of the four sections (identity, skills, experience, preferences) is its own Server Action, its own edit state, and its own save. The section a visitor is editing is named by a search parameter on `/profile` (`?edit=identity`, `?add=experience`, `?edit=experience&entry=<id>`, `?delete=experience&entry=<id>`), read and rendered by the server component, never by client side toggle state. Four new base components (`Input`, `Textarea`, `Select`, a `Field`/`Label` wrapper) are added to `src/components/ui/`, extending spec 0005's Accepted component inventory the same way spec 0006 added `Logo`.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

See [rationale.md](rationale.md).

## Feature design

**Data model sketch**

This feature adds no new schema. It is the first write path onto the four tables spec 0003 already applied and migrated:

| Table | Shape | Write path this feature adds |
|---|---|---|
| `profile` | Root row, `id` = the auth user id, `full_name` required, `location` and `summary` optional | Insert once (identity's first save), then update in place |
| `profile_skill` | Many rows per profile, `name` unique per profile ignoring case, no update grant | Insert new names, delete removed names, on every skills save |
| `work_experience` | Many rows per profile, full CRUD grant, `started_on`/`ended_on` pinned to the first of the month | Insert per new entry, update per edited entry, delete per removed entry |
| `job_preference` | One row per profile, primary key is `profile_id` | Insert on first save, update on every save after |

See spec 0003's `## Feature design` for the full column list, constraints, grants and policies; this spec does not repeat them.

**State transitions**

None for the data itself (spec 0003 records none). The page has a small state of its own, driven entirely by the URL: plain view, or one of `edit` / `add` / `delete` for a named section (and, for work history, a named entry). No state is held anywhere else.

**API surface**

All six actions live in `src/features/profile/actions.ts`, each opening a named span (binding rule 3) and verifying the caller itself (binding rule 6) before it touches the database. Five spans, not six: `addWorkExperience` and `updateWorkExperience` share one (see below).

| Action | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `saveIdentity` | `full_name` (req, ≤200), `location` (opt), `summary` (opt, ≤4000) | redirect to `/profile` on success; field errors on failure | signed in, caller = `auth.uid()` | `validation_failed` (expected), `session_missing` (expected), `database_unavailable` (unexpected) |
| `saveSkills` | `skills` (newline list) | redirect; field errors | signed in, caller owns the profile | `validation_failed`, `session_missing`, `record_not_found` (a defence against a direct action call bypassing the UI; AC-1 makes this unreachable through `/profile` itself, since no skills control renders before a profile row exists), `database_unavailable` |
| `addWorkExperience` | `company`, `title`, `location` (opt), `description` (opt, ≤4000), `started_month`, `started_year`, `ended_month` (opt), `ended_year` (opt) | redirect; field errors | signed in, caller owns the profile | `validation_failed`, `session_missing`, `record_not_found`, `database_unavailable` |
| `updateWorkExperience` | entry `id` plus the same fields as `addWorkExperience` | redirect; field errors | signed in, caller owns the entry (row level security) | `validation_failed`, `session_missing`, `record_not_found` (entry gone or not owned), `database_unavailable` |
| `deleteWorkExperience` | entry `id`, submitted only from the confirmation form | redirect | signed in, caller owns the entry | `session_missing`, `record_not_found` (zero rows deleted), `database_unavailable` |
| `savePreferences` | `desired_titles` (newline list), `desired_locations` (newline list), `remote_preference` (enum), `minimum_pay` (opt), `minimum_pay_currency` (opt) | redirect; field errors | signed in, caller owns the profile | `validation_failed`, `session_missing`, `record_not_found`, `database_unavailable` |

Every action follows the established pattern in `src/features/auth/actions.ts`: `redirect()` is called outside the span and outside `attempt()`, since it works by throwing and a throw inside either would be recorded as the operation failing when it succeeded. Every action calls `revalidatePath("/profile")` inside the span, before its `redirect()`, so a save is never read as not having stuck on the very next render. `updateWorkExperience` and `deleteWorkExperience` detect a zero row result with `{ count: "exact" }` on the Supabase call, never `.select()`, since supabase-js returns no row count by default and the row's own data is not needed afterward.

`addWorkExperience` and `updateWorkExperience` share one span, `profile.save_work_experience`, distinguished by an `operation: "insert" | "update"` attribute, the same way `auth.sign_in` carries a `provider` attribute for two closely related calls. They stay two separate actions, not one taking an `id` and branching, because their failure shapes genuinely differ: an insert is refused outright by the insert policy's `with check` if anything about it is wrong, while an update that row level security excludes affects zero rows and does not raise at all, the same two shapes spec 0003's own AC-4 test proved separately for `with check` on insert versus `using` on update. Collapsing the two into one action would move that distinction inside a single function that has to get both branches right, for a savings of one file.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| `saveIdentity` | `profile.id` | `auth.uid()` of the caller, never a client supplied value (spec 0003's own rule) |
| `saveIdentity` | `full_name`, `location`, `summary` | the identity form, parsed with Zod before the write, mirroring `public.profile`'s own checks |
| `saveIdentity` | insert versus update | neither is chosen by the action; it always calls `upsert` on `id`, so a repeated submission (a double click, or a back button resubmission) updates the same row instead of failing a second insert on the primary key |
| `savePreferences` | insert versus update | the same rule: always `upsert` on `profile_id`. AC-10's "no row until an explicit save" still holds, because the upsert only ever runs from this section's own action |
| `saveSkills` | the names to insert and the names to delete | a read of the caller's current `profile_skill.name` rows inside the same action, diffed against the parsed, deduplicated submitted list |
| `saveSkills` | write order | inserts run first, then deletes, so a failure between the two steps leaves the user with every skill they already had plus whatever new ones landed, never fewer than they started with |
| `addWorkExperience` / `updateWorkExperience` | `started_on`, `ended_on` | `started_month` + `started_year`, `ended_month` + `ended_year` from the form, constructed as the first day of that month; an absent ended pair means the role is current |
| `addWorkExperience` / `updateWorkExperience` / `deleteWorkExperience` | `profile_id` | `auth.uid()` of the caller, never a client supplied value |
| `updateWorkExperience` / `deleteWorkExperience` | whether the entry id resolves | the `entry` search parameter, parsed as a uuid, resolved by row level security on the update or delete call itself; a zero row result (see invariant 4) is the "gone or not owned" case, reported the same way whether the id was malformed, stale, or spoofed |
| `saveSkills` | `profile_id` on every inserted `profile_skill` row | `auth.uid()` of the caller, never a client supplied value |
| `savePreferences` | `profile_id` (the `job_preference` primary key) | `auth.uid()` of the caller, never a client supplied value |
| `savePreferences` | `desired_titles`, `desired_locations` | the two newline separated fields, parsed with Zod, trimmed, empties dropped, deduplicated ignoring case, same as skills |
| `savePreferences` | `remote_preference` | the closed choice submitted, validated against the four allowed values |
| every action | which section is open for editing | the `edit` / `add` / `delete` search parameter on `/profile`, parsed with Zod against a closed set of section names; anything else renders the plain view |
| `/profile` page | the caller's skills, work history, preferences | a new `readProfileSections()` in `src/features/profile/queries.ts`, its own named span (`profile.read_sections`), called only once `readOwnProfile()` has already resolved a row; it does not touch `readOwnProfile()` itself, which spec 0008's AC-7 already depends on keeping its own failure ratio (its `record_not_found` path marks the `profile.read` span failed on purpose). Work history is ordered `ended_on desc nulls first, started_on desc, created_at desc` (current roles first, then most recent); skills are ordered by `lower(name)` ascending. A row that fails its Zod parse returns `response_malformed` / unexpected, the same as `readOwnProfile()` |
| `/profile` page | what renders on an unexpected read failure | neither `readOwnProfile()` nor `readProfileSections()` failing unexpectedly (`database_unavailable`, `response_malformed`) ever renders the AC-1 first run view; the page renders a visible failure state instead, the same "no default that reads like success" rule spec 0008's landing logic already follows for a failed existence check |
| `addWorkExperience` / `updateWorkExperience` / `deleteWorkExperience` / `saveSkills` | display order after a save | not read from the action's own return value; the redirect back to `/profile` re-runs `readProfileSections()`, so the list shown is always the true current order, never a client held copy |
| every action | `created_at`, `updated_at` | database defaults and the shared trigger |

**Key invariants**

1. `profile.id` is always `auth.uid()`, never a value the client supplies. Saving identity is always an upsert keyed on `id`, and saving preferences is always an upsert keyed on `profile_id`, so a repeated submission is idempotent rather than a second insert that would fail on the primary key.
2. A skill name reaching `profile_skill` has already passed the same cleanup its unique index enforces (trimmed, deduplicated ignoring case), so the write never has to recover from a constraint violation it could have avoided. The rare case it still can, a concurrent save from another tab, is mapped to `validation_failed` / expected, naming the colliding skill, never to `database_unavailable`.
3. A work history date stored by this feature is always the first of a month, constructed from a validated month and year, never accepted as a raw date.
4. A single, entry addressed delete or update (`updateWorkExperience`, `deleteWorkExperience`) that changes zero rows is always reported as a failure, detected with `{ count: "exact" }` on the Supabase call (supabase-js returns no row count by default), never with `.select()`, since the row's own data is not needed afterward. Row level security silently excluding that row is never read as a successful no-op. This does not apply to `saveSkills`' bulk delete: a diff computed delete that matches fewer rows than expected (another tab already removed one of the same names) is a benign concurrency outcome, the same last write wins rule invariant 10 states for the rest of the feature, and is never itself a failure.
5. No `job_preference` row is created except by an explicit save of that section. A profile with no stated preferences has no row, never a row full of defaults.
6. Every write path opens its own named span before any guard clause (binding rule 3), verifies the caller inside itself (binding rule 6) independent of the page's own session check, and calls `revalidatePath("/profile")` inside the span before its `redirect()` (kept outside both, per the pattern in `src/features/auth/actions.ts`).
7. The delete confirmation URL (`?delete=experience&entry=<id>`) mutates nothing by itself; it only renders a form naming the entry. It stays safe to link, prefetch, or bookmark. The delete only ever happens through that confirmation form's own POST, and a later change must not turn this into a one click delete link.
8. An optional text field (`profile.location`, `profile.summary`, `work_experience.location`, `work_experience.description`) that trims to nothing is stored as `NULL`, never as an empty string, so "is this set" stays a real question the database can answer.
9. Skills are written insert first, then delete (see Value sourcing).
10. Two tabs saving the same section is last write wins, deliberately. `profile` and `job_preference` carry no optimistic concurrency check: the only writer of a row is its own owner, and a version conflict UI would cost more than the rare collision it would prevent.

**Security model**

Every one of the four tables already carries row level security forced, with policies confining every action to `(select auth.uid()) = profile_id` (or `= id` on `profile` itself), per spec 0003. This feature adds no new tables and no new policies; it is the first code path to actually call the insert, update and delete grants spec 0003 already put in place. No roles, no cross user access, no compliance scope beyond what spec 0009's privacy notice already covers for these fields (spec 0003's Security model lists them as personal data). Every Server Action re-verifies the caller itself, independent of the page's own protected layout check, per binding rule 6, because a Server Action is a callable endpoint whatever page renders it.

**Failure table**

Named the same way `AUTH_FAILURES` fixes kind and severity per code in `src/features/auth/failure-codes.ts`, so no call site picks a severity in the moment:

| Kind | Severity | When |
|---|---|---|
| `validation_failed` | expected | a Zod parse fails, or a write is refused by a check constraint this feature's own Zod rules were supposed to catch first (a defence, not an expected path) |
| `session_missing` | expected | the caller check inside the action finds no session |
| `record_not_found` | expected | a work history update or delete resolves to zero rows (gone, or not the caller's); `saveSkills` or `savePreferences` called with no profile row yet, caught by a pre-write existence check (a defence against a direct action call; unreachable through `/profile` itself per AC-1); `addWorkExperience` called with no profile row yet, caught as the foreign key violation (Postgres 23503) that write would raise, mapped here rather than left to fall through to `database_unavailable`, for the same defensive reason |
| `database_unavailable` | unexpected | the database driver throws, or returns an error this feature's own checks did not anticipate |
| `response_malformed` | unexpected | `readProfileSections()`'s Zod parse fails on a returned row, the same as `readOwnProfile()` |

**Copy**

**Written by the engineer, used verbatim**, the same as spec 0007's `COPY-1` through `COPY-6`. `/develop` must not invent or reword any of them. Spec 0007's punctuation rule applies here with no carve out: no em dashes, no en dashes, no semicolons in any slot, because product copy is the only text a user actually reads and em dash overuse is one of the most cited markers of AI written text, which costs something real on a portfolio facing product.

| Slot | Shown when | Text |
|---|---|---|
| `COPY-1` | First run, under the identity form, before any profile row exists (AC-1) | Your name is all this needs to start. Skills, experience and search preferences open up once you save it. |
| `COPY-2` | The page title and the four section headings on the full view | Profile (`h1`), then Personal details, Skills, Experience, Search preferences (each `h2`) |
| `COPY-3` | Search preferences, before a `job_preference` row exists (AC-10) | Not set yet. Add the titles, locations and pay you're aiming for. |
| `COPY-4` | An `entry` id that resolves to no row, whether stale, malformed, or not the caller's (AC-13) | That entry is no longer on your profile. It may have been removed in another tab. |
| `COPY-5` | The delete confirmation for a work history entry (AC-8) | Remove {title} at {company}? This can't be undone. |
| `COPY-6` | Section and entry controls | Edit / Add role / Save / Cancel / Remove |

**One constraint the copy creates.** `COPY-2` fixes the page's heading outline: a stable `h1` of "Profile" and four peer `h2` section headings. It is chosen because AC-1 renders before any `full_name` exists, so a name based `h1` would need a second outline for first run. AC-17's keyboard and heading pass checks this one outline, not two.

**Configuration required**

None. No new environment variable, secret, or third party credential.

**Critical test scenarios**

- Happy path, identity: a signed in user with no profile submits only a name; the profile row is created and `/profile` switches to its full view, verifies **AC-1**, **AC-2**.
- Happy path, skills diff: a profile already holding skills `a`, `b`, `c` submits `a`, `c`, `d`; `b` is deleted, `d` is inserted, `a` and `c` are untouched, verifies **AC-5**, **AC-6**.
- Failure case, skills partial write: the delete half of a skills save fails after the insert half already succeeded; the caller's prior skills are all still present, verifies **AC-5**, invariant 9.
- Work history, current role: an entry saved with no ended month or year reads as the current role, verifies **AC-7**.
- Failure case, spoofed delete: a delete submitted for a work history entry id that does not belong to the caller changes zero rows and is reported as a named failure, not a silent success, verifies **AC-8**, **AC-11**.
- Failure case, stale entry: `?edit=experience&entry=<id>` for an id already deleted in another tab renders the plain view with the "no longer there" line, not a blank insert form, verifies **AC-13**.
- Failure case, validation: an identity submission with a blank name writes nothing, returns a per field error, and keeps the location and summary the user had typed, verifies **AC-3**, **AC-12**.
- No browser Server Action drive: fetching `/profile?edit=identity`, reading the rendered form's hidden action fields, and posting them back returns a redirect carrying the session cookie, verifies **AC-14**.
- Auth and permission: a request to any of the six actions with no session is refused visibly rather than silently doing nothing, verifies **AC-11**.
- Isolation: two real accounts each save their own profile and, on read back, see only their own row, verifies **AC-15**.

## Build plan

Ordered for Tracer Bullet: a thin, real end to end slice through the identity section first, since it is the one section every other section's writes depend on (the foreign key parent) and the one this feature's no browser test technique needs to drive, then thicken section by section.

1. Build the four new base components (`Field`/`Label`, `Input`, `Textarea`, `Select`) in `src/components/ui/`, following spec 0005's token layer, its closed six step text scale, and its one `:focus-visible` ring, extending its Accepted inventory the way spec 0006 added `Logo`. Render each at every variant on `/ui-preview`. Satisfies **AC-17**.
2. Thin slice: `src/features/profile/actions.ts` with `saveIdentity` (named span, caller check, Zod parse mirroring `public.profile`'s own checks, the upsert on `id`, `useActionState` shaped return), and `src/app/(app)/profile/page.tsx` reading and Zod parsing the `edit` search parameter, rendering the identity edit form (no profile row, or `?edit=identity`) or the identity view plus the "what comes next" line (a first time visitor with no other section built yet) or the full view (once other sections exist). Before building the other four forms, spike the `useActionState` hidden field shape spec 0004's Follow up recipe assumes: render the identity form, fetch the page, confirm `$ACTION_REF_1` / `$ACTION_1:0` / `$ACTION_1:1` / `$ACTION_KEY` are present in the HTML. If they are not, the identity form falls back to rendering its errors from a search parameter instead of `useActionState`, and that fallback is recorded here rather than discovered at step 8. Prove create, reload, and edit against the real local stack. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-11**, **AC-12**, **AC-14**'s premise, and the closed set of section names half of **AC-13** (the entry id half arrives at step 4, the first step with an entry to resolve).
3. Thicken: the skills section. Add `readProfileSections()` covering `profile_skill` (its first table), `saveSkills` (named span, the read-before-write diff, the insert-then-delete order, the parse and dedupe rules), and the skills view and edit cards. Satisfies **AC-5**, **AC-6**.
4. Thicken: work history. Extend `readProfileSections()` to include `work_experience`, ordered per Value sourcing, add `addWorkExperience` and `updateWorkExperience` (sharing the `profile.save_work_experience` span, distinguished by an `operation` attribute) and `deleteWorkExperience` (its own span), the month and year `Select` controls and their date construction, the entry list, the per entry edit form, the stale entry id fallback, and the named delete confirmation step. Satisfies **AC-7**, **AC-7a**, **AC-8**, **AC-13**.
5. Thicken: search preferences. Extend `readProfileSections()` to include `job_preference` (absent is a real, distinct state, not defaulted), add `savePreferences` (named span, the upsert on `profile_id`, the pay coercion and bounds, the currency check), and the preferences view and edit card, with the "not set yet" view state. Satisfies **AC-9**, **AC-10**.
6. Register every new span (`profile.read_sections`, `profile.save_identity`, `profile.save_skills`, `profile.save_work_experience`, `profile.delete_work_experience`, `profile.save_preferences`) in `docs/observability/spans.md`.
7. Move the entry page's `profile` claim from planned to working in `about-section.tsx`. Satisfies **AC-16**.
8. Add the no browser integration test driving `saveIdentity`, per spec 0004's Follow up recipe (fetch the page, read the hidden `$ACTION_` fields, post them back as multipart, expect a redirect carrying the session cookie). Satisfies **AC-14**.
9. Prove isolation: two real accounts on the running app, each saving and then reading only their own profile. Satisfies **AC-15**.
10. Run the keyboard, focus, contrast, and responsive pass on the four new components at `/ui-preview`. Satisfies **AC-17**.

## Consequences

**Positive**

- The four tables feature 9 owns now have a real write path; feature 14's scoring has real data to read, and feature 12's applications already have a profile to belong to.
- The new `Input`, `Textarea`, `Select`, and `Field`/`Label` components give the next form heavy features (18, 20, 22) a proven base to build on, the same way `Logo` did after spec 0006.
- Saving per section means a database hiccup on one table never leaves another half written; each save touches a single table. (Skills is still two statements, an insert and a delete, on that one table; invariant 9's write order is what keeps a mid save failure from losing anything the user already had.)

**Negative and tradeoffs**

- Six Server Actions and four URL driven edit states are more code than a single combined form would have been.
- Every edit is a full navigation (a GET, then a redirect back to a GET), not a client side transition. The mock up's own inline toggle would feel snappier; it was rejected because it would put the edit form behind a click, breaking the no browser Server Action test technique this feature depends on.
- `/profile` ships client JavaScript, unlike `/` under spec 0006's AC-4. `useActionState` (needed for AC-12's per field errors) makes each edit form a Client Component. This is a deliberate difference between the two trees, not an oversight: the marketing entry page's zero JavaScript contract never extended to the signed in app.
- The skills diff, the write ordering that protects it, and the delete's and update's zero row checks all cost real code a naive implementation would skip: a read before the write, a specific statement order, and a `failure()` on a write that silently matched nothing.
- No completeness gate is added here. A profile with only a name saved is a valid, if thin, profile. Feature 14 owns deciding when a profile is too thin to score against.

**Neutral**

- No new migration; spec 0003's schema is already applied to all three databases.
- Education, matched or missing skill display, and a role or years of experience field are all explicitly out of scope, deferred to feature 26 and feature 14 respectively.

## Follow-up

- [ ] Feature 11 owns its own search input and segmented control. `ui-registry.md`'s open gap for those specific controls is not closed by this feature's `Input`, `Textarea`, `Select`, and `Field` set; only the identity, skills, experience, and preferences form gap is.
- [ ] Feature 14's completeness threshold, what counts as "enough profile to score against", is still open, named in `docs/app-shell-direction.md` and owned by feature 14, not this one.
- [ ] Whether Playwright gets installed remains open. This feature's own Server Action test uses the no browser technique from spec 0004's Follow up and does not need a browser.
- [ ] `ui-registry.md` should register the four new base components once they land, via `/imprint`, the same way `Logo` was registered after spec 0006.
