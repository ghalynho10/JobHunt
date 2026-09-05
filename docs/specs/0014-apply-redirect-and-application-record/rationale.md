# Rationale: apply redirect and application record · spec 0014

## Context

Feature 11 shipped a real search against Adzuna, and it deliberately persists nothing. A listing exists for the length of one render and then it is gone. That was the right boundary for a search feature, and it leaves the product with no memory: a user can find a job, open it, apply on the employer's own site, and the app never knows any of it happened. The scope calls this feature the thing that closes the thread and makes the application record the only place a job persists.

Three separate specs arrived at this feature with a decision they each declined to make. Spec 0003 designed the `application` table before any of the search work existed, and wrote two things into it that turned out not to match reality: a `job_description` column described as holding the full posting text, and no column at all for whether a salary was predicted rather than stated. Spec 0013 discovered both while building the search, recorded them, and explicitly left the second one "for feature 12's spec to weigh rather than inherit as settled". The scope row carries the same note. None of them could settle it, because the table belongs to one spec and the write belongs to another.

The forces that shape the answer are unusually concrete. The app has a hard budget of 25 Adzuna calls per account per week, enforced by feature 10's gate, so anything that accidentally causes a second search is not a performance concern but a product one. Adzuna's terms attach an attribution obligation to each displayed advert, and feature 11 spent real effort getting the exact wording and link targets right, so a second screen displaying the same data inherits that work rather than escaping it. And the project's own rules are strict in ways that bite here: no failure may read like a success, every value stored raw and formatted at render, a predicted figure never shown indistinguishably from a stated one.

There is also a promise outstanding. `/applications` has existed since feature 32 carrying the sentence "Every job you apply to will be recorded here, so you can see what you sent and when." It is live on production with nothing behind it. The project has already been bitten once by exactly this shape, when the entry page told visitors that nothing worked for two days after sign in shipped.

## Options considered

### Option 1: A deliberate control writing a full snapshot, listed back on `/applications`

Two controls on each result card: feature 11's existing link out, unchanged, and a new `Mark as applied` that writes one row holding a complete copy of the listing. Those rows are read back on `/applications` with the full snapshot, the attribution, and a confirmed removal.

**Pros**:

- The record is visible without spending a search call, which is the only way "survives a reload" means anything under a 25 call weekly ceiling.
- Opening a posting stays free of consequence, so browsing does not silently fill the record with jobs nobody applied to.
- Feature 23's dashboard inherits real rows and a working display path rather than an empty table.
- Honours the promise `/applications` already makes.

**Cons**:

- Larger than the minimum the scope asks for. The scope says "minimal here", and a list plus a removal flow is more than a write.
- Brings the attribution obligation onto a second screen, and nothing enforces that automatically on a third.
- `/search` ships client JavaScript for the first time, costing spec 0013 a property it advertises.

### Option 2: Write the row, show nothing until feature 23

The apply control writes the row and the applied marker on the results list is the only evidence it worked. `/applications` keeps its placeholder until the dashboard is built in v1.5.

**Pros**:

- The smallest possible slice, closest to the scope's "minimal here" instruction.
- No attribution question on a second screen, no removal flow, no list ordering, no empty state.

**Cons**:

- The only way to see a record is to re-run the same search, which costs one of 25 weekly calls. A user checking what they applied to would be spending their search budget to read their own data.
- `/applications` goes on promising something it does not do, for the length of Slice 1 through Slice 4, which is the exact failure shape the entry page already produced once.
- A mis-click has no remedy at all, and the unique constraint makes it permanent.

### Option 3: Record on click through, no separate control

Clicking `View the posting` opens the tab and writes the record in one act.

**Pros**:

- One click rather than two, and it catches the moment of intent without asking the user to do bookkeeping.
- No new control, no client component, no change to the card's shape.

**Cons**:

- Records applications nobody made. Opening a posting to read it is the common case, not the exception.
- The unique constraint then works against the user: a job opened and rejected can never be marked applied later, because the row already exists.
- It makes the record untrue, and the whole value of the record is that it is a true account of what was sent.

### Option 4: Post the snapshot as hidden form fields

Rather than binding the listing into the action's closure, serialise the twelve fields into hidden inputs on each card.

**Pros**:

- Fully visible in the page source, trivially debuggable, no dependence on framework behaviour.
- Works with no client JavaScript at all if the action is allowed to re-render.

**Cons**:

- A crafted post can write any value into that user's own row, including a `job_url` that later renders as a link on their own applications page.
- The no JavaScript version only works if the action re-renders, which is precisely the thing that spends an Adzuna call.

### Option 5: Apply, then redirect to `/applications`

Follow the house pattern exactly: the action writes the row and ends in `redirect("/applications")`, where the user immediately sees the record they just made.

**Pros**:

