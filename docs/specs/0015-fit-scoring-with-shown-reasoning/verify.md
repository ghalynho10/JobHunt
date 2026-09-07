# Verify: fit scoring with shown reasoning · spec 0015 · updated 2026-09-07

_Steps derived from spec 0015 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Every step below needs a signed in caller with a real profile, a real Adzuna
search, and real `ai_scoring` budget left, unless it says otherwise. A scored
`/search` render spends up to 20 `ai_scoring` calls plus one Adzuna call, so
plan the run rather than reloading freely.

**Two counter reading rules this feature inherits, both learned the hard way.**
Read `usage_gate_counter` through `test/helpers/database.ts` or `psql`, never
through the Supabase Data API: that table carries no row level security policy
(spec 0011), so PostgREST cannot see it and every reading comes back zero
whatever the app did. And make any counter move on purpose once before trusting
a "did not move" reading.

## UI / manual

- [x] Sign in with a profile that has at least one skill or one work history entry → search `/search?q=engineer` → the result list appears in Adzuna's original order with every card showing `Checking fit against your profile…`, before any band appears → **AC-9**
- [x] Keep watching that same render → the list reorders exactly **once**, when the last outcome lands; it never reorders card by card as scores arrive → **AC-9**
- [x] On the reordered list → `Strong match` cards sit above `Good match`, and `Not a match` sits last → **AC-9**
- [x] Two cards in the same band → they stay in the relative order Adzuna returned them, not alphabetical and not by company → **AC-9**. _Driven by the engineer in a real browser on 2026-09-07, signed in as `dev-one@example.test`: two `Good match` cards held their Adzuna order, neither alphabetical nor by company._

### Keyboard focus across the reveal (AC-16's focus half, AC-17)

_All browser only. The unit project is `node` with no jsdom, no layout and no
focus, so it can prove the keys are on the right controls and that the restore
decision is right when handed an active element, and nothing beyond that. Run
these on one scored search where possible: each reload spends an Adzuna call
and up to 20 `ai_scoring` calls._

- [x] Before the scores land, Tab into a card's "View the posting" link and note which job it belongs to → after the re-sort, focus is on **that same link on that same job**, wherever the card has moved to, and not merely on some control → **AC-16**, **AC-17**
- [x] Repeat on a card near the bottom of the pending list whose band ranks it near the top → after the reveal the page has scrolled so the restored control is visible on screen, not left off screen above or below the fold → **AC-17** (WCAG 2.2, Focus Not Obscured). _Driven by the engineer in a real browser on 2026-09-07: a card tabbed into near the bottom of the pending list, ranked into a top position by the reveal, kept focus on its own `View the posting` link and was scrolled into view._ **This tick is 4 passes out of 5 observed, not 5 out of 5.** The earlier `/check verify` run the same day scrolled correctly 3 times and missed once, leaving the control at `top: 1359` in a 953px viewport, and that miss has never been explained or reproduced. Ticked because the step has now passed every time it was retried, but a single future miss is a known possibility rather than a surprise, and `docs/session-notes.md` holds the fuller account.
- [x] Repeat using the apply button rather than the posting link → focus returns to that card's apply button, not to its posting link → **AC-17** (the key names the control, not just the card)
- [x] **The counterweight, and the one most worth running.** Before the scores land, put focus in the search box and leave it there → after the re-sort focus is **still in the search box** and was never moved onto the list. Repeat with focus on a header link → **AC-17**, rule 1. A version that always restores passes every step above and fails this one
- [x] Load a scored search and touch nothing at all until the reveal → focus is not moved onto any card control → **AC-17** (no control was ever focused, so there is nothing to restore, and moving the reader would be the same focus steal rule 1 forbids)
- [ ] **Two searches, one browser tab, no reload between them.** Tab into a card on the first search and let it reveal; then search again for overlapping terms (`engineer` then `senior engineer`, which Adzuna answers with some of the same jobs) and touch nothing during the second scoring → after the second reveal focus is **not** pulled onto any card → **AC-17**, rule 3. Failing this means a key survived its own use and matched a listing the reader never touched on this page
- [x] On any restored control → the focus ring is visible on it, drawn the same as any other focused control on the page → `AGENTS.md`'s WCAG 2.2 AA bar
- [ ] With a screen reader running on a render that both ranks and restores → note which of the two is actually spoken, the `Results are now ranked by fit.` announcement or the restored control. **Either is an acceptable result**; spec 0015's Consequences records that the pairing decides this and that the spec deliberately does not sequence them. Record what this pairing does rather than treating one outcome as a failure → **AC-16**

