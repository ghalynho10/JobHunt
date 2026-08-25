# 0003. Data model for the v1 loop

**Date**: 2026-08-24
**Status**: In Progress

## Summary

This spec settles the six tables every later feature reads and writes: the profile, its skills, its work history, its stated job preferences, the application record, and the typed answers captured against an application. Everything is normalised (one fact in one place, related by keys) and every rule that matters is enforced by the database rather than by application code, because the database is the only thing no feature can forget to call. Search results still do not persist, so an application carries a full copy of the listing it was made against. The scaffold table from feature 1 is removed here, but only after the health page has been repointed at the profile and that repoint is live on production, so the deployed end to end proof never goes dark and no running build ever queries a table that is already gone.

## Requirements

**User stories**:

- As a signed in user, I want my profile, skills, work history and preferences stored so that scoring has something real to read and my data survives a reload.
- As a signed in user, I want a record of the jobs I applied to, holding enough of the listing that the record still means something after the posting is taken down.
- As a signed in user, I want to be certain no other user can read or change any of my rows, enforced by the database and not by a check somebody could forget to write.
- As the operator, I want a user's data to be genuinely removable, so that the privacy notice in feature 21 can describe deletion truthfully.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: The six tables (`profile`, `profile_skill`, `work_experience`, `job_preference`, `application`, `application_answer`) exist in the `public` schema with the fields, types and nullability in `## Feature design`, applied to local, development and production through the migration workflow and never by hand.
- **AC-2**: Every one of the six has row level security enabled and forced, and carries an explicit `grant` to `authenticated` and to no other role. `anon` and `service_role` hold nothing, so a request carrying no session is refused at the privilege check with a hard permission denial, not an empty result set that reads like success.
- **AC-3**: A signed in user reading any of the six sees only rows in their own profile chain. Proved with the two seeded development users, each seeing only their own rows, on a real deployed preview.
- **AC-4**: A signed in user can insert, update and delete their own rows on five of the six tables, and insert and delete on `profile_skill`, which has no update path by design. An insert or update that would place a row under another user's profile is refused by the policy's `with check`, not merely hidden from reads.
- **AC-5**: Deleting a row from `auth.users` removes that user's profile, skills, work history, preferences, applications and answers, leaving no row behind in any of the six.
- **AC-6**: A user deleting their own `profile` row removes the same subtree while their auth account remains, so data removal is reachable from inside the product before feature 27 builds account settings.
- **AC-7**: A second `application` row with the same profile, `source` and `source_job_id` is refused by the database with a unique violation. The refusal comes from the constraint, so it holds even for a caller that forgot to check first.
- **AC-8**: An `application` insert naming a profile that does not exist is refused by the foreign key. Feature 12 turns that refusal into a visible expected failure, and this spec records that obligation rather than leaving it to be discovered at build time.
- **AC-9**: Pay is stored raw and never as a rendered string, in both tables that hold it. On `application`, a single stated figure is one value with the other absent, and a `salary_max` below its `salary_min` is refused. On `job_preference` and on `application` alike, an amount present without its currency is refused. Nothing formats pay at write time.
- **AC-10**: A skill name is unique per profile ignoring case, so the same profile cannot hold both `React` and `react`.
- **AC-11**: Work history dates are stored with the day set to 1 and are refused otherwise, an absent end date means the role is current, and an end date before its start is refused.
- **AC-12**: `updated_at` is maintained by a database trigger on every table that has one, so it is correct even when a row is changed by hand in the Supabase dashboard with no application involved.
- **AC-13**: `scaffold_check` no longer exists in any of the three databases, no code references it, its seed rows are gone and its span is removed from the span registry.
- **AC-14**: The health page reads the caller's own `profile` through the real server client under a real policy. Each of the two seeded development users with a profile sees only their own row, and a third seeded user, deliberately given no profile row, sees a visible expected failure naming the missing profile rather than an empty page.
- **AC-15**: `src/lib/supabase/database.types.ts` is regenerated from the applied schema, and the profile read parses its row with Zod at the boundary, reporting a row that does not match as a visible `response_malformed` failure.
- **AC-16**: Spec 0002's invariant 1 is honoured on **production**, not merely on a preview: the drop of `scaffold_check` is written only after the create migration has merged to `main`, its production migration run has succeeded, and the production URL is confirmed serving the new read. Vercel and GitHub Actions build the same commit in parallel, so a drop arriving before the deploy that stopped reading the table breaks running code with nothing to catch it.

