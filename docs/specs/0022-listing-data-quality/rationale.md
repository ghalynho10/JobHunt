# 0022. Listing data quality: rationale

## Context

Adzuna is the one job board this project uses, already chosen and already integrated (spec 0013).
Real search results the app has actually returned carry three problems that are not about the
integration being wrong, they are about the source data itself: the same posting sometimes appears
under more than one Adzuna id, a description field sometimes carries the two character sequence
`\n` as literal text instead of a line break, and a salary stated once by the posting can come back
as a minimum and a maximum that are the same number, which renders as a range of one figure to
itself. A fourth, smaller gap sits beside these: a salary Adzuna predicts can, in principle, fall
outside the range the posting's own text states.

These are not hypothetical. The equal salary range case was confirmed and partly fixed
([#130](https://github.com/ghalynho10/JobHunt/pull/130)) before this spec was written. The escaped
newline was seen in a real capture of `/search` on 2026-09-13. A pair of Adzuna ids for the same
company, initially read as a confirmed duplicate, was seen during the seeded demo account's first
production refresh on 2026-09-16.

**That last one needs a correction on the record.** Everpure, Inc. appeared under ids `5883839578`
and `5883870504`, with byte identical description snippets. Spec 0021's own rationale (lines 231 to
233) already explains why an identical snippet is expected rather than suspicious: every stored
snippet in that refresh's batch was exactly 500 characters of the company's own introduction, cut
off before any requirement, so two different roles at the same company would carry the same
boilerplate. The two ids carry different titles, "Software Engineering Manager, Platform" and
"Software Engineer". Read together, this pair is most likely two distinct roles, not one posting
duplicated. **No confirmed duplicate is on record for this project.** This does not remove the risk
the scope row named. It changes what the risk is: the test a dedup key must pass is not "does this
pair collapse," it is "does this pair correctly stay two results," which is a stronger and more
useful test than the one first assumed.

The description text problem is wider than one screen. `descriptionSnippet` is parsed once, in
`src/features/search/adzuna.ts`, and flows unmodified into `/search`, `/applications`, and `/demo`,
and it is also copied onto the stored `application.job_description` column when a user applies. A
fix at render only would leave every already saved row wrong, permanently, since the posting that
produced it may no longer exist to re-fetch from.

Two forces shaped the scope here as much as the defects themselves. First, no third party dedup or
normalization service is warranted for three fields on one integration; this is a small, well
scoped fix to make in place. Second, `AGENTS.md`'s "store raw, format at render" rule exists to keep
a stored value trustworthy and a render logic swappable, and decoding text at the parse boundary is
a genuine, deliberate exception to it: the escaped characters are not a value anything in this app
computes on, they are a display and storage snapshot that was already wrong the moment it was
captured.

## Options considered

### Option 1: Fix the incoming listing data in place (chosen)

Normalize and de-duplicate at the point the data enters the app (the Adzuna parse boundary) and
correct what was already stored, without changing where listing data comes from.

**Pros**:
- Adzuna is already integrated, already terms-checked (spec 0013), and already supports the
  structured filters a later feature needs; nothing about switching sources solves a data quality
  problem that is Adzuna's own aggregation of many boards, not a wrong choice of board.
- The fix is narrow and testable: a decode function, a dedup key, and a comparison fix, each with a
  clear input and expected output.

**Cons**:
- The decode step is a real, if narrow, exception to this project's own "store raw" rule, which
  needs to be stated explicitly rather than quietly departed from.
- A conservative dedup key (below) means some real duplicates, if their title differs even slightly
  between the two ids, will not be caught by this feature.

### Option 2: Switch job board or add a second source

Move off Adzuna, or add a second job board alongside it, on the theory that a different source would
not carry these defects.

**Pros**:
- Would sidestep Adzuna's own aggregation quality entirely, if a cleaner source existed.

**Cons**:
- Adzuna was already evaluated and chosen (spec 0013), with structured filter support this project
  will need next; nothing in the evidence suggests these are Adzuna specific defects rather than
  ordinary job board aggregation noise any source would carry in some form.
- A second source multiplies the parsing, attribution, and rate limit surface this project has to
  maintain, for a problem three small fixes already solve.

### Option 3: A third party listing normalization or dedup service

Delegate de-duplication and text cleanup to an external service or library built for the purpose.

**Pros**:
- Would offload fuzzy matching and text cleanup logic this project would otherwise write itself.

**Cons**:
- Disproportionate for three narrow fields on one integration at this project's current scale (up to
  20 results per search); adds a new vendor, a new credential, and a new failure mode for a problem
  a few hundred lines of tested, in house logic already solves.
- This project's own stack preference (`AGENTS.md`) is to reuse what is already in place before
  reaching for a new tool, and nothing here is complex enough to justify one.

## Rationale

