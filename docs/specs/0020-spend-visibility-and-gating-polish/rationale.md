# 0020. Spend visibility and gating polish, rationale

## Context

Feature 28's Done when names three things: a user can see their own usage against their cap, a newly added call type is gated by default, and the kill switch stays a last resort. The first is a real gap. The other two needed checking against the code before assuming either was missing, since scope rows are written at design time and can go stale (see the verification evidence below).

The real design problem is narrow: `usage_cap` and `usage_gate_counter` both have row level security enabled and forced with zero policies (spec 0011), and `usage_gate_counter` additionally has no grant to any Data API role at all, not even `service_role`. `check_usage_gate`, the one function that reads and writes either table, is `security definer` specifically so it can do that without a policy. A signed in user's own Server Component render has none of that privilege, by design: the whole point of spec 0011's shape was that nothing under `src/app` could read these tables directly. Spec 0011's own follow up anticipated this moment and suggested a `select` policy as the fix; this spec had to decide whether that is actually the best of the choices available, not just the first one suggested.

A second, smaller force shaped the design once the first was settled: `usage_gate_counter.consumed_count` and `attempt_count` mean different things (spec 0011 AC-9), and the cap itself is checked against `consumed_count`. Showing the wrong one would state a number that does not match what actually blocks the caller.

## Options considered

### Option 1: a new, strictly read only `security definer` function

A new Postgres function, parallel to `check_usage_gate`, derives the caller from `auth.uid()` internally and returns `job_search`'s own account week window `consumed_count` and the matching `cap_value`. It takes no `call_type` parameter, read only, and no grant changes on either table.

**Pros**:
- Keeps both tables' access shape exactly as spec 0011 shipped it: no policy on either, reachable only through a `security definer` function. One mental model, not two.
- One round trip returns both the count and the live cap value together, so the cap change stays visible with no deploy (AC-5) without a second query against `usage_cap`, which today grants `select` to `service_role` only and would otherwise need its own new grant.
- The function can enforce the exact `period_start` expression `check_usage_gate` uses in one place, closing the week boundary risk structurally rather than by convention.

**Cons**:
- A second `security definer` function to write and review, alongside `check_usage_gate`.

### Option 2: a row level security `select` policy

Add a `select` policy on `usage_gate_counter` scoped to `profile_id = auth.uid() and scope = 'account'`, granted to `authenticated`, plus a way to read the matching `usage_cap` row.

**Pros**:
- This is what spec 0011's own follow up suggested at design time.
- No new function to write; policies are the more familiar Postgres idiom for owner scoped reads.

**Cons**:
- Needs two separate grants, one per table, where Option 1 needs none. `usage_cap` currently grants `select` to `service_role` only; widening it to `authenticated` is itself a privilege change this option would need to make.
- A policy that is even slightly wrong, for example missing the `scope = 'account'` clause, exposes more than intended: `attempt_count`, other call types' rows, or rows belonging to other windows, since a policy governs the whole row, not the two fields a display actually needs. Option 1's function returns only the two fields by construction.
- Breaks the single sentence this schema could otherwise keep true, "these two tables are touched only through a function", into two different, table specific claims that are easier to let drift apart.

### Option 3: read through the secret key client

Treat a Server Component as a fourth caller of `src/lib/supabase/secret.ts`.

**Pros**:
- Bypasses row level security entirely, so no policy or function design question exists.

**Cons**:
- Spec 0001 binding rule 1 is explicit: "Adding a fourth caller means editing this spec." This is the one option that cannot be built without reopening a spec the engineer named up front as not open to reinterpretation per feature, and the other two options need no such exception.

## Rationale

Option 3 is ruled out first: the whole point of asking for this design before code was to find a path that does not touch binding rule 1, and two such paths exist, so paying that cost is not necessary.

Between Option 1 and Option 2, the deciding force is the same one spec 0011 already used once, in Option 1 versus Option 2 of its own design: `usage_gate_counter`'s access surface is small today specifically because exactly one function touches it, and that is auditable precisely because it is singular. A `select` policy would make that two mechanisms doing overlapping jobs, one already proven correct and one new. Option 1 also answers AC-5 (the live cap value) for free, since the same function reads `usage_cap` under its own definer privilege without needing a grant that table does not have today. Reusing `check_usage_gate`'s own hardened shape, `security definer`, `set search_path = ''`, `auth.uid()` read internally, costs nothing new to design; Option 2 would have to re-derive the same guarantees as a policy predicate instead, which is a less familiar place to get an off by one clause wrong (for example, forgetting `scope = 'account'` and exposing global rows that carry no owner at all).

