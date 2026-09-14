# 0021. Seeded demo account, rationale

## Context

> ⚠️ Premise note: the scope row for feature 31 describes something larger than what a demo
> actually needs: a fake profile, applications across every status, discard history, and a
> populated dashboard, and it names feature 23 (the applications dashboard, itself undecided) as
> a prerequisite. But the row's own accepted done when clause never asked for any of that: it
> only asks that a visitor reach it without signing up, that every seeded value be obviously
> fake, that a visitor cannot corrupt it for the next visitor, and that it make no external paid
> call. The entry page's own shipped copy (`src/features/entry-page/about-section.tsx`) already
> promises exactly the smaller thing, word for word: "a no sign in demo account", nothing about
> a dashboard. And spec 0001 binding rule 1 already reserves the secret key client's third caller
> for this feature, built to never hold a signed in session, which is the architecture for a
> small no sign in read rather than a full account. The row's descriptive paragraph overshot its
> own accepted bar. This spec builds to that bar, not to the paragraph, and the richer idea is
> recorded as a deferred possibility rather than dropped silently.

A freshly created real account shows a recruiter nothing: no profile filled in, no search run,
no score computed. Fixing that by letting a visitor run a real search would spend one Adzuna
call and up to twenty scoring calls per visit, real money for every person who follows a shared
link, which is not acceptable for a page whose whole purpose is to be shared freely. The results
have to be prepared in advance instead.

A prepared page still has to survive being genuinely public. Nothing on it can be a real
employer, since a link handed out for demonstration is not a channel to promise anything to
Adzuna or to a stated candidate. Nothing on it can be written to by a visitor, since the page has
no session to scope a write to, and a corrupted shared page would be broken for every visitor
after the first. And whatever it shows has to make the product's actual argument, that a job's
score is not a property of the job alone but of the job against a specific person, rather than
just asserting that in prose next to a single example.

## Options considered

### Option 1: A dedicated seeded table, read through the secret key client

The prepared results live in a new table with no relationship to the rest of the schema, seeded
directly in its migration, with row level security enabled and forced and zero policies. The
`/demo` route reads it through `createSecretClient()`, the same client already reserved as this
feature's caller in spec 0001 binding rule 1, because there is no session for row level security
to scope a normal read to.

**Pros**:
- Uses the caller slot spec 0001 already reserved for this exact feature, rather than leaving it
  permanently unused.
- The word "seeded" is literal: the data really is rows in the database, not a claim about a
  fixture file.
- A new table has no relationship to the real schema, so nothing here can be confused with a
  real listing or a real application by any query that is not this feature's own.

**Cons**:
- A new table and a new migration for content that never changes is more machinery than a plain
  fixture would need.
- Adds one more permanent caller to a highly privileged client, a fact spec 0001 has to keep
  recording indefinitely.

### Option 2: A static fixture module in code

The prepared results are a plain constant module, a list of objects with the same shape the real
`Listing` and score types use. No migration, no table, no secret key involvement at all.

**Pros**:
- The simplest possible build: no migration, no row level security to write, no new client
  caller.
- Trivially safe against corruption, since nothing about it is stored anywhere a write could
  reach.

**Cons**:
- Leaves spec 0001's reserved secret key caller for this feature unused, which either has to be
  removed from that allow list or left recorded for a mechanism the feature does not actually
  use.
- Stretches the feature's own name: nothing is "seeded" if it never touches the database.

### Option 3: A real seeded Supabase Auth user with profile and application rows

A genuine `auth.users` row for a fixed demo identity, with real `profile`, `job_preference`, and
`application` rows attached, read either through an impersonated session or through the secret
key filtered to that one user id. This is closest to what "seeded demo account" literally says
and to the row's original, fuller description.

**Pros**:
- Reuses the real schema and the real rendering paths (`ResultCard`, `ScoreCard`, the
  applications feature) rather than building parallel ones.
- Would be the natural foundation for the fuller version this same spec defers, if that is ever
  built.

**Cons**:
- Drags in the whole profile and application schema, and by extension feature 23's dashboard, for
  a feature whose accepted done when clause never asked for any of it.
- Still needs the secret key regardless, since there is no real session to authenticate as a
  fixed user with no password anyone holds, so it buys none of option 1's simplicity while
  costing all of its complexity.
- The real `application` schema has no place to store a persisted score outside of an actual
  applied job (scoring is computed live per search render, per spec 0015), so faking "already
  scored" results this way means writing fabricated data into a table whose every other row means
  something real, which is its own honesty problem.

## Rationale

Option 1 is the right size for what this feature's own done when clause actually requires, and
it is the mechanism spec 0001 already committed to when it reserved this feature's caller slot,
so choosing it costs nothing new architecturally. Option 2 would work and would be simpler to
build, but it leaves that reservation meaningless and stretches what "seeded" means for no real
benefit, since the extra machinery option 1 needs (one small table, one migration) is not much
machinery. Option 3 is what the row's original prose actually described, and it is rejected here
specifically because it pulls in schema and dependencies (feature 23's dashboard, the real
`application` table's meaning) that the done when clause never required and that this spec is
deliberately not building yet; `## Consequences` in `index.md` records that fuller version as a
deferred possibility rather than as something this decision closes off.