## Decision

**Chosen option**: Option 1: Six normalised tables, with every rule enforced in Postgres.

Model the v1 loop as six related tables in the `public` schema, keyed off a `profile` row whose primary key is the Supabase auth user id, with uniqueness, ranges, pairing rules and per user isolation all expressed as database constraints and policies rather than as application checks.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`)

## Rationale

Reasoning, the options weighed and the references: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

`profile` (the per user root)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | Primary key. References `auth.users(id)` on delete cascade. It *is* the auth user id, so every policy is a direct comparison and one row per user is guaranteed by the key itself. |
| `full_name` | text | yes | Not blank after trimming, at most 200 characters. |
| `location` | text | no | Free text as the user writes it. Feature 14 reads it. |
| `summary` | text | no | Long text, at most 4000 characters. |
| `created_at` | timestamptz | yes | Defaults to now. |
| `updated_at` | timestamptz | yes | Maintained by trigger. |

`profile_skill`

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | Primary key, `gen_random_uuid()`. |
| `profile_id` | uuid | yes | References `profile(id)` on delete cascade. |
| `name` | text | yes | Not blank after trimming, at most 100 characters. |
| `created_at` | timestamptz | yes | Defaults to now. No `updated_at`: a renamed skill is a delete plus an insert. |

Unique index on `(profile_id, lower(name))`. Its leading column is `profile_id`, so it also serves as the foreign key index.

`work_experience`

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | Primary key, `gen_random_uuid()`. |
| `profile_id` | uuid | yes | References `profile(id)` on delete cascade. Indexed. |
| `company` | text | yes | Not blank, at most 200 characters. |
| `title` | text | yes | Not blank, at most 200 characters. |
| `location` | text | no | Where the role was based. |
| `description` | text | no | Long text, at most 4000 characters. In v1.5 this is the source of truth the numeral check tests generated resume bullets against. |
| `started_on` | date | yes | Day pinned to 1, enforced by a check. |
| `ended_on` | date | no | Day pinned to 1. Absent means the role is current. May not precede `started_on`. |
| `created_at` | timestamptz | yes | Defaults to now. |
| `updated_at` | timestamptz | yes | Maintained by trigger. |

`job_preference` (one row per profile)

| Column | Type | Required | Notes |
|---|---|---|---|
| `profile_id` | uuid | yes | Primary key and foreign key to `profile(id)` on delete cascade. One row per user by construction. |
| `desired_titles` | text[] | yes | Defaults to an empty array. |
| `desired_locations` | text[] | yes | Defaults to an empty array. |
| `remote_preference` | text | yes | One of `on_site`, `hybrid`, `remote`, `no_preference`. Defaults to `no_preference`. |
| `minimum_pay` | numeric(12,2) | no | Raw amount, never formatted. |
| `minimum_pay_currency` | text | no | Three uppercase letters. |
| `created_at` | timestamptz | yes | Defaults to now. |
| `updated_at` | timestamptz | yes | Maintained by trigger. |

Check: `minimum_pay` and `minimum_pay_currency` are both present or both absent.

`application` (the only place a job persists)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | Primary key, `gen_random_uuid()`. |
| `profile_id` | uuid | yes | References `profile(id)` on delete cascade. |
| `source` | text | yes | One of `adzuna` in v1. A check constraint, so adding a source later is an ordinary migration. |
| `source_job_id` | text | yes | The source's own identifier for the listing. |
| `job_title` | text | yes | Snapshot. |
| `company_name` | text | yes | Snapshot. |
| `job_location` | text | no | Snapshot. |
| `job_url` | text | yes | The link out to the real posting. |
| `job_description` | text | no | The listing's full description text. The only copy that survives the posting being taken down. |
| `salary_min` | numeric(12,2) | no | Raw. |
| `salary_max` | numeric(12,2) | no | Raw. |
| `salary_currency` | text | no | Three uppercase letters. |
| `posted_at` | timestamptz | no | When the source says the listing appeared. |
| `applied_at` | timestamptz | yes | Defaults to now. Distinct from `created_at` so a later feature can record an application made elsewhere without lying about when the row was written. |
| `created_at` | timestamptz | yes | Defaults to now. |
| `updated_at` | timestamptz | yes | Maintained by trigger. |

Constraints: a unique constraint on `(profile_id, source, source_job_id)`, which is what makes the second apply fail rather than duplicate. A unique **constraint** on `(id, profile_id)`, plain and over exactly those two columns, never partial and never over an expression, because a composite foreign key can only reference a real unique constraint or unique index. It exists only so `application_answer` can carry the composite foreign key below. Currency present exactly when either pay figure is present. `salary_max` not below `salary_min` when both are present.

`application_answer`

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | Primary key, `gen_random_uuid()`. |
| `application_id` | uuid | yes | Part of the composite foreign key below. |
| `profile_id` | uuid | yes | Part of the composite foreign key below. Denormalised on purpose, see the note. |
| `question_key` | text | yes | No fixed value list yet. Feature 20 owns the question set and adds the check then, against a table that is still empty. |
| `answer` | text | yes | Not blank after trimming, at most 4000 characters. |
| `created_at` | timestamptz | yes | Defaults to now. |
| `updated_at` | timestamptz | yes | Maintained by trigger. |

Foreign key `(application_id, profile_id)` references `application(id, profile_id)` on delete cascade. Unique constraint on `(application_id, question_key)`, so one answer per question and an edit touches one row. A separate index on `profile_id`, because it is the column every policy on this table compares and the unique constraint above does not lead with it.

**Why `profile_id` is repeated on `application_answer`.** Without it, every policy on this table would need a subquery into `application` on each row, and an answer could in principle name an application belonging to someone else. The composite foreign key makes the database itself refuse a mismatch, and the policy stays the same plain comparison against the caller as every other table. The cost is one redundant column and one extra unique index. The runner up, an `exists` subquery in four policies, is correct but pays a lookup per row and leaves the owner agreement as a property of the policies rather than of the schema.

**Ownership chain**

```
auth.users
  └── profile (id = auth user id)
        ├── profile_skill
        ├── work_experience
        ├── job_preference
        └── application
              └── application_answer