**Corrected during design, a cross check on this spec (2026-09-11):** the function was first drafted taking `call_type` as a parameter, matching `check_usage_gate`'s own shape. That would have let any signed in caller read `usage_cap` and the `configured` state for `ai_scoring` or `ai_check` too, not only `job_search`, a wider readable surface than the unchanged table grants suggest, and wider than this spec's own display scope decision (AC-9) calls for. The function was changed to take no parameter and read `job_search` only, the same closed by design treatment `gate.ts` already gives `UsageGateReason` ("a sixth reason is a spec change, never a call site choice"). Renamed to `get_job_search_usage_summary` (and its TypeScript wrapper to `getJobSearchUsageSummary()`) so the name states what it actually reads, rather than implying a generality the function no longer has.

## Options considered: where the notice renders

A second decision, reopened partway through design after the first answer did not hold up under its own stated objection.

### Option A: the profile page, a new section

The count sits beside the profile page's existing identity, experience, skills and preferences sections, since it is account level information.

**Pros**:
- Reuses the existing `SectionCard` shell with no new component.
- If this ever grows to show `ai_scoring` or `ai_check` usage too, this is the natural home for a number that would then span more than one page's worth of activity.

**Cons**:
- The stated reason for picking it, that `/search` "ties an account wide number to one particular page," does not survive AC-9's own scope decision: v1 shows `job_search` usage only, and `/search` is the only place in the app a `job_search` call is ever spent. The number is not account wide at this scope, it is the job search number, and the objection was importing a concern that only applies to a scope this spec explicitly declined.
- The refusal sentence already renders on `/search`. A count on `/profile` closes the gap between "informed" and "surprised" only for someone who happened to visit `/profile` first; for everyone else the first time they see the number is still the moment of refusal, which is the exact outcome this feature exists to prevent.

### Option B: the search page, above the form

The count renders inside `SearchPage`, above the `hasQuery` conditional, on every visit, bare or with results.

**Pros**:
- Answers the feature's own purpose directly: the cap is legible before a search that might be refused, not only reachable somewhere else in the app. The refusal sentence and the count now share one page, so a person sees the number before they ever need the refusal to explain it.
- Needs no cross page link and no anchor: the two pieces of information that belong together, "here is your count" and "here is why you were refused," are already on the same render.

**Cons**:
- If this ever shows `ai_scoring` or `ai_check` usage too, `/profile` becomes the better home and this moves; a small, later cost (Consequences, negative/tradeoffs).

## Rationale: where the notice renders

Option A was the first answer, and its own stated objection to Option B is what reopened it: once AC-9 scoped the display to `job_search` alone, the premise behind "ties an account wide number to one particular page" stopped applying, since that number now only ever exists on that one page. With the objection gone, both remaining forces point at Option B: the feature's purpose is legibility before a refusal, and `/search` is where that refusal already renders. Building for a future `ai_scoring`/`ai_check` display, which is exactly what would make Option A's remaining advantage real, is the same premature generalization AC-9 itself declined to make one level down; paying a small relocation cost later if that day comes is preferred over designing for it now.

## Verification: clauses 2 and 3 of feature 28's Done when

**Clause 2, gated by default.** Two ways a call type could escape gating, both checked directly:
- Forgetting to configure caps: `check_usage_gate` (`supabase/migrations/20260902120000_usage_gating.sql`, lines 158 to 192) checks all three `usage_cap` rows for the `call_type` before touching any counter row, and returns `configured: false` if any is missing. `gate.ts` maps that to `usage_gate_misconfigured`, a real `failure()` that blocks the call. An unconfigured call type fails closed today.
- Forgetting to wire a new call type through the gate at all: `withUsageGate()` (`src/lib/usage-gating/with-usage-gate.ts`) invokes its callback only on the allowed branch, so a caller cannot spend the outbound call without checking `allowed` first. Both real call types already funnel through it: `job_search` in `src/features/search/adzuna.ts`, and both AI tiers behind `callTier()` in `src/lib/ai/client.ts`, whose own comment calls itself "the one door every AI model call walks through." A fourth call type added inside that router inherits the gate with no new call site code.