Option 1 is chosen because the defects are about the shape of data already flowing through an
already accepted integration, not about the integration's source being wrong. Options 2 and 3 both
add real new surface, a second vendor's terms and rate limits, or a new service's own failure modes,
to solve a problem that is small, well understood, and already has concrete fixes identified once
the data is read closely (the equal salary case already proved this with #130).

Four sub-decisions carried the real design weight, each settled against the evidence rather than by
default:

**The dedup key.** A composite key of normalized company, title, and location was chosen over a key
that adds a salary bucket, and over fuzzy text matching. The corrected Everpure reading is the reason:
a title difference at the same company turned out to be the real signal in the one case this project
has actually observed, not noise to smooth over. Fuzzy matching on title and description would risk
collapsing exactly that pair. A salary bucket adds a discriminator this project has no evidence it
needs yet. The composite key is deliberately conservative: it will miss a genuine duplicate whose
title differs even slightly between the two ids, accepted because no confirmed duplicate exists yet
to calibrate a looser key against, and because hiding a real result is the specific failure mode the
scope row's own **Done when** names as unacceptable.

**Where normalization happens.** The escape decode runs at the Adzuna parse boundary, not at render,
even though that is a narrow exception to "store raw, format at render." The reason is storage: the
description snippet is copied onto `application.job_description` when a user applies, so a
render-only fix would leave every already saved row wrong forever, since the source posting is often
gone by the time anyone would notice. The exception is bounded deliberately: it applies only to a
named, finite set of escape sequences and HTML entities, decoded once, not a general purpose text
transform.

**The equal salary range comparison.** Comparing the formatted display strings rather than the raw
numbers closes the gap #130 left open (`salaryMin: 109440.2` and `salaryMax: 109440.4` still
rendering as a range under `maximumFractionDigits: 0`). The scope row's own reasoning settles this:
at zero decimal places, the difference between the two numbers is already invisible to a reader, so
whether the two values render the same is the actual question the display is asking, not whether the
underlying floats happen to be equal.

**The backfill mechanism.** The migration defines the decode rule as a named SQL function rather
than a standalone script for a structural reason, not a stylistic one: `src/lib/supabase/secret.ts`
is `server-only` and its caller list is closed by binding rule 1, so nothing outside `src/app` can
build a secret key client to run a one-off script against production, short of editing that binding
rule first. Migrations already reach production through a reviewed CI pipeline on merge to `main`
(spec 0002 AC-11), need no secret key, and add no new caller. The parity test, comparing the SQL
function's output to the TypeScript decoder's on shared fixtures, is what prevents the two from
drifting apart over time, since they are two independent implementations of the same rule by
necessity (one runs inside Postgres, one runs in the request path).

One clause the scope row asked for, "outliers are handled visibly rather than shown as fact," is not
built as new detection here. The concern traces to the reference project this app was built from
(`docs/archive/jobhunt-idea-brief.md` line 125) and has never been observed on this project's real
data. `docs/archive/jobhunt-carry-forward.md` line 367 already frames it correctly as a labeling
problem, which spec 0013 AC-7's existing "(estimated)" label answers: a predicted figure already
reads as predicted, not as fact. A batch relative outlier check was considered and rejected, because
a search returns at most 20 results, mostly predicted, and a statistical bound over that small a
sample would flag ordinary variance as a defect. This is recorded as a scope amendment in Follow-up
rather than left as a silently unmet clause.

A separate, narrower defect, a predicted salary contradicting a figure the posting's own description
states, is deferred rather than built. It has been observed exactly once, in a screenshot capture on
2026-09-13 recorded only in `docs/session-notes.md`, with no listing id, no figures, and no
reproducible fixture. Detecting it reliably means scanning free text for a stated salary inside a
500 character snippet that spec 0021's own evidence shows is usually a company introduction cut off
before any requirement, so a scanner would rarely find anything to compare against, and a naive
scanner risks a false contradiction that suppresses a correct estimate, which would itself be a
silent failure. Building this now, from one unrecorded sighting, risks solving the wrong shape of
problem; the Follow-up item asks for a real case to be recorded the next time one appears.

## References

**Project sources** (verifiable, in this repo):
- `docs/scope/scope.md`, feature 19
- Spec [0021](../0021-seeded-demo-account/index.md), the Everpure citations (corrected by this spec)
  and its `rationale.md` lines 231 to 233
- Spec [0013](../0013-job-search-and-results-list/index.md), AC-7 and the Data model sketch
- `docs/archive/jobhunt-idea-brief.md`, line 125
- `docs/archive/jobhunt-carry-forward.md`, line 367
- `src/features/search/adzuna.ts`, `src/app/(app)/search/page.tsx`,
  `src/features/applications/queries.ts`, `src/features/demo/refresh.ts`, `src/lib/result.ts`,
  `src/lib/supabase/secret.ts`
- Spec [0002](../0002-deployment-and-environments/index.md), AC-11
- `supabase/migrations/20260911120000_job_search_usage_summary.sql`
- `docs/session-notes.md` (Follow-up only, not a durable source)

**Practices & standards**:
- Store raw, format at render (`AGENTS.md`), and this spec's stated, narrow exception to it
- Parity testing two independent implementations of one rule, so drift fails a test rather than
  reaching production silently
