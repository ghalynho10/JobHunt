# Verify: profile entry · spec 0010 · updated 2026-09-02

_Run by `/check verify` on 2026-09-02: **PASS**, 51 of 53 steps ticked. The two unticked ones are recorded at the end of this file and neither is an acceptance criterion failure._

_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Steps marked **(covered)** already have an automated proof in
`test/integration/profile-form.test.ts`, which drives the real Server Actions over
HTTP against the real local stack. They are listed anyway, because a step that
only exists inside a test is a step nobody re-runs by hand when the test itself
is what broke.

The `/ui-preview` steps need `UI_PREVIEW_ENABLED=true` and a browser. Everything
else needs `pnpm db:start` and a signed in account.

## UI / manual

- [x] Sign in as an account with no profile row, land on `/profile` → only the identity form renders, no Skills, Experience or Search preferences card, and the line "Your name is all this needs to start." appears above it → AC-1
- [x] Submit the identity form with a name only → the row is created and `/profile` switches to the full view: identity, Skills, Experience, Search preferences, and the Tracked applications link → AC-2 **(covered)**
- [x] Submit the identity form with a blank name, having typed a location and a summary → nothing is written, "Enter your name." renders next to the name field, and the location and summary are still on screen → AC-3, AC-12 **(covered)**
- [x] Submit a name of 201 characters → refused with a message beside the field, nothing written → AC-3
- [x] Open `?edit=identity` on an existing profile, change the name, save → the same row is updated, the profile is not duplicated → AC-4 **(covered)**
- [x] With skills `a`, `b`, `c` saved, submit `a`, `c`, `d` → `b` is gone, `d` is added, and `a` and `c` keep their original `created_at`, so they were not deleted and reinserted → AC-5
- [x] With `React` saved, submit `react` → nothing changes and the chip still reads `React` → AC-5
- [x] Submit skills with blank lines, leading spaces, and the same name twice in different cases → the list saves once per distinct name, trimmed → AC-6 **(covered)**
- [x] Submit a skill of 101 characters → refused with a visible message, nothing written → AC-6
- [x] Add a work history entry with a started month and year and no ended pair → it renders at the top of the list and its dates read "<Month> <Year> to now" → AC-7 **(covered)**
- [x] Add an entry with an ended month but no ended year → refused with a message beside the year → AC-7
- [x] Add an entry ending before it starts → refused with a visible message → AC-7
- [x] Open the started year select → the newest option is the current year and there is no later one; the oldest is 1950 → AC-7
- [x] Add an entry with a blank company or a blank job title → refused with a message beside that field → AC-7a
- [x] Open `?delete=experience&entry=<own id>` → a confirmation naming the entry ("Remove {title} at {company}? This can't be undone."), and nothing is deleted just by visiting → AC-8, invariant 7
- [x] Confirm the removal → the entry is gone from the list → AC-8
- [x] Save search preferences with a location containing a comma ("Berlin, Germany") on its own line → it is stored as one value, not two → AC-9 **(covered)**
- [x] Save a minimum pay of `1234.567` → refused rather than rounded to `1234.57` → AC-9
- [x] Save a minimum pay with no currency, and a currency with no pay → each is refused with a message beside the missing half → AC-9
- [x] Save a currency of `eur` → stored and rendered as `EUR` → AC-9 **(covered)**
- [x] On a profile that has never saved preferences → the section reads "Not set yet. Add the titles, locations and pay you're aiming for." and no `job_preference` row exists in the database → AC-10
- [x] Save preferences twice → still exactly one `job_preference` row → AC-10
- [x] Visit `/profile?edit=banana` → the plain view renders, no error page → AC-13
- [x] Visit `/profile?edit=experience&entry=not-a-uuid` → the plain view plus "That entry is no longer on your profile." → AC-13
- [x] Delete an entry in one tab, then in a second tab open its `?edit=experience&entry=<id>` → the plain view plus the same line, never a blank form → AC-13
- [x] Press Cancel in any section's form → back to `/profile` with nothing written → AC-13
- [x] Sign in as a second account and save its own profile → each account reads back only its own profile, skills, work history and preferences → AC-15 **(covered)**
- [x] Load `/` signed out → the "What's real today" card lists `profile` under `working`, not under `planned` → AC-16
- [x] With `UI_PREVIEW_ENABLED=true`, load `/ui-preview` and tab through the form controls section → every enabled control takes focus in document order and shows the 2px teal ring at 2px offset; the two disabled controls are skipped → AC-17
- [x] On `/ui-preview`, confirm every control has a visible `<label>` and the two invalid controls carry `aria-invalid="true"` with an `aria-describedby` that resolves to the message under them → AC-17
- [x] On `/ui-preview` at 320px wide → no horizontal page scroll and every control is at least 44px tall → AC-17
- [x] On `/ui-preview`, measure the label, the "(optional)" marker and the error message against the section background → each is at least 4.5:1; the resting field border is at least 3:1 → AC-17
- [x] The page has exactly one `h1` ("Profile") and four `h2` headings (Personal details, Skills, Experience, Search preferences) → AC-17, `COPY-2`
- [x] The identity view shows only name, location and summary, with no role and no years of experience field; the skills list shows no matched or missing split; there is no education section → AC-18

## Value sourcing

One step per row of the spec's Value sourcing table, exercising the edge that
breaks if the source is wrong.