Both halves hold today. Nothing in this spec changes either.

**Clause 3, the kill switch stays a last resort.** `checkUsageGate()` still calls `readKillSwitch()` before the atomic window check, unchanged by anything in this spec. Spend visibility is a read of `usage_gate_counter` and `usage_cap`; it has no path back into the kill switch at all.

---

## Revision, 2026-09-12: what the usage line shows on a search render

### Context

The first version of this spec never asked what the number should mean on a render whose own search has not been counted yet. `/check verify` drove the built feature on 2026-09-11 and found the answer the code had picked by accident: `UsageNotice` and `SearchResults` render as siblings, both read, and the usage read finishes first, so a search render always reported the count from before its own search. Four consecutive trials, then a fifth at the boundary: an account seeded to 24 of 25 ran its last allowed search, the page rendered `Searches used this week: 24 of 25` while the database held 25, and the next search was refused. The last thing the page told that person before refusing them was that they had a search left.

That is not a cosmetic lag. This spec's own Summary says the feature exists so a refusal is information the person already had. At the only moment that promise is tested, the feature was breaking it.

### Options considered

**Option 1: copy alone, wording the line as "before this search".** Rejected outright, and it is worth saying why rather than just dismissing it. It is honest, cheap, and touches nothing. It also fails the only test that matters: at 24 of 25, "24 of 25 before this search" still leaves a reader to do the arithmetic that tells them whether another search remains, and the whole point of putting a number on the page was to spare them that. Copy cannot fix a number that is wrong.

**Option 2: sequence the page, read usage after the search resolves.** The cheapest correct fix. Cons: correctness sits in the order of two statements in `SearchPage`. This page already parallelizes independent reads (`Promise.all` over the applied and scoring reads, at `src/app/(app)/search/page.tsx:243`, inside `SearchOutcome`), so folding a third read into that pattern is a natural, well intentioned edit that would silently restore the defect with every test still green.

**Option 3: `searchListings()` owns the post gate read.** Same correctness as Option 2, with the ordering moved next to the gate call that makes it necessary. Cons: still a guarantee held by ordering, and it widens `searchListings()`'s return type to carry a number that has nothing to do with searching.

**Option 4: the gate returns the number its own decision produced.** `check_usage_gate` already computes the account week `consumed_count` atomically inside the transaction that increments it, so it could return it and the search render would report the exact figure its own call produced, with no ordering to preserve. Chosen first, then dropped; see the Rationale below, because the reason is not obvious and the option is attractive enough to be proposed again.

**Option 5, chosen: order the existing read by a data dependency.** `SearchPage` awaits `searchListings()` and passes the resolved result to `UsageNotice` as a prop; the read stays inside `UsageNotice`, so it cannot begin until that prop exists. Pros: one mechanism for every render, no SQL change, no new special cases, and an ordering that cannot be undone by reordering statements. Cons: the property that makes it correct (the read living inside the component) is invisible at the call site, and one extra round trip per search render.

### Rationale

Options 2 through 5 all produce the right number on the happy path. The engineer's opening framing offered Option 4 as "the only option correct by construction", and that needed one correction before it could be recorded as a reason: sequencing is not a race. PostgREST commits each RPC before responding and this project runs no read replica, so a read issued after `searchListings()` resolves cannot miss the increment. Recording "the others are racy" would have put a false premise into the spec and made the decision look forced.

Option 4 was chosen on that corrected basis and then dropped by a cross check, on a single fact that decides the whole question: **returning the count from the gate does not remove the second read, it adds a first one.** Three paths never produce a gate figure, verified in the code rather than reasoned about. Both kill switch refusals return at `src/lib/usage-gating/gate.ts:135` and `:139`, before the `.rpc()` at `:149`, so two of the five refusal reasons never reach the SQL function. `validation_failed` returns from `searchListings()` before its `withUsageGate()` call, on a render `hasQuery` still reports as a search. And `withUsageGate()` discards the decision when the wrapped call fails (`with-usage-gate.ts:50`), so a search that spent budget and then failed at Adzuna loses the number on the one path where somebody paid for nothing.

