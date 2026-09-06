## Context

Adzuna's search response carries only a description snippet, confirmed directly against a recorded fixture (`test/fixtures/adzuna/search-software-engineer-boston.json`): all 20 results in that fixture hold a description of exactly 500 characters, each one ending in a trailing "…" that Adzuna itself appends. The cut lands mid word or mid sentence, never at a clean boundary. Spec 0013 already documents that this is a snippet, not the full posting (AC-8, its Feature design table, and its own Follow-up correcting spec 0003's wrong claim that `job_description` stores "the full listing body"). Nothing in this project fetches the full posting today, and `job_url` (the `application` table's own copy of Adzuna's `redirect_url`, spec 0014 AC-2) is the only link to it.

This feature's whole usability point is showing matched and missing skills, not just a number (scope.md, feature 14). Scored against a 500 character excerpt, a naive "missing skills" claim is systematically wrong in one direction: a skill the full posting actually requires, but that never appears in the visible 500 characters, reads as a confirmed gap when it is really an unknown. The false claim is a specific failure mode (asserting a requirement the visible text never actually stated, drawn instead from the model's own general expectations of what a role like this "usually" needs), not merely an incomplete one.

Spec 0012, revised the same day as this design (2026-09-06), already fixed what this feature is not free to redecide: `ai_scoring` is one call per listing (never batched), resolves to OpenAI's `gpt-5.6-luna` at `reasoningEffort: "medium"`, `maxOutputTokens: 2048`, `temperature` left unset because the API rejects `temperature: 0` at that reasoning effort. That last point makes `ai_scoring` non deterministic, accepted on the explicit assumption that this feature's bands are coarse categories, not exact scores, so ordinary sampling variance only ever flips a boundary adjacent pair between two neighboring bands and never moves a clear fit pair off its band. `usage_cap` is seeded at 500 (account, week) / 1320 (global, day) / 40000 (global, month), sized on the assumption that every listing a search returns gets scored automatically, at Adzuna's own `RESULTS_PER_PAGE = 20` (`src/features/search/adzuna.ts:36`), a worst case of about $105.60 a month. Measured real call latency is 3.1 seconds for `ai_scoring`; run across 20 listings sequentially that is over a minute, so this feature has to fire its 20 calls concurrently or a single search becomes an unacceptable wait.

The profile this feature scores against already exists (spec 0010): `full_name`, `location`, `summary` (≤4000 characters) on `profile`; an unbounded list of skill names on `profile_skill`; an unbounded list of `work_experience` entries; and one optional `job_preference` row (`desired_titles`, `desired_locations`, `remote_preference`, `minimum_pay`, `minimum_pay_currency`). Nothing bounds how much of this a user has written, so the prompt built from it must impose its own bound or spec 0012's ~2000 input token placeholder stops holding for a long tenured user.

Spec 0008's AC-6 already states that this feature's own scoring gate "layers onto the landing rule's callers, it does not replace the rule": a thin profile still lands on `/search`, it just should not be scored as if it were a real basis for a judgment.

A job description is untrusted text reaching a model automatically, not text a user chose to paste. `docs/jobhunt-carry-forward.md`'s feature 14 entry verified this exact risk shape against `MadsLorentzen/ai-job-search` (MIT): postings are treated as untrusted input, the model follows no instructions embedded in them, and fetches no links from their body, an instruction level defense rather than a sandbox.

