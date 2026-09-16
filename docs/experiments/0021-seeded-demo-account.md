# Experiments: seeded demo account · spec 0021

Run 2026-09-15 during `/check verify seeded demo account`, immediately after
spec 0021's Build plan step 10 shipped: the one broad `"software engineer"`
search replaced by two opposed searches, `"backend engineer"` and
`"frontend engineer"`, four listings kept from each by an alternating walk.

**What this cost.** 8 Adzuna searches, 35 `ai_scoring` calls and 4 `ai_check`
calls, spread across one good refresh and five deliberate abort runs (a refused
first search, a refused second search, a forced Adzuna failure, a scoring
refusal and a grounding check failure), all against the local stack's own caps. The numbers below are worth reading with
that in mind: this is a paid measurement, not a re runnable check, and
`verify.md` beside the spec is what gets re run.

Environments referred to below:

- **local**: Supabase in Docker, `127.0.0.1:54321`, schema from
  `supabase/migrations/20260913120000_demo_result.sql` as edited on 2026-09-15,
  applied by `pnpm db:reset` and read back from inside the container. The
  application was `pnpm dev` on port 3000 with the real Adzuna, OpenAI
  (`ai_scoring`) and Google (`ai_check`) keys from `.env.local`.
- **Sentry, local sink**: not the hosted `jobhunt` project. The dev server was
  started with `SENTRY_DSN` pointing at a small local HTTP listener that wrote
  every envelope to disk, so the events quoted below are the SDK's own payloads
  as sent, and nothing reached the real project. There is no Sentry API token in
  this repository, so this was the only way to read an event's contexts and span
  attributes.

---

## 1. What do two opposed searches actually produce, and does the stopping rule fire?

**Why it matters.** The two search revision exists because the first real
refresh, on `"software engineer"`, wrote 16 rows of which 15 carried zero
matched skills. Cards with no matched skills cannot show the skill matching the
page exists to demonstrate. Spec 0021's own Follow up put a stopping rule on the
new queries: if the next refresh still shows mostly empty own role rows, the
cause is Adzuna's 500 character snippet rather than the query, and the two
queries are never changed again. That rule had never been read against a real
run, and the count it reads is not the obvious one: each candidate is also
scored against the other candidate's role postings, where zero matched skills is
usually the correct answer, so up to half the rows are empty by design.

**What was run.** One `POST /api/demo/refresh` with the real shared secret,
against the local stack with real vendor keys, then an independent recomputation
of the same four numbers straight from `demo_result`.

```
curl -s -X POST -H "Authorization: Bearer $DEMO_REFRESH_SECRET" \
  http://localhost:3000/api/demo/refresh

select 'own_rows='   || count(*) filter (where own)
    || ' own_empty='   || count(*) filter (where own and m = 0)
    || ' cross_rows='  || count(*) filter (where not own)
    || ' cross_empty=' || count(*) filter (where not own and m = 0)
from (
  select (persona_slug = 'backend-engineer'  and search_title = 'backend engineer')
      or (persona_slug = 'frontend-engineer' and search_title = 'frontend engineer') as own,
         cardinality(matched_skills) as m
  from public.demo_result
) t;
```

**Result: the refresh landed, and the stopping rule fired.**

```
route 200 body:
{"refreshed":true,"listings":8,"rows":16,
 "ownRoleRows":8,"ownRoleEmpty":6,"crossRoleRows":8,"crossRoleEmpty":8}

SQL recomputation from demo_result:
own_rows=8 own_empty=6 cross_rows=8 cross_empty=8
```

All four numbers the route reported match the four computed independently from
the stored rows. Six of the eight own role rows carry an empty
`matched_skills`, and the rule fires at five, so by spec 0021's own Follow up
**Adzuna's 500 character snippet is the cause of the empty matched skill lists,
and the two queries are not changed again.**

**The counts were proved able to move before being trusted.** A number that
cannot move reads exactly like a number that did not need to. One own role row's
`matched_skills` was emptied on purpose and the same query re run, which took
`own_empty` from 6 to 7; the row was then restored from the run's own dump and
the table's fingerprint (`md5` over every row) matched what it had been before.
Only after that was the 6 treated as a measurement.

```
before: own_empty=6 cross_empty=8
UPDATE 1
after:  own_empty=7 cross_empty=8
```

**What the screenshots show.** Both were captured from the live page before
anything touched the data, so they are the same rows the numbers above describe.

`docs/images/demo-backend-engineer.png`, `/demo?persona=backend-engineer`, the
backend candidate's ranking. Its first card is Mintlify's Senior Backend
Engineer at `Strong match`, and the compact line under the band reads "Frontend
engineer: Not a match", which is the cross candidate comparison AC-16 exists to
show.