```

Every edge is `on delete cascade`, so one delete at either of the top two levels removes everything below it.

**State transitions**

None. `application` deliberately carries no status column in v1, so there is no state machine to define. Feature 23 introduces one when the dashboard needs it.

**API surface**

This feature ships no new route and no Server Action. Its surface is the schema itself plus one read that replaces the scaffold read.

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `readOwnProfile()` in `src/features/profile/queries.ts` | Server Component read | none, the caller comes from the session | `id`, `full_name`, `location`, `summary` | signed in, verified in the function itself per binding rule 6 | `session_missing` (expected), `record_not_found` when no profile row exists yet (expected), `database_unavailable` (unexpected), `response_malformed` (unexpected) |
| the six tables | Postgres, through the Data API | per table columns | rows the caller owns | `authenticated` role plus a per row policy | permission denied for `anon`, unique violation, foreign key violation, check violation |

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| create profile (feature 9) | `profile.id` | `auth.uid()` of the caller, never a client supplied value |
| create profile (feature 9) | `full_name`, `location`, `summary` | feature 9's form, parsed with Zod before the write. The Zod rules mirror the check constraints (not blank after trimming, the same length ceilings), so a value that would be refused by the database is refused at the boundary first with a per field message |
| seed fixture | `full_name`, `location`, `summary` for the synthetic users | literal strings in `supabase/seed.sql`, obviously fake and carrying no real personal data, and subject to exactly the same checks a real write is |
| create profile | `created_at`, `updated_at` | database defaults and the shared trigger |
| health page read | the profile shown | `profile` row where `id` equals the caller, selected by policy |
| health page read | "no profile yet" state | `record_not_found`, returned when the select matches no row |
| record application (feature 12) | `profile_id` | `auth.uid()` of the caller |
| record application | `source` | the constant `adzuna`, set by feature 11's search client, never by the browser |
| record application | `source_job_id`, `job_title`, `company_name`, `job_location`, `job_url`, `job_description`, `posted_at`, `salary_min`, `salary_max`, `salary_currency` | the listing object feature 11 already parsed from the source response, carried through the apply action. Feature 11 owns the field mapping and must expose all of these. |
| record application | `applied_at` | database default, the moment of the write |
| record application | duplicate refusal | the unique constraint on `(profile_id, source, source_job_id)` |
| capture answers (feature 20) | `question_key` | the preset question set feature 20 defines, checked in Zod until it adds the check constraint |
| capture answers | `profile_id` | the parent application's `profile_id`, and the composite foreign key refuses any other value |
| scoring (feature 14) | matched and missing skills | `profile_skill.name` rows for the caller, compared against the listing text |
| privacy notice (feature 21) | the list of stored personal fields | this spec's data model sketch, which is the authoritative list |

**Key invariants**

1. One profile row per auth user, guaranteed by the primary key rather than by a constraint that could be dropped.
2. No row in any of the six is reachable by a user other than its owner. Enforced by policy, with `force row level security` so it applies to the table owner too.
3. `anon` holds no privilege on any of the six, so a request with no session is refused before policies are even consulted.
4. One application per user per source listing.
5. A pay amount never exists without its currency, in either table, so nothing can render a bare number as money.
6. A pay range never has its top below its bottom, and a single figure stays a single figure.
7. A work history period never ends before it starts, and every stored date is the first of a month.
8. An answer always belongs to the same user as its application, guaranteed by the composite foreign key.
9. Every value is stored raw. No column holds a formatted or derived string.
10. `updated_at` is never written by application code.

**Security model**

- Reads and writes are confined to the caller's own rows, with the predicate `(select auth.uid()) = profile_id`, or `= id` on `profile` itself. The `select` wrapper makes Postgres evaluate the call once rather than once per row.
- **The clause differs by action, and Postgres refuses the wrong one.** `select` and `delete` policies carry `using` only; an `insert` policy carries `with check` only; an `update` policy carries both, and it needs both, since `using` decides which rows may be changed and `with check` decides what they may be changed into. Omitting `with check` on `update` would let a user move their own row under another user's profile.
- Twenty three policies in total, not twenty four: `profile_skill` gets `select`, `insert` and `delete` only. It has no update path by design (a renamed skill is a delete plus an insert), and a policy for an action nothing performs is dead code that still has to be read and trusted.
- **Every table carries its own explicit grant**, per spec 0002's invariant 6 and its follow-up naming this feature: `grant select, insert, update, delete on <table> to authenticated`, and `grant select, insert, delete` on `profile_skill`. Nothing is granted to `anon`. Nothing is granted to `service_role` either, which is deliberate and load bearing: spec 0002's task 10 proved on the hosted project that the Data API exposure setting withholds privileges from `service_role` too, contradicting the installed `supabase` skill, so a role that is not named here genuinely holds nothing. A missing grant produces a hard permission denial rather than an empty result, which is the failure shape this project wants.
- No table here is reachable by the secret key client, and nothing in this feature belongs in `src/lib/supabase/secret.ts`. Binding rule 1 is untouched.
- Personal data lives in five of the six tables: a real name, a location and a written summary in `profile`; a list of skills in `profile_skill`; an employment history in `work_experience`; stated pay expectations and desired locations in `job_preference`; the jobs applied to in `application`; and the user's own typed answers in `application_answer`. Only the fixed value lists are impersonal. All of it is the field list feature 21's privacy notice must describe, and feature 8's fixtures must never populate any of it with anything real.
- Deletion is a real capability, not a policy exception: a user may delete their own profile, and the cascade does the rest.

**Configuration required**

None. No new environment variable, secret or third party credential.

**Critical test scenarios**

- Happy path: a seeded development user signs in on a real preview and the health page shows their own profile row, verifies **AC-14**, **AC-3**.
- Isolation: the second seeded user signs in and sees a different row, and never the first user's, verifies **AC-3**.
- Auth and permission: a request with no session is refused with a permission denial rather than an empty result, and `has_table_privilege` confirms `anon` and `service_role` hold nothing on any of the six, verifies **AC-2**.
- Write refusal: an insert placing a row under another user's profile is refused by the insert policy's `with check`, and an update moving an owned row under another profile is refused by the update policy's `with check`, verifies **AC-4**.
- Missing profile: a signed in user with no profile row sees a visible expected failure, not a blank page, verifies **AC-14**.
- Duplicate application: inserting the same `(profile_id, source, source_job_id)` twice is refused by the database, verifies **AC-7**.
- Orphan application: inserting an application for a profile that does not exist is refused by the foreign key, verifies **AC-8**.
- Constraint sweep: pay without currency, a top below a bottom, a duplicate skill differing only in case, a date not on the first, and an end before a start are each refused, verifies **AC-9**, **AC-10**, **AC-11**.
- Cascade: deleting the auth user leaves no row in any of the six, verifies **AC-5**. Deleting only the profile does the same while the auth account remains, verifies **AC-6**.
- Dashboard edit: changing a row by hand in Supabase updates `updated_at`, verifies **AC-12**.

## Build plan

Ordered for Tracer Bullet, and for expand then contract. The whole schema lands first, the deployed proof is moved onto a real table while the old one still exists, and only then is the old one dropped.

**Spec 0002's invariant 1, carried here in full because this is the spec where a destructive migration actually gets written.** A migration may add in the same commit as the code that uses it. A migration may drop only after a previous deploy has already stopped reading the thing being dropped. Never add and drop in one commit. The mechanism is the reason: Vercel and GitHub Actions build the same commit in parallel, and nothing sequences them. An additive migration arriving late causes a brief visible error that heals itself once the migration lands. A drop arriving early breaks running code, and nothing catches it. That asymmetry is why this plan is two pull requests rather than one, and why the gate between them is production, not a preview.

1. Write the migration creating the shared `public.set_updated_at()` trigger function (`security invoker`, empty `search_path`, fully qualified names, matching the `app_settings` precedent), then the six tables with their checks, unique constraints, foreign key indexes, the explicit `grant` per table to `authenticated` and to nothing else, `enable` plus `force row level security`, and the twenty three policies (four per table, three on `profile_skill`), each carrying the clause its action actually permits. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-9**, **AC-10**, **AC-11**, **AC-12**.
2. Update `supabase/seed.sql`: give each of the two existing synthetic users a profile row, and add a **third** synthetic user with an auth row and an identity but deliberately no profile row, which is the fixture AC-14's missing profile path is proved against. Keep every statement idempotent, and keep the existing `scaffold_check` rows for now so the current health page keeps working. Satisfies **AC-3**, **AC-14**.
3. Run `pnpm db:reset` locally, then `pnpm db:types` to regenerate `src/lib/supabase/database.types.ts` from the applied schema. Satisfies **AC-15**.
4. Add `src/features/profile/queries.ts` with `readOwnProfile()`: the named span `profile.read` as the first statement per binding rule 4, the session check per binding rule 6, the Supabase call, and a Zod parse at the boundary, returning `record_not_found` as an expected failure when no profile row exists. Register `profile.read` in [docs/observability/spans.md](../../observability/spans.md). Satisfies **AC-14**, **AC-15**.
5. Repoint `src/app/(app)/health/page.tsx` at `readOwnProfile()`, keeping the existing failure rendering shape so a failure is still shown rather than swallowed. Satisfies **AC-14**.
6. Prove the constraints by hand against the real development project as each seeded user: isolation both ways, the `with check` refusal on both insert and update, the duplicate application, the orphan application, the pay pairing in both tables, the skill uniqueness ignoring case, the date checks, and both cascade paths. Also confirm directly that `anon` and `service_role` hold nothing on all six, with `has_table_privilege`, the same test spec 0002's task 10 used. This is direct SQL because no write path exists in the product yet, which is deliberate. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-11**.
7. Confirm the repointed health page on a real preview deployment as all three seeded users: the first two each see only their own profile, the third sees the visible missing profile failure. Satisfies **AC-3**, **AC-14**.
8. **Merge steps 1 to 7 to `main` as their own pull request, and stop there.** Confirm the production migration run succeeded and that the production deployment is serving `readOwnProfile()`. A green preview is not this gate: previews read the development project, so a preview proves nothing about production's schema. Satisfies **AC-16**.
9. **Only then, in a second pull request**, write the migration dropping `scaffold_check`, delete `src/features/scaffold-check/`, remove the scaffold rows from the seed and remove the `scaffold_check.read` line from the span registry. Satisfies **AC-13**, **AC-16**.

## Consequences

**Positive**

- Every rule that later features depend on is enforced in one place that no feature can bypass. A caller that forgets to check for a duplicate application still cannot create one.
- Deletion is real and complete, so feature 21's privacy notice can describe it truthfully rather than carefully.
- The deployed end to end proof survives the removal of the scaffold table instead of going dark until feature 9.
- Feature 9's form, feature 12's apply action and feature 14's scoring all read a shape that is already decided, so none of them has to invent one mid build.

**Negative and tradeoffs**

- An application cannot be written before a profile row exists. Nothing in the product enforces that ordering today, only the foreign key does, so feature 12 has to handle the missing profile as a visible expected failure rather than letting a raw database error escape.
- With no status column, feature 23 will alter a table that already holds real application rows. The change is a nullable column plus a check, which is cheap, but it is a migration against live user data rather than an empty table.
- Fixed value lists are check constraints, so the generated TypeScript types carry plain `string` rather than a union. The allowed values are therefore named twice, once in SQL and once in Zod, and the two can drift.
- `job_description` stores a full listing body per application. Harmless at this scale, and it is the row that will dominate table size.
- `application_answer` carries a redundant `profile_id`. It buys policy simplicity and a database guarantee, and it is still denormalisation.
- Twenty three policies to write and keep right, against one in the repository today, each needing the clause its action actually permits.

**Neutral**

- Two migrations across two pull requests rather than one, because the drop is separated from the create by a confirmed production deploy. The feature therefore closes in two merges, not one.
- The seed grows a profile row per synthetic user, and loses its scaffold rows in the same feature.
- `src/features/scaffold-check/` and its span disappear, which is the first removal of scaffold code in this project.

## Follow-up

- [ ] Feature 12's done when clause needs a criterion for the missing profile case: an apply attempt by a user with no profile row must fail visibly as an expected failure, never as an unhandled database error. Recorded here because the constraint originates in this spec's ownership chain.
- [ ] Feature 20 adds the check constraint on `application_answer.question_key` once its question set is decided, while the table is still empty.
- [ ] Feature 23 adds the application status column and its check, as an alter against a table holding real rows.
- [ ] Features 24 and 25 will want profile links, and feature 18 will want an employment type on work history. Both were deliberately left out of v1 as columns nothing reads yet.
- [ ] Feature 8 replaces the seeded fixture users, and should mint identifiers that satisfy `z.uuid()`, which the current pair does not, as `supabase/seed.sql` already records.
- [ ] The check constraint value lists and their Zod counterparts are the one place this design allows drift. Feature 8 is the natural owner of a test that asserts the two agree.
- [x] Spec 0002's two open obligations on this feature are discharged here: invariant 1 (expand then contract) is carried in full in `## Build plan` with its mechanism rather than its conclusion, and the explicit `grant` rule is written into AC-2, the Security model and build task 1. Both were found missing from the first draft by the cross check, which is exactly the failure 0002 predicted when it wrote that a rule living only in the deployment spec is one the data model spec will not read.
- [ ] Feature 8 inherits a third synthetic fixture user carrying no profile row. It exists for AC-14's missing profile path and should survive the fixture pool rewrite.