Fetching the full posting from `job_url` was named as an option worth weighing (the carry forward doc, and the engineer's own brief). Checked directly against Adzuna's terms of service (`https://developer.adzuna.com/docs/terms_of_service`, fetched 2026-09-06): it says nothing about automated fetching, crawling, or volume limits on following `redirect_url` links, one way or the other. `AGENTS.md` also states plainly that this project has no headless browser yet ("Playwright is the recorded choice and arrives with the first feature that needs a browser"), which many real career pages would need since they render their content with JavaScript.

## Options considered

### Option 1: Score the snippet, relabel the semantics honestly (chosen)

Score against the 500 character snippet as it exists today. The prompt explicitly tells the model the description is Adzuna's own truncation (marked by a trailing "…"), instructs it never to assert a requirement the visible text does not actually state, and the schema renames what would otherwise be called "missing skills" to `notMentionedSkills`, displayed under a label that says plainly this is not a confirmed gap.

**Pros**:
- Zero new infrastructure: no new external call, no new failure surface, no change to the 3.1 second per call latency or the 20 way concurrency budget spec 0012 already assumed.
- Avoids the Adzuna terms of service ambiguity and the missing headless browser dependency entirely.
- Ships now, against a stack this project already has.

**Cons**:
- Does not close the actual information gap: a skill the full posting genuinely requires but the snippet never shows stays invisible to this feature forever, correctly reported as neither matched nor not mentioned rather than wrongly reported as missing, but still unreported.

### Option 2: Fetch the full posting via `defuddle` from `job_url`

Follow `redirect_url` after each search, extract clean text with `defuddle` (github.com/kepano/defuddle), and score against that instead of the snippet.

**Pros**:
- Solves the underlying problem at its root: scoring against what the posting actually says, not a truncated excerpt.

**Cons**:
- A new automated fetch of an Adzuna tracking redirect at real volume (up to 20 times per search), a use Adzuna's terms neither permit nor forbid, verified directly against their current terms of service.
- Many destination pages are JavaScript rendered and unextractable by a plain fetch; this project has no headless browser today, and adding one to score job listings is a much larger decision than this spec's own scope.
- A third external call per listing, on top of the vendor call, multiplies the failure surface and the latency risk right where this feature already needs tight concurrency to avoid a multi minute wait.

### Option 3: Snippet only, generic caveat

Keep "missing skills" as a label, add a plain disclaimer somewhere on the page that scoring is based on partial data.

**Pros**:
- Cheapest to build: a copy change, no prompt or schema change.

**Cons**:
- Does not fix the actual claim: a page level disclaimer does not stop an individual card from confidently asserting a specific skill is missing when it was never actually confirmed absent from the posting, which is the systematic error this design set out to resolve.

## Rationale

Option 1 wins because the two forces that would justify Option 2 both point away from it at this project's current size: Adzuna's terms leave automated redirect fetching neither blessed nor forbidden, and a meaningful share of real postings would need a headless browser this project has deliberately not installed yet. Building that pipeline now would mean absorbing a compliance judgment call and a new infrastructure component inside a feature whose actual job is the rubric and the concurrency, not scraping. Option 3 is ruled out because it treats the problem as a labeling nuisance rather than what it is: a specific, nameable failure mode (asserting a requirement the visible text never stated) that a page level disclaimer does nothing to prevent on any individual card.

Option 1's own cost, an unclosed information gap on requirements the snippet never shows, is accepted rather than hidden: it is recorded in Consequences, and Follow-up keeps the fetch option parked rather than closed, so a future feature can pick it up once this project has a deliberate reason to add a browser and has asked Adzuna directly rather than inferring from their silence.

The remaining design choices in this spec (five bands, the profile input bounds, the sponsorship signal kept separate from the band, the ephemeral no cache scoring, the zero skills gate, the sort once behavior, and the per card versus page level failure split) were each walked with the engineer as their own question rather than bundled into this central one; each is recorded where it is used, in `index.md`'s Feature design and Consequences, not repeated here.

One of those, the sort once behavior, has a real alternative worth naming here since it was weighed against a materially different design, not just a variant of the same one: per card streaming, where each card renders its own band the moment its own `ai_scoring` call resolves, with no shared barrier and no single visible reorder. That alternative removes the up to 30 second worst case wait Consequences names, at the cost of the list visibly shuffling under the reader as different cards resolve out of order, and it does not deliver a genuinely ranked view, since most cards would still be unscored at first paint. The engineer chose the one time reorder specifically because scope.md's own Done-when clause and the entry page's "ranked results with reasoning" claim (spec 0006, AC-8, moved to working by AC-15) call for a real ranked list, not a list that merely acquires badges over time.

## References

**Project sources**:
- `test/fixtures/adzuna/search-software-engineer-boston.json`, read directly 2026-09-06: confirms the 500 character hard truncation and the trailing "…" Adzuna appends, across all 20 fixture results.
- Spec 0012 (model client router), Accepted, revised 2026-09-06 in the same design session: the fixed vendor, model, call shape, `usage_cap` volumes, and the determinism decision this feature's band rubric absorbs.
- Spec 0013 (job search and results list), Accepted: `descriptionSnippet`'s own documented limitation, `RESULTS_PER_PAGE`, the non caching precedent this feature follows.
- Spec 0014 (apply redirect and application record), Accepted: `job_url` as Adzuna's `redirect_url`, `job_description` as the same snippet.
- Spec 0010 (profile entry), Accepted: the profile, skills, work history, and preferences schema this feature reads.
- Spec 0008 (app shell and navigation), Accepted: AC-6, the landing rule this feature's own scoring gate layers onto without replacing.
- `docs/jobhunt-carry-forward.md`, feature 14 entry: the snippet problem's original framing, the verified prompt injection defense pattern, and the fetch option's own named risks.
- `AGENTS.md`: no headless browser installed yet; the folder by feature rule; the error model (`failure()`, `attempt()`, `FailureKind`).
- `.agents/skills/vercel-react-best-practices/rules/async-suspense-boundaries.md` and `server-parallel-fetching.md`: the Suspense pattern (fallback renders immediately, the data holding component streams in) and the parallel fetching via composition pattern this spec's own sort once, score concurrently design applies directly.

**Practices & standards**:
- Instruction level defense against prompt injection in untrusted model input (no sandbox exists for this; treat the input as data, never as instructions).
- Anchored rubric bands over an open numeric range, so a coarse category absorbs ordinary model sampling variance rather than exposing it as a misleadingly precise number.

**Links** (web verified 2026-09-06):
- Adzuna terms of service: `https://developer.adzuna.com/docs/terms_of_service` (confirms no stated position on automated fetching, crawling, or volume limits for `redirect_url` links; states the API's own rate limits and its Jobsworth and standard attribution requirements, unrelated to this question).
