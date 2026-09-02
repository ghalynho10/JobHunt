# 0010. Profile entry, rationale

## Context

> ⚠️ Premise note: `docs/app-shell-direction.md` already names a real risk here by name: the profile experience could grow into a completeness meter, a progress bar, or a multi step wizard as sections get added. This spec deliberately does not build one. The view first, edit per section shape has no progress tracking and no required versus optional visual signal beyond `full_name` being the one required field. Skills, experience, and preferences carry no order among themselves; identity comes first only because it is the foreign key parent every other table depends on, a structural fact, not a completeness judgement. Feature 14 owns deciding what "enough profile to score" means; this feature only stores what the user chooses to type.

Feature 9 is the first feature to write anything into the four tables spec 0003 already applied: `profile`, `profile_skill`, `work_experience`, and `job_preference`. Scoring (feature 14) cannot function without real data here, and the app shell's own landing rule (spec 0008) already sends a signed in user with no profile row to `/profile`, so this page is the first real screen most people see after signing in.

Three forces shaped the decision more than any design preference did.

First, the schema itself is not neutral about how it expects to be written. `profile_skill` was given an insert and a delete grant, deliberately no update grant or update policy, because "a renamed skill is a delete plus an insert" (spec 0003). `work_experience`, by contrast, was given full CRUD, including an `updated_at` column and an update policy. A design that treated every section the same way would be fighting one of the two shapes the schema was built for.

Second, a Server Action gets no cross table transaction through PostgREST. A single action that tried to write all four tables at once could not be atomic; a failure partway through would leave the profile half written, with no way to roll the earlier tables back.

Third, `docs/app-shell-direction.md` had already settled the interaction model before this spec started: "Profile is view first, not a form. A page the user can look at, with editing available, not a form filled once and never seen again." The app shell mock up (`docs/design/jobhunt-app-shell.html`) implements exactly that shape for `/profile`, section cards with their own Edit or Add control, reviewed against the real design system in `docs/design/app-shell-mockup-findings.md` and `ui-registry.md`'s design tool import audit.

Two things the mock up gets wrong for this feature specifically, corrected here rather than carried over: it draws Education and a Matched or Missing skill breakdown, neither of which this feature builds (Education has no table; the skill breakdown is feature 14's scoring output), and its identity block shows a role and years of experience, neither of which `public.profile` has a column for.

## Options considered

### Option 1: One combined form, one Server Action

Every section (identity, skills, experience, preferences) is fields on a single page level form, submitted together to one Server Action that writes all four tables.

**Pros**:
- Fewer Server Actions and edit states to build.
- Matches the scope row's own phrase, "the profile form's Server Action", most literally.

**Cons**:
- Not atomic: a Server Action gets no cross table transaction through PostgREST, so a failure partway through a four table write leaves the profile in a partially saved state with no way back.
- Forces the user to fill in everything before anything is saved, which does not fit a signed in user landing on `/profile` with no row at all; the first save would have to carry every section at once or the empty sections would need placeholder values the schema does not want (see the rejected auto created `job_preference` row, next section).

### Option 2: Independent per section saves, URL driven edit state (chosen)

Each section is its own Server Action and its own save. Which section is open for editing is named by a search parameter on `/profile` (`?edit=identity`, and the equivalent for the others), read and rendered by the server component itself, never by client side state.

**Pros**:
- Each table is written the way its own grants and constraints expect: `profile_skill`'s delete-plus-insert shape, `work_experience`'s real update path, `job_preference`'s upsert on a single row.
- Matches `docs/app-shell-direction.md`'s already settled decision, and the mock up's own section card layout.
- Keeps the profile form's Server Action drivable without a browser: the edit form is present in the HTML of a plain GET, which is exactly what spec 0004's Follow up recipe needs to read the form's hidden action fields.

**Cons**:
- More Server Actions and more code overall than one combined form.
- Every edit is a full navigation, a GET followed by a redirect back to a GET, rather than a client side transition.

### Option 3: Independent per section saves, client side toggle state

Same per section save shape as Option 2, but each section is a client component holding its own `isEditing` state, swapping view and edit with no navigation or URL change, closer to the mock up's own interaction.

**Pros**:
- Feels snappier: no full page navigation to open or cancel an edit.
- Closest to the mock up's actual behaviour, which toggles sections in place.

**Cons**:
- Puts the edit form behind a client side click. The no browser Server Action test technique spec 0004's Follow up specifies reads the form's hidden action fields off the HTML of a plain GET; a form that only renders after a click is invisible to that technique, forcing either a different test approach or bringing Playwright in earlier than any other feature needed it.

## Rationale

Option 2 is the only one of the three that satisfies all three forces from Context at once: it respects the schema's own per table write shapes, it avoids the non atomic four table write Option 1 cannot avoid, and it keeps the identity save drivable by the no browser test technique that Option 3 breaks. The cost, more Server Actions and a full navigation per edit, is accepted because both are what let the schema's own design and the project's existing test technique carry through unchanged, rather than being worked around.

A closely related decision, folded into Option 2 rather than given its own option, is whether a `job_preference` row should be created automatically alongside the profile row, seeded with the schema's own defaults (`no_preference`, empty arrays), so the preferences section always has something to show. It was rejected: an auto created row would assert that the user has stated no remote preference and no target titles or locations, when they have said nothing at all, which is exactly the default that reads like success this project's rules forbid (`AGENTS.md` binding rule "No silent failures, and store raw"). It also buys nothing given the first point above: the read path already has to handle an absent row regardless, since the four table write was never going to be atomic. `AC-10` and invariant 5 record the chosen behaviour: no row until an explicit save, and a distinct "not set yet" view state.

## References

**Project sources**:
- `docs/design/jobhunt-app-shell.html`, the app shell mock up's `/profile` screen: view first, per section edit
- `docs/design/app-shell-mockup-findings.md`, the browser driven review of that mock up
- `docs/app-shell-direction.md`, "Profile is view first, not a form", and the named risk of a completeness meter or wizard
- `ui-registry.md`, the 2026-08-30 design tool import audit and its open note that `src/components/ui` has no `Input` or equivalent yet
- `supabase/migrations/20260825162457_data_model.sql`, the four tables' columns, constraints, grants, and policies
- spec 0003, the data model and its value sourcing table
- spec 0004's Follow up, the no browser Server Action technique, and the Playwright deferral
- spec 0005, the component inventory, the closed text scale, the `Logo` precedent for extending that inventory, and `Button`'s `label` prop
- spec 0006 AC-17, the no dead controls rule
- spec 0007 AC-15, the deferred positive half of the isolation proof
- `docs/scope/scope.md`, feature 9's done when clause and feature 14's layering note
- root `AGENTS.md`, the binding rules
- `src/features/auth/actions.ts`, the established Server Action pattern (named span, caller check via `attempt()`/`failure()`, `redirect()` kept outside both)

**Practices & standards**:
- Next.js 16.3.1 as installed, `node_modules/next/dist/docs/01-app/02-guides/forms.md`: displaying validation errors requires turning the component that defines the `<form>` into a Client Component using `useActionState`
- Next.js 16.3.1 as installed, `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`: `searchParams` is a `Promise` and reading it opts the page into dynamic rendering
- WCAG 2.2 AA: visible focus, real labels, distinct accessible names on repeated controls
- PostgREST: a single request gets no cross table transaction, which is why no combined save across the four tables could be atomic