- Zero client JavaScript on `/search`, so spec 0013 keeps the property it advertises.
- No deviation from the pattern every other action in the codebase follows, which means no comment to write and nothing for a later session to tidy wrongly.
- `redirect()` streams the destination rather than re-rendering the route the action was called from, so it does **not** re-run the Adzuna search. The obvious objection to this option is wrong, which is exactly why it needs recording: a later reader will reach for it, and rejecting it for the wrong reason is worse than not considering it.
- The confirmation is unambiguous, because the record is on screen.

**Cons**:

- Getting back to the results costs a fresh gated call, since a back navigation to `/search` spends one (spec 0013 AC-10, measured against a production build). Applying to three jobs off one page of results becomes four calls rather than one.
- It makes the common case, scanning twenty results and applying to several, the expensive case.

## Rationale

Option 1 was chosen, and the deciding force was the 25 call weekly budget rather than any argument about completeness. Under that ceiling, a record the user can only see by spending a search is not really a record. Option 2's smaller slice looks disciplined until you notice it makes reading your own data cost the same as searching for new data, and leaves a live production sentence untrue for four slices. The scope's "minimal here" was written about the guided capture questions, which stay in Slice 4 and are genuinely out of scope; it was not an instruction to leave the record invisible.

Option 3 was rejected on truthfulness. The record's entire value is that it is an accurate account of what was sent, and a control that fires on browsing produces an account of what was looked at. The unique constraint turns that from an inaccuracy into a trap: the first job you open and decide against is a job you can never mark applied.

The choice between binding the listing and posting it as hidden fields turned on something verified rather than assumed. The installed Next.js 16.3.1 docs at `node_modules/next/dist/docs/01-app/02-guides/data-security.md:526` state that variables an action closes over are encrypted with a private key generated per build, so a client can neither read one nor forge one. The same page at line 528 advises against relying on encryption alone, which is why the decision pairs it with a Zod parse on arrival rather than treating the encryption as the boundary. Hidden fields would have left a user able to write arbitrary values into their own row, which is low harm but pointless to accept when the alternative costs nothing.

The most consequential finding came from tracing what happens after the write, and it very nearly went the wrong way. Every profile action in this codebase ends with `revalidatePath` then `redirect`, a pattern its own doc comment sets out at `src/features/profile/actions.ts:50-56` and its code carries throughout, and copying that pattern is the obvious thing to do. The installed docs at `node_modules/next/dist/docs/01-app/02-guides/server-actions.md:74` say plainly that "an action that does none of the above carries only its return value, and the current route is not re-rendered", where "the above" is `revalidatePath`, `updateTag`, `refresh`, `redirect`, or a cookie mutation. On `/search`, a re-render re-runs `searchListings()`, which spends a gated Adzuna call. So the house pattern applied literally would have made every apply cost one of 25 weekly searches, and it would have looked completely correct in review. That is why the deviation is written into this spec rather than left as an implementation choice, and why it is recorded as a tradeoff: a later session tidying the action toward the house pattern would reintroduce the cost silently.

Option 5 is the honest version of that house pattern, and it deserves its own note because the reason it loses is not the reason it looks like it loses. `redirect()` streams the destination rather than re-rendering the route the action was called from, so it genuinely does not re-run the search. It loses on the round trip instead: coming back to the results spends a call, so a user working through one page of twenty results pays once per apply anyway, plus the original search. Recording that matters more than recording the rejection, because a later reader who reaches for `redirect()` and is told "it re-renders and spends a call" would be given a false reason for a correct decision.

Two things in this design were wrong when first written, and both were caught by a cross check on a different model rather than by re-reading. Both are worth keeping in the record because they share a shape: a spec that reads as correct, whose failure only appears under a condition nobody thought to test.

The first is that avoiding the four explicit re-render triggers is not sufficient. The fifth trigger is a cookie mutation, and this codebase's shared cookie adapter writes cookies: `src/lib/supabase/server.ts:56-60` calls `cookieStore.set` inside a try block whose catch comment says a Server Component cannot write cookies, which is precisely an admission that a Server Action can. The action's own caller check goes through that adapter, so a session refresh during it would write a cookie, re-render `/search`, and spend a call. Nobody would have written that line; it arrives through a helper every action already uses. It fires only when a user applies from a tab left idle past token expiry, and a single measurement on a fresh session passes straight over it. Hence AC-20 and the read only adapter, and hence the honest note in Follow-up that the middle link of that chain, whether `getClaims()` refreshes on expiry, is reasoned rather than verified. The fix is correct whether or not that link holds, and costs nothing if it does not, but it should not be recorded as verified when it was not.