- [x] Save identity, then read the row directly → `profile.id` equals the caller's own auth user id, and no form field named it → invariant 1 **(covered)**
- [x] Submit the identity form twice in a row (a double submit, or the browser's back then resubmit) → one row, updated, never a primary key error → invariant 1 **(covered)**
- [x] Save preferences twice → one `job_preference` row, keyed on `profile_id` → invariant 1
- [ ] Save skills, watching the database → the inserts happen before the deletes, so an interrupted save can only ever leave more skills than it started with, never fewer → invariant 9
- [x] Save a work history entry for any month → `started_on` is the first of that month, whatever the server's own timezone → invariant 3 **(covered)**
- [x] Save an entry with no ended pair → `ended_on` is `NULL`, and the entry sorts above every ended one → AC-7
- [x] Submit a work history update with an `entry_id` belonging to another account → a visible failure ("no longer on your profile"), zero rows changed, and the other account's entry untouched → invariant 4, AC-11 **(covered)**
- [x] Submit a delete with an `entry_id` belonging to another account → the same, and the other account's entry is still there → invariant 4, AC-8 **(covered)**
- [x] Clear an optional field (location, summary, an entry's location or description) and save → the column is `NULL`, not an empty string → invariant 8 **(covered)**
- [x] Save work history entries out of order, then reload → they render current first, then most recent by start date, and the order comes from the reload rather than from the form's own return → Value sourcing, display order
- [x] Save skills with mixed capitalisation and reload → they render ordered by lower case name → Value sourcing, `readProfileSections()`
- [x] Save a minimum pay of `90000.50` and reload the page → it renders as `90000.50 EUR`, which also proves the `numeric(12, 2)` column parses at the boundary rather than failing to `response_malformed` → Value sourcing **(covered)**
- [ ] Call any of the six actions with no session (clear the cookies, then post the form) → refused visibly with "Your session has ended.", nothing written → AC-11
- [x] Post `saveSkills` or `savePreferences` for an account with no profile row → refused with "Save your personal details first.", never a raw foreign key error → Failure table, `record_not_found`
- [x] Stop the database, then load `/profile` for an account that HAS a profile → the failure state renders, never the first run identity form → Value sourcing, "what renders on an unexpected read failure"

## Commands

- [x] `pnpm test` → 528 tests pass, no database needed → spec 0004
- [x] `pnpm db:start && pnpm test:integration` → 55 tests pass, including the three in `test/integration/profile-form.test.ts` → AC-14, AC-15
- [x] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build` → all clean
- [x] Run `pnpm test:integration` with `pnpm dev` already running → still passes, because the test server builds into `.next-test` → AC-14

## Acceptance-criteria coverage

- AC-1 · first run renders the identity form alone plus `COPY-1`
- AC-2 · a name only submit creates the row and switches to the full view
- AC-3 · required and length rules, with the typed values kept
- AC-4 · re-saving updates the same row
- AC-5 · the skills diff, and capitalisation alone being a no-op
- AC-6 · the skills parser rules and the 100 character cap
- AC-7 · the month and year selects, the date construction, the ended pair rule
- AC-7a · company, title, description and location limits
- AC-8 · the named delete confirmation, and the zero row delete being a failure
- AC-9 · the preference rules, including the newline lists and the pay pair
- AC-10 · no `job_preference` row until an explicit save
- AC-11 · every action verifies its own caller, and row level security confines it
- AC-12 · per field errors, with the form's own state
- AC-13 · every edit state at a stable URL, and the stale entry fallback
- AC-14 · the Server Action driven with no browser
- AC-15 · two accounts each reading back only their own rows
- AC-16 · the entry page claim moved to working
- AC-17 · the four new components at every variant on `/ui-preview`, keyboard, focus, contrast, responsive
- AC-18 · only the columns the schema has, no matched or missing split, no education


## The two steps left unticked, and why

Neither is a failure. Both are steps whose wording asks for something the running
app cannot show from outside, which is worth recording so a later run does not
read them as skipped work.

**Both were proved by `/test` on 2026 09 02**, in
`test/integration/profile-actions.test.ts`, which calls the actions directly
instead of driving them over HTTP. They stay unticked here because this file
records what THIS gate observed, and neither is observable from where this gate
stands. A later `/check verify` run should leave them unticked for the same
reason.

- **"Save skills, watching the database, inserts before deletes" (invariant 9).**
  The outcome was verified (the diff writes only what changed, and nothing the
  caller already had was lost), but the STATEMENT ORDER was not observed. Seeing
  it needs statement level logging on the connection, or a fault injected between
  the two writes so the half written state is visible. The ordering is what
  protects a caller when the second write fails, so it is worth a real proof.
  **Now proved**: the test breaks `delete()` at the driver, leaving the read and
  the insert on the real database, and asserts the outcome the ordering exists
  for, that the caller ends with more skills than they started with and never
  fewer. It discriminates the order rather than restating it, because an insert
  that ran second would leave the new skill absent.

- **"Call any of the six actions with no session, refused visibly with 'Your
  session has ended.'"** A request with no cookie never reaches the action: the
  protected layout redirects it to `/sign-in` first (observed: `307` to
  `/sign-in?next=%2Fprofile%3Fedit%3Didentity`, nothing written). So the
  criterion AC-11 states, a caller with no session is refused visibly, IS met,
  but by the layer above. The action's own caller check (binding rule 6) is
  defence in depth against a call that bypasses the page, and there is no way to
  stage that over HTTP, because the page is the only thing that hands out the
  action id. Proving it needs a test that calls the exported action directly with
  an empty cookie jar, which is not something this gate can observe.
  **Now proved**: the test stubs `next/headers` with an empty jar and calls
  `saveIdentity` directly, and the action returns its own session message
  instead of writing, so binding rule 6 is checked where it actually lives
  rather than at the layout above it.