- [ ] With a screen reader running, load a scored search → each pending card is announced as busy, and `Results are now ranked by fit.` is announced once when the order changes → **AC-16**
- [x] On any scored card → the second skill list is headed `Not mentioned in this posting` and carries the caption `This posting only shows part of the description, so this is not a confirmed gap.`; the word "missing" appears nowhere on the page → **AC-5**
- [x] On any scored card → the matched skills are all skills the caller actually has in `/profile`, spelled the way the caller wrote them → **AC-5**
- [ ] Find a listing whose visible text states a visa stance → its sponsorship badge renders as its own separate badge beside the band badge, never merged into it → **AC-6**. **Left unticked for want of a listing, not for want of effort.** Across two separate search sessions on 2026-09-07 no listing stated a visa or sponsorship stance anywhere in its visible excerpt. That is a structural consequence of scoring Adzuna's 500 character snippet rather than the full posting (spec 0015's own Decision), so this step may stay unrunnable on ordinary searches. Its counterweight, that a listing saying nothing about visas renders no badge at all, is ticked below and is the half that actually fires on every search.
- [x] Find a listing whose visible text says nothing about visas → no sponsorship badge renders at all → **AC-6**
- [x] Sign in as a caller with zero skills and zero work history → search → the plain unscored list renders plus `Add your skills or work experience to your profile…` with `your profile` linking to `/profile`; no band, no pending indicator, no scoring copy anywhere → **AC-7**
- [x] Add one skill and nothing else to that same profile → search again → every card is scored normally → **AC-7**
- [x] Visit `/` → the "What's real today" card lists `ranked results with reasoning` under **working**, and `a no sign in demo account` is the only thing left under **planned** → **AC-15**
- [x] Read the whole scored page as a reader who has never seen it → no band, badge, or sentence claims the posting requires something the visible excerpt does not actually say → **AC-4**, **AC-12**. _Driven by the engineer on 2026-09-07 against a live `TypeScript` search: 7 scored cards read one at a time against their own visible excerpts. No band, chip or reasoning sentence claimed anything the visible text did not support, and several hedged correctly where the excerpt was too thin ("cannot be verified from the truncated text")._ The same read also settled a suspected defect in the other direction: `notMentionedSkills` is filtered by relevance (`rubric.ts:128-132`), so a Kubernetes focused posting correctly left React and TypeScript out of its not mentioned list rather than flagging them as gaps. That is the schema's `.describe()` instruction working as written, not a filter failing.

## Commands

- [x] `pnpm test` → the unit suite passes, including `src/features/scoring/rubric.test.ts` (the anchors, the truncation caveat, the untrusted text instructions, the post-parse filter) → **AC-1**, **AC-4**, **AC-5**, **AC-12**, **AC-13**
- [ ] `TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "real vendor"` → `test/integration/fit-scoring-live.test.ts` passes against OpenAI, proving the wire schema is one the vendor's structured output mode actually accepts and that the band comes back as one of the five → **AC-1**, **AC-3**
- [x] Read `usage_gate_counter` for `ai_scoring` through `test/helpers/database.ts` immediately before and after a search made by a caller with zero skills and zero work history → the count is unchanged → **AC-7**
- [x] Read the same counter before and after a scored search of 20 listings → it rose by exactly 20, never by 1 and never by more → **AC-3**, **AC-8**
- [ ] In Sentry, open one `/search` transaction for a scored render → exactly one `scoring.score_listings` span, carrying `listings`, `scored`, `refused` and `failed`, with `scored + refused + failed` equal to `listings` → **AC-14**
- [ ] In that same transaction → the `ai.call_tier` spans overlap in time rather than running end to end in sequence → **AC-8**
- [x] Zero the `ai_scoring` `usage_cap` row for a test account, then search → one page level sentence from `SENTENCES` appears above the list, no card shows `Could not score this listing right now.`, and no band renders → **AC-11**
- [x] With the cap zeroed, confirm `usage_gate_counter` did not rise → a refused call never reaches the vendor → **AC-11**
- [x] Point `OPENAI_API_KEY` at an invalid value and search → every card shows `Could not score this listing right now.`, the page shows no cap notice, and the failure sentence is visibly different from the refusal sentence above → **AC-10**
- [x] `pnpm test -t "keyboard focus across the reveal"` → the two placement tests pass → `FocusRecorder` is rendered outside the `<Suspense>` boundary and `FocusRestorer` inside it. **This is the half of AC-17 a test here can hold**: swapping the two would still render, still typecheck and still look right in review, and the only symptom would be that focus is silently never restored
- [x] `pnpm test src/features/search/focus-key.test.ts src/features/search/focus-keeper.test.ts` → the key follows the listing rather than its position in the list, and the restore declines to act while a live element holds focus → **AC-17**, rules 1 and 2
- [x] `pnpm test -t "30 day retention"` → `src/lib/ai/tiers.test.ts` asserts `ai_scoring` carries `store: false` → the retention opt out is in the tier config
- [ ] **The step above proves the config, not the wire.** After a real scored search (or a `TEST_LIVE_MODEL_CALLS_ENABLED` run), open the OpenAI dashboard's Logs view for the same period → the scoring requests do **not** appear there with a stored request and response body. A stored generation is exactly what shows up in that view, so its absence is the observable form of `store: false` actually reaching OpenAI rather than being dropped between `tiers.ts` and the request. This is the only check that would catch the provider silently not forwarding the option.

## Value sourcing