![The /demo page ranked for the backend engineer candidate: real Adzuna postings, each card showing its band, the other candidate's band, skill chips and written reasoning](../images/demo-backend-engineer.png)

`docs/images/demo-frontend-engineer.png`, `/demo?persona=frontend-engineer`, the
same eight listings ranked for the frontend candidate. It carries the only cards
with matched skills in the whole run (TypeScript and React on the Caesars
Entertainment posting), the ungrounded skills sentence ("Removed from matched
skills, a second check could not find these in the excerpt shown: Web Vitals"),
and the reasoning caveat beneath it.

![The same /demo listings ranked for the frontend engineer candidate, including the two cards carrying matched skill chips and the removed skills sentence](../images/demo-frontend-engineer.png)

**This is the first hard measurement behind a deferred item.** `docs/scope/scope.md`'s
Deferred list carries **Fetch the full job posting for scoring**, fetching
`job_url`'s full text instead of scoring Adzuna's 500 character excerpt, and
beside it the v2 consideration of **JobsPipe** (`https://jobspipe.dev`), whose
`Job.description` field carries the full posting text in the search response
itself. Until this run both were argued from the shape of the data rather than
from a measurement. The number to quote from here on is **6 of 8 own role rows
with no matched skills at all**, on postings whose titles match the candidate's
own first desired title. That is the information gap those two items are about,
measured on real postings and a real scorer rather than reasoned about.

**Ruled out, and how.**

- **Not the query being too broad any more.** That was the failure of the
  previous run, `"software engineer"`, three of whose eight listings were
  embedded, FPGA or robotics roles neither candidate fits. Every listing in this
  run is a backend or frontend engineering role, and the empty lists persist.
- **Not the scorer refusing to name skills.** It names them when the text
  supports it: three matched skills survived across the sixteen rows, and the
  grounding check removed one more (`Web Vitals`) as not present in the excerpt,
  which is the check working rather than failing.
- **Not a counting mistake about which rows to read.** Counting empties across
  all 16 rows would give 14, which would have fired the rule on almost any run
  and for the wrong reason, since cross role emptiness is expected. The own role
  pair is the half that answers the question, and it was recomputed
  independently of the route.

## 2. Does a refused second search abort cleanly, and does the report say which search?

**Why it matters.** Two searches per refresh mean the budget can allow the first
and refuse the second, a state the one search version could not reach. A refusal
must abort the whole refresh with nothing written, must not spend a model call,
and must say which of the two searches was declined, otherwise an operator
reading the report cannot tell a first search refusal from a second one.

**What was run.** The `job_search` global day cap was read for an explicit UTC
date, then set to that day's `consumed_count` plus one, so the backend search
would be allowed and the frontend search refused.

```
update public.usage_cap set cap_value = 1
 where call_type = 'job_search' and scope = 'global' and period = 'day';

curl -s -X POST -H "Authorization: Bearer $DEMO_REFRESH_SECRET" \
  http://localhost:3000/api/demo/refresh
```

**Result: 503, one search spent, nothing written, and the report names the
frontend search.**

```
status 503
{"refreshed":false,"reason":"The usage gate refused this refresh:
  global_day_cap_reached. Nothing was written and the previous results are unchanged."}

usage_gate_counter, job_search, global day 2026-09-16:
  consumed_count  0 -> 1     (only the backend search ran)
  attempt_count   1 -> 3     (both were attempted; a refusal still counts an attempt)
  ai_scoring / ai_check consumed: unchanged

demo_result rows: 0 (unchanged)   demo_refresh.refreshed_at: null (unchanged)

Sentry event, level info:
  The demo refresh was refused by the usage gate at job_search for
  "frontend engineer": global_day_cap_reached. Nothing was written.

Sentry span demo.refresh, status ok:
  {"outcome":"refused","refusedReason":"global_day_cap_reached",
   "refusedStep":"job_search","refusedSearch":"frontend engineer"}
```

The distinction between the two counters is the part worth keeping: **a refusal
increments `attempt_count` but not `consumed_count`**, so "nothing was spent" is
read off `consumed_count` and only off `consumed_count`. A check written against
`attempt_count` would report a correctly refused call as a spent one.

The span stayed `ok` rather than failed, which is what spec 0011 AC-5 and spec
0001's binding rule 3 ask for: the budget declining a call is the system working
as designed and must never enter a failure ratio.

## 3. Which UTC day do the counters belong to?

**Why it matters.** The gate keys its day counters on the UTC date
(`(now() at time zone 'utc')::date` in
`supabase/migrations/20260902120000_usage_gating.sql`). Local time in this
project's timezone runs behind UTC, so for the last hours of a local day the
counters already belong to tomorrow. A cap set against "today" read from the
local clock would then be set against a row nothing is writing to, and the probe
would prove nothing while looking correct.

**What was run.** Every counter read in this session asked the database for the
UTC date first and then filtered on that literal, rather than assuming a day.

```
select (now() at time zone 'utc')::date as utc_today;

select call_type, scope, period, period_start, attempt_count, consumed_count
  from public.usage_gate_counter
 where scope = 'global' and period = 'day'
   and period_start = date '<utc_today from the query above>';
```

**Result: the trap was live during this run.**

```
utc_today=2026-09-16      local wall clock at the same moment: 2026-09-15 21:40
```

Every cap in sections 1 and 2 was therefore set against `2026-09-16`, which is
the row the gate was actually incrementing. The reads were run through `psql`
inside the container rather than through the Data API, which cannot see
`usage_gate_counter` at all: that table deliberately carries no row level
security policy, so a read through PostgREST returns zero rows whatever the
truth is, and both a spent call and an unspent one look identical.

**Conclusion.** The two search revision works as specified, and the measurement
it produced closes a question rather than opening one: the snippet, not the
query, is what leaves the matched skill lists empty. The queries are now fixed
by the spec's own rule, and the next move on this, if it is ever made, is the
deferred full posting text item or JobsPipe, both of which now have a real
number behind them instead of an argument.