`UsageNotice` therefore has to read for itself on all of those regardless of what the gate returns. Option 4 ships two mechanisms plus the logic choosing between them, and pays for it with a drop and recreate of the atomic gate, an amendment to `Accepted` spec 0011, two fields on `UsageGateDecision` that two of its three call types ignore, and edits to four test files that assert the decision shape exactly. Its one remaining advantage is provenance, what a specific call cost rather than what the counter now reads, and nothing in this product consumes that. A cost that is certain, paid for a benefit that is hypothetical, is the trade this spec should not make.

Two further facts about Option 4 are recorded so a later revisit starts from the real price rather than the attractive summary. Postgres cannot change a function's return type in place, verified against this project's database, so it is a drop and recreate of the most safety critical function in the codebase, and a drop takes the grants with it. And naming the new output columns `consumed_count` and `cap_value` collides with the six unqualified references already in the body: plpgsql raises `column reference "consumed_count" is ambiguous` at runtime, reproduced directly, so the columns would need renaming too.

What makes Option 5 correct is worth stating precisely, because it is easy to mistake for Option 2 and dismiss on Option 2's weakness. Option 2 puts the ordering in the order of two statements, where a later `Promise.all` undoes it. Option 5 puts it in a data dependency: `UsageNotice` cannot render until `SearchPage`'s `await` resolves, because its prop is that awaited value, and the read lives inside the component. There is no statement to reorder, and undoing it means hoisting the read out of the component and back up the tree, which is a deliberate structural change rather than a plausible tidy up. **[Corrected 2026-09-13: this sentence is wrong and is the worst sentence in this file. It was written about the shipped shape, where the ordering was not in the prop at all but in `SearchPage`'s `await`. It is also wrong about the shape that replaced it: folding the two awaits into one `Promise.all` inside `UsageNotice` reorders them with no hoisting and no structural change, uses the prop, and lints clean. There is always a statement to reorder. Left in place rather than edited, because this paragraph is the record of what was believed on 2026-09-12 and the belief is the thing worth keeping.]** That is the entire difference between the rejected option and the chosen one, and anyone revisiting this should see it before treating the two as the same idea.

The honest weakness of Option 5 is that this property is invisible where the component is used. `<UsageNotice searchResult={result} />` does not announce that the prop's only job is to exist. The mitigation is the invariants list and a boundary test that asserts the rendered figure rather than that a read happened; a test written the lazy way would pass against the broken code too.

An earlier draft of this reasoning also claimed the `Promise.all` sat two lines from the sequencing it argued against, when it is about 150 lines away inside a different function. The habit argument survives that correction; the adjacency claim did not, and nothing here rests on it.

### On AC-10's framing

The original AC-10 and Summary both said this spec fixes "two sentences in the privacy notice". Reading the rendered `/privacy` page rather than the source showed that only one of them is there. `usage_gate_counter.call_type`'s `describedAs` renders; `usage_cap`'s text is `NON_PERSONAL_TABLES[].why`, and its only reader in the entire codebase is `src/features/legal/stored-fields.test.ts`. Both corrections are still worth making, because the registry is what the next person reading this codebase will believe, but the spec was claiming a user visible fix it was not delivering, and a criterion that overstates its own reach is one nobody can verify honestly. Corrected in place rather than dropped.

---

## Correction, 2026-09-13: the prop never held the ordering

### What happened

The 2026-09-12 revision chose Option 5, "order the existing read by a data dependency", and shipped it. A `/check review` on Fable 5.1, run before opening the pull request, found that the shape shipped is not the shape the words describe. `SearchPage` awaited `searchListings()` before returning its tree, so `UsageNotice` could not render until the search resolved no matter what it was passed. The `searchResult` prop was never read, `void searchResult;` awaited nothing, and React does not await props. The `await` before `return` was the whole mechanism.

Five places said otherwise: this spec's Decision, AC-11, and invariants list, plus `usage-notice.tsx`'s header and `page.tsx:112` ("Removing the prop compiles and renders and quietly brings the boundary bug back").

### The evidence, measured rather than argued

Four experiments, all run against the working tree on 2026-09-13 and reverted afterwards:

1. **Remove the prop entirely, keep the `await`.** All 74 page tests pass, including the three ordering tests that DO fail against the pre fix code. The prop is not load bearing.
2. **Drop the `await`, keep the prop.** A type error, at `page.tsx:119` and `page.tsx:131`. Real, but narrow, and not unique: the second error is `SearchResults`'s own `result` prop catching the same edit, so `UsageNotice`'s prop added no tripwire the page did not already have.
3. **Apply the streaming refactor to the shipped shape** (no `await` in `SearchPage`, promise passed down, prop type widened, `void` untouched). Typecheck clean, ESLint clean, and three ordering tests fail. The bug returns silently, with every comment still asserting it cannot.
4. **Build the runner up** (promise passed, awaited inside `UsageNotice`). Typecheck clean, all 74 pass. Then delete that inner `await`: three ordering tests fail AND ESLint reports `'searchResult' is defined but never used`. Two independent guards, one of them at edit time.

Experiment 3 is the one that decides it, and experiment 4 is the one that shows the alternative is strictly better rather than merely different.

### Why the correction changes the code rather than only the words

Rewriting the five places to say "the order is held by `SearchPage` awaiting before it returns" would be honest and free. It was seriously considered and rejected on one ground: that sentence describes Option 2, page level sequencing, which this spec examined on 2026-09-12 and rejected as the shape a later refactor undoes. Keeping the code and telling the truth means recording that the spec chose Option 5 and shipped Option 2. Experiment 3 shows that is not a technicality; the refactor that undoes it is the obvious next change to this page and it passes every gate except the tests.

Option 5 as actually described, promise in, `await` inside the consumer, costs one small reshape of code whose behaviour does not change, and the existing tests are the proof of that. After it, the recorded mechanism and the operating mechanism are the same thing, and a later reader who checks the claim finds it true.

### Where the false premise came from, recorded deliberately

Not from the cross check. That ran on 2026-09-12, on Fable 5.1, and did useful work: it found nine decision gaps and reversed the option choice. It did not question the mechanism because the mechanism arrived as a premise rather than as a proposal.

It came from the engineer's advisor chat, was carried into the decision panel as established, and was ratified by selection. That is the failure the 2026-09-02 reflex names exactly: selecting an option ratifies its stated reasoning into the spec, and a wrong reason is then recorded as a decision and read later as settled. The decision panel that chose this shape presented three options and argued the tradeoff between them competently. Only one of them, the chosen one, carried the prop mechanism, and that one was never checked: the panel debated which option was better without anyone testing whether the winning option worked the way its description said.

Worth recording alongside it: on the same day, this session wrote a reflex describing this exact mechanism. Its text is "a hand written broken `SearchPage` left an `await` inside the JSX, so the ordering the test existed to check was still enforced". That is the same observation, one step from the same conclusion, written and not applied. A rule can be correct, freshly written, and still not fire on the thing in front of you.

### What the second round changed, 2026-09-13, after the cross check

The cross check on the correction (Fable 5.1, the same model that raised the finding) accepted that the new shape closes it, and then found the correction's own overreach. Three things came out of it and are recorded because the pattern is the point:

1. **The count was wrong.** This file and the spec said "four ordering tests fail against the pre fix code" in several places. It is three. Of the five tests in the ordering block, two do not run a search at all or hold the counter constant, so they pass under any composition. Every break run performed during the build printed `3 failed | 71 passed`, so the correct number was on screen repeatedly and was written down wrong anyway. Re measured against the genuine pre fix commit before correcting it.

2. **The `Promise.all` fold defeats the chosen shape too.** `await Promise.all([searchInFlight, getJobSearchUsageSummary()])` uses the prop, typechecks, lints clean, and restores the bug. That is the same edit used to reject Option 2 on 2026-09-12, so the chosen option is weaker than the correction first claimed. It is now named as the forbidden edit in the invariants and in the component header, and the "two independent guards" wording is gone: lint guards deletion, the tests guard reordering, and only the tests catch the fold.

3. **The word structural is retired from this spec's ordering discussion.** Two claims of structural enforcement have now been made about one line, first that the prop held the ordering and then that a data dependency did, and both were false. The spec no longer claims any refactor cannot undo the ordering. It records where the ordering lives and what catches its removal, which is true and stays true. If a third claim of that kind appears in this spec, it should be read as a warning sign rather than as a strengthening.

The promise shape was kept rather than reverted to the plain page level `await`. Its margin over that is smaller than the 2026-09-12 reasoning argued, but it is real: the risky edit moves from the page into one component, lint gains a guard on deletion, and a later `Suspense` boundary becomes additive. Reversing a second time would be churn on working code.