_One step per row of spec 0015's Value sourcing table, so each value's SOURCE is exercised rather than only its presence._

- [ ] Score the same listing against two different profiles → the band, the matched skills and the reasoning all change → the score comes from the caller's own profile, not from the listing alone
- [ ] Sign in as user A, search, note a band; sign in as user B with a different profile and search the same terms → B never sees A's score → the profile scored is always the caller's own, through `readOwnProfile()`
- [ ] Add a skill to `/profile` that no posting mentions, then search → it can appear under "Not mentioned in this posting" but never under "Matched in this posting" on a card whose text does not contain it
- [x] Rename a skill in `/profile` (delete plus re-add with different capitalisation) → the card renders the NEW spelling, proving the displayed name comes from the caller's row rather than from the model's echo
- [ ] Give a profile more than 50 skills and more than 5 work history entries → the scoring still succeeds and the reasoning references only recent roles → the prompt is bounded by `boundProfile()`, not by the row count
- [ ] Set a `minimum_pay` well above every listing's salary, and `remote_preference` to `remote`, then search on site listings → bands still reflect skills and experience; a preference mismatch alone never pushes a listing down a band → the band's source is skills and experience only
- [ ] Break the profile read (stop the database mid render, or point at a bad key) → the page shows `We couldn't read your profile just now…` rather than the "add your skills" sentence, and still renders the results → a failed read never borrows the thin profile's meaning
- [ ] After the one time re-sort, confirm each card's band, skills and reasoning still belong to the job title above them → outcomes are paired by `sourceJobId`, never by array position
- [x] Reload a scored `/search` twice → the counter rises by 20 each time → scores are never cached, which is the cost spec 0015's Consequences records

## Acceptance-criteria coverage

- AC-1 · covered by the unit suite (`rubric.test.ts`) and the live vendor test
- AC-2 · **not covered here, by design.** Whether the five bands spread real listings needs authored variety this feature does not carry; spec 0015 defers it to feature 16's eval harness against feature 15's ground truth set
- AC-3 · covered by the counter step and the live vendor test
- AC-4 · covered by the unit suite and the manual read
- AC-5 · covered by the two manual card steps and the unit suite's filter tests
- AC-6 · covered by the two sponsorship badge steps
- AC-7 · covered by the two profile steps and the counter step
- AC-8 · covered by the counter step and the Sentry overlap step
- AC-9 · covered by the four ordering and immediacy steps, all browser only
- AC-10 · covered by the invalid key step
- AC-11 · covered by the two zeroed cap steps
- AC-12 · covered by the unit suite; the manual read is the only end to end check, and it is a spot check rather than a proof (the defence is instruction level, not a sandbox)
- AC-13 · covered by the unit suite and the over sized profile step
- AC-14 · covered by the Sentry span step
- AC-15 · covered by the entry page step
- AC-16 · the announcement half is covered by the page tests and the screen reader step; the focus half is covered by the browser only focus block above, since no test here can reach it
- AC-17 · covered by the eight browser only steps in the focus block and by the two command steps. The unit suite proves the key attributes are on the right controls, that the key is the listing's identity rather than its position, that the restore declines while a live element holds focus, and that the recorder and restorer sit on the correct sides of the boundary. **Whether a reader actually ends up back where they were is browser only** and the focus block is the only thing that proves it

## Known gaps this list cannot close

- **~~AC-16's focus clause is not proved by any test in this repo, and may not hold.~~ The prediction was right, and it was fixed.** `/check verify` drove the running app on 2026-09-06 and found the reveal dropping focus to `<body>`, exactly as this gap said it might. The spec level decision it called for was taken the same day (spec 0015's second Decision, AC-17): a small client module records the focused control by a stable key and gives focus back to it after the reveal. **The gap that remains is narrower and still real**: no test in this repo proves a reader ends up back on their control, only that the pieces are wired the way AC-17 says. The focus block above is the whole proof, and it is manual.
- **`document.activeElement === body` is a proxy for "the reveal orphaned this reader", not a measurement of it.** A reader who clicks blank page space moments before the reveal reads identically to one the reveal orphaned. Spec 0015's Consequences accepts this as narrow rather than engineering around it, so it is a known behaviour rather than a step that can fail. The "touch nothing at all" step above is the closest thing to a bound on it: with no control ever focused there is no key, so nothing moves.
- **`SCORING_COPY.profileReadFailed` is not in spec 0015's copy table.** It was added during the build for the state the spec left with no sentence, the same way `COPY-6` of spec 0013 and `COPY-8` of spec 0014 were. It needs ratifying into the spec's copy table.
- **~~Spec 0015's first Follow-up item is a release blocker.~~ Closed 2026-09-06**, before this feature reached a pull request, by `fix(ai): opt ai_scoring out of OpenAI's 30 day retention with store: false` (pull request 104). Training was already safe with no action, so the privacy notice's "not used to train models" claim stands unchanged; retention needed `store: false` on the `ai_scoring` tier and now has it. See spec 0015's Follow-up for the full record. Nothing here blocks a release any more, but the two steps below are what actually prove it against a running app.
