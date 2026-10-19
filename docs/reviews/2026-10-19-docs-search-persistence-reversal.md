# Review, docs/search-persistence-reversal, 2026-10-19

**Reviewed by**: Claude Sonnet 5.5 (author on an earlier session of the same lineage; no code changed)
**Scope**: 12 files, branch vs main (merge base b3a4a3a)
**Verdict**: Approve with nits

## Summary
The branch adds spec 0026, which ratifies reversing the "search results never persist" rule for ATS listings only, and threads dated notes into specs 0003, 0008, 0013, 0014, 0015 and 0019 and into scope.md. The boundary table, ten decisions, 27 acceptance criteria (one claim each, mostly) and the audit are internally consistent. I spot checked the cited code and found the claims accurate. I found no remaining statement of the old rule that contradicts the spec. The findings below are small.

Verified against the repo: `application.source` check `('adzuna')` at `supabase/migrations/20260825162457_data_model.sql:173`; `listingSnapshotSchema` at `src/features/applications/schemas.ts:29` with its Adzuna only literal; `demo_result` columns `band`, `matched_skills`, `not_mentioned_skills`, `ungrounded_skills` in `20260913120000_demo_result.sql`; the privacy notice and `stored-fields.ts` do not say search results are unstored; rows 40, 42, 22, 45, 51 exist in scope.md; the sweep of `docs/specs/*/index.md` and `rationale.md` for persist wording found no spec absent from the audit; `src/` and the nested AGENTS.md files hold no contradicting statement (the only hits are the two migration comments, correctly left alone, and "stateless" in unrelated senses).

## Minor
### 🟡 Stale line number in the audit, `docs/specs/0026-search-persistence-reversal/rationale.md` (section "The two stale claims in spec 0013", item 1)
**Problem**: It says the standing rule "is where line 819 of `scope.md` sits today". It is at line 829 (the file's own verify.md says :829).
**Why it matters**: The same paragraph says to cite by heading because lines move, and the reflex on fixing every instance of a corrected claim applies. A reader following 819 lands on the wrong bullet.
**Suggested fix**: Drop the number or correct it to the heading only.

### 🟡 Verify evidence rests on scripts nobody can rerun, `docs/specs/0026-search-persistence-reversal/verify.md:25-26`
**Problem**: AC-19 and AC-20 cite `ac19.py` and `ac20.py` in a scratchpad. They are not committed and the exact term list and match rule live only in the prose.
**Why it matters**: The scope row justifies "no test" by saying the AC-19 search "stays a manual step", but a manual step with no committed command is not repeatable, so the one durable check is not actually durable. The "no test" decision itself is sound (a test over prose would fail on unrelated edits), but the manual step should be reproducible.
**Suggested fix**: Put the one line grep (with the full term list) in the build plan step 8 or verify.md, using `grep -RiE` and printing the exit status.

### 🟡 Ingest write path not flagged for feature 43, `docs/specs/0026-search-persistence-reversal/index.md` (Boundary table "Written by" and Follow up)
**Problem**: The table says ATS rows are written by "the ingest route (feature 43), never a user". Root AGENTS.md says only `src/lib/supabase/secret.ts` builds a secret key client, it may not be imported under `src/app`, and routes under `src/app/api/` may not read or write user data. Stored jobs are not user data, so the route is allowed, but the write needs an authorised path that is not a secret key import in the route. Spec 0021's demo refresh already solved this once.
**Why it matters**: Feature 43 inherits a boundary table that reads as if the route just writes. The rule is not violated, but a Follow up pointing at the demo refresh precedent would stop it being re argued.
**Suggested fix**: Add one Follow up line for feature 43 naming binding rule 1 and the demo refresh route as the precedent.

### 🟡 Bare commit hash, `docs/specs/0026-search-persistence-reversal/verify.md:28`
**Problem**: `git diff 771495b` is given with no statement of what the commit is (the commit that added spec 0026).
**Why it matters**: The identifier reflex asks for what a reference points at. It is also an odd baseline: the AC-22 diff should be against the merge base or main to cover the whole branch.
**Suggested fix**: Say "`771495b` (the commit that added spec 0026)" or diff against `main`.

## Nits
- ⚪ `docs/scope/scope.md` row 40 "Test it": it reads `[ ]` with "skipped". Other rows tick skipped steps differently in places, check convention consistency.
- ⚪ `docs/specs/0026-search-persistence-reversal/index.md` AC-19 and AC-21 each bundle several claims (every hit audited, each marked with a reason; dated, inline, names 0026). The reflex on one claim per AC would split them.
- ⚪ `docs/specs/0026-search-persistence-reversal/index.md` Status is `In Progress` while scope shows verify PASS. This is intended until AC-27 closes, no action.

## Strengths
- Boundary table plus a quotable rule block gives later ATS specs one citation, and the reversal stays narrow (Adzuna search unstored, scores per render, `application` snapshot kept).
- The audit is honest about its own method (completeness marked inferred, repeated sweep, cross check additions), and the 0013 stale claims were verified against the repo before being struck rather than carried forward.
- Notes are dated, inline and non rewriting, matching how scope.md already treats the struck rule; deferred decisions (retention, application link, `source` values) are handed to named features with verified constraints.

## Test coverage
Test signal is configured, but this is documents only. Declining a test for feature 40 is justified: a vitest test over prose would break on unrelated doc edits and prove nothing about behaviour. The gap is only that the AC-19 manual search is not recorded as a reproducible command (see Minor).