The second is that the original build plan put the action in a module level `src/features/applications/actions.ts` while claiming closure encryption as its integrity property, and those two cannot both be true. A module level `'use server'` export has nothing to close over. The encryption passage in the installed docs at `data-security.md:505-526` is specifically about an action defined inline inside a component, capturing a value from that render; `.bind()`, the thing a builder would actually reach for given a module level function, is documented separately at `forms.md:74-88` with no encryption claim attached to it anywhere in the installed docs. Built as originally specified, the security model's central sentence would have been false while reading as true, which is worse than having no claim at all. The inline closure delegating to the shared function is what makes the claim real, and it is now in the Decision rather than left to the build.

On the predicted salary column, spec 0013 offered a lean and this spec weighed it rather than inheriting it, which is what that spec asked for. The lean was right, and the reasoning holds: AC-7 of spec 0013 exists because showing a guessed salary as a stated one is a lie the product should not tell, and dropping the flag at the moment of applying would tell exactly that lie on every screen that later reads the row. What the deliberation added was the nullability. Writing the boolean straight through would put `false` on every row with no salary at all, which is a claim about a figure that does not exist. Three states are needed because the data has three, and the check constraint is what keeps the column and the figures from drifting apart. The pattern was borrowed from the currency pairing check the same table already carries.

The attribution question was not on anyone's list and surfaced only from reading spec 0013's invariants. Invariant 4 records the verified obligation as per displayed advert, never per screen. An application row on `/applications` displays a title, a company, a salary and a link to the posting, which is an advert by any reading. Feature 11 did the verification work against Adzuna's actual terms; this spec applies that verified conclusion to a second screen rather than re-verifying it, and says so. The alternative readings were rejected because the one obligation the project has spent real effort getting exact is the wrong one to start interpreting loosely.

Two corrections fell out of tracing values rather than from reading prose, which is worth recording because it is the second time this has happened on this feature's chain. The `Listing` schema guarantees only one of the four non empty checks the `application` table enforces: `job_url` is safe because a URL cannot be empty, while `sourceJobId`, `title` and `companyName` are plain `z.string()` and would pass an empty value through to an insert the database refuses. Fixing it in the shared schema rather than at the action's boundary was chosen because an untitled listing is already useless on the results list, and feature 11's own per item parse already has the right behaviour for a bad row. And spec 0003 states the `job_description` full text claim twice, not once. A grep for the obvious wordings finds only the first; the second says "full listing body". Spec 0013's Follow-up item, written to correct this, names only the first occurrence, so the item that exists to fix the error is itself incomplete.

## References

**Project sources**:

- `AGENTS.md`, the "Parse at every boundary" rule, the store raw and format at render rule, and the no silent failures rule.
- Spec [0001](../0001-stack-and-architecture/index.md), binding rule 4 (a named span opens first), binding rule 5 (external calls wrapped), binding rule 6 (every Server Action verifies its own caller). Binding rule 8 is about deferred tooling choices and is not the parse rule.
- Spec [0003](../0003-data-model/index.md), the `application` table, AC-7 (duplicate refused by the constraint), AC-8 (orphan refused by the foreign key), invariant 10 (`updated_at` never written by application code), and its Follow-up items at lines 274 and 275.
- Spec [0010](../0010-profile-entry/index.md), AC-8, the confirmation flow whose URL mutates nothing, reused here rather than reinvented.
- Spec [0011](../0011-usage-gating-and-kill-switch/index.md), the `job_search` call type and its 25 per account per week cap, which is the budget this design protects.
- Spec [0013](../0013-job-search-and-results-list/index.md), the `Listing` shape, AC-6 and AC-7 (both attributions), invariant 4 (per displayed advert), and the Follow-up items this spec closes.
- `src/features/profile/actions.ts:346` and `src/features/profile/failures.ts:110` and `:119`, the existing mapping of Postgres `23505` and `23503` onto failure kinds.
- `src/lib/supabase/server.ts:31` and `:56-60`, the injected cookie adapter parameter and the writing default this feature deliberately replaces.
- `src/features/legal/stored-fields.test.ts`, the privacy notice drift guard that fails the unit suite when a migration adds an undescribed column.
- `supabase/migrations/20260825162457_data_model.sql:168-200` and its four `application_*_own` policies.
- The installed Next.js 16.3.1 documentation shipped in this repo at `node_modules/next/dist/docs/`, specifically `01-app/02-guides/data-security.md:526` and `528` on closure encryption, and `01-app/02-guides/server-actions.md:74` on when a route is re-rendered.

**Practices and standards**:

- WCAG 2.2 criterion 3.3.4, Error Prevention for legal, financial and data changes, which covers deleting user controllable data and asks for reversible, checked, or confirmed. This is why removal is confirmed rather than a single click.
- Let the database hold the invariant, not the caller: uniqueness and pairing are check and unique constraints, so they hold for a caller that forgot to check.
- Store raw, format at render, so a stored figure is never a rendered string.
- Idempotency by constraint rather than by convention: the second apply is refused by the schema, which is what makes a double submit safe.
