# 0003. Data model for the v1 loop, rationale

The decision record behind [index.md](index.md). A build never needs to load this.

## Context

> ⚠️ Premise note: two choices in this spec cost something later, and both were made deliberately. First, `application` carries no status column, so feature 23's dashboard will alter a table that already holds real user rows rather than an empty one. The change is a nullable column plus a check, which is about as cheap as a live alter gets, so the cost is real but small. Second, the scope's done when clause for this feature says the policies are "applied and live", yet this feature ships no write path, so most of the isolation and constraint proofs are direct SQL run as the seeded users rather than exercised through the product. That is the honest consequence of settling the model before the features that use it, which is exactly what this feature exists to do, and it is why the build plan says so out loud instead of quietly checking a box.

Every feature after this one reads or writes these tables. Feature 9 fills the profile, feature 11 searches, feature 12 records an application, feature 14 scores against the profile, feature 20 captures answers, feature 21 describes the stored fields to users in a privacy notice, and features 22 to 26 grow all of it. The scope says plainly why it is decided once and early: a wrong data model is the most expensive thing to redo.

Three forces shape it.

**Isolation has to be a property of the database.** Spec 0001 already settled this as a binding rule, and both existing migrations demonstrate the pattern: an explicit grant plus a policy, `force row level security` so the table owner is not exempt, and no privilege for `anon` so a request with no session is refused rather than answered with an empty list. The reference project's worst class of bug was an application layer check that was simply not written on one path. Nothing in this model may depend on a caller remembering anything.

**Search results do not persist, by an earlier decision.** That removes a staleness state machine entirely, and it moves a burden: the moment a user applies is the last moment the listing is available, so the application record has to carry a copy or the record becomes a link to a page that will eventually 404.

**The project is small and stays small.** Tens of users, one developer, a free tier. There is no scale argument for any of this. The arguments are correctness, honesty about failure, and not having to rewrite the foundation in three months.

The consequence of not deciding is that features 9, 11, 12 and 14 each invent a shape at build time and the fourth one discovers the first three disagreed.

## Options considered

### Option 1: Six normalised tables, every rule enforced in Postgres

A profile row keyed by the auth user id, with skills, work history, preferences and applications hanging off it, answers hanging off applications, and uniqueness, ranges, pairing rules and ownership all expressed as constraints and policies.

**Pros**

- A rule enforced by the database holds for every caller, including one written six months from now by someone who never read this spec.
- Deletion is a single cascade, which is what makes a truthful privacy notice possible.
- Generated TypeScript types stay accurate because they are generated from the applied schema, not hand written.
- Constraints are documentation that cannot go stale: a reader of the migration learns the rules.

**Cons**

- Twenty three policies across six tables, each needing the clause its action actually permits, all of which have to be written correctly and are easy to get subtly wrong.
- Fixed value lists as check constraints mean the allowed values are stated twice, in SQL and in Zod, and the two can drift.
- Several constraints can only be proved by direct SQL in this feature, because no write path exists yet.

### Option 2: A wide profile table with JSON documents

One profile row holding skills, work history and preferences as JSON documents, plus an applications table.

**Pros**

- Far less schema, one write per profile save, and no joins on the read path.
- The shape can change without a migration, which suits a model that is still moving.
- Fewer policies to write and fewer tables to keep isolated.

**Cons**

- The database can check almost nothing: no uniqueness on a skill, no date ordering, no pay pairing rule. Every one of those rules moves back into application code, which is precisely where this project has decided not to keep them.
- Feature 26 splits work history into nested roles with sub projects. Migrating documents is meaningfully harder than migrating rows.
- A wrong shape inside a JSON column is invisible to the compiler and to the generated types, which is the failure class spec 0001 names in its own strictness table.

### Option 3: Model everything now, including v1.5

Design and create the discard, master resume, tailored snapshot and status tables in this feature too.

**Pros**

- One migration for the whole product, and no later alter against tables holding real rows.
- Features 22 to 25 would find their storage already there.

**Cons**

- Those features are undesigned. Their shapes would be guesses, and a guessed table that a feature later contradicts is worse than no table, because someone will have written code against it.
- It directly contradicts the Tracer Bullet approach the project builds by, which is to prove a narrow real thread rather than to build a layer fully in advance.

## Rationale

Option 1, because the forces in Context all point the same way. Isolation must be a database property, and only Option 1 makes ownership, uniqueness and the pay rules properties of the same layer. Option 2 buys speed by moving exactly those rules into application code, which is the trade this project has already refused twice: once in spec 0001's binding rules and once in both existing migrations. The small scale argues for less machinery, and it does not argue for fewer guarantees, because the machinery here is a few hundred lines of SQL written once.

Option 3 fails on a different axis. It is not wrong about migrations being cheaper against empty tables. It is wrong about certainty: features 22 to 26 have no specs, so their tables would encode assumptions nobody has tested. The engineer accepted the matching cost knowingly by leaving the application status column out, which means feature 23 alters a live table. That is the right side of the trade, because a nullable column added later is a small, well understood operation, while a wrong table designed early is a shape other code grows around.

Four calls inside Option 1 are worth recording.

**The profile's primary key is the auth user id.** The alternative, a generated key with a separate unique user id, is more conventional and buys nothing here. Making them the same value means one row per user is guaranteed by the primary key, every policy on every table is a direct comparison with no join, and the cascade chain has one root.

**Fixed value lists are check constraints, not Postgres enum types.** Enums would give the generated types a real union for free, which is genuinely valuable. They lose on change: adding a value is awkward, removing one is close to impossible without recreating the type, and these lists will move as features 18, 20 and 22 arrive. A check constraint is an ordinary migration that runs in a transaction and rolls back cleanly. The cost, stating the values twice, is recorded as the one place this design permits drift, with a follow up naming feature 8 as the natural owner of a test that catches it.

**`job_preference` is a separate table rather than columns on `profile`.** It is a strict one to one extension: same key, same lifecycle, same cascade root. Folding it into `profile` would satisfy every acceptance criterion here, cut four policies, and remove a join wherever both are read together, which feature 14 will do on every score. It was kept separate anyway, and the reason is ownership rather than normalisation: `profile` answers who someone is and is written by feature 9's personal details form, while `job_preference` answers what they are looking for and is grown by feature 18's filters and feature 22's per user adjustment. Keeping them apart means those features widen their own table rather than the one holding personal data, and it lets preferences be genuinely absent rather than a row of nulls. The cost, four extra policies and a join, is recorded rather than hidden.

**`application_answer` carries a redundant `profile_id` behind a composite foreign key.** The runner up, an `exists` subquery into `application` inside four policies, is correct and needs no extra column. It pays a lookup per row and, more importantly, leaves the agreement between an answer's owner and its application's owner as a property of four policies rather than of the schema. The composite foreign key makes the database refuse a mismatch outright. The installed Postgres skill's own guidance points the same way: keep policy predicates cheap and indexed, and reach for a `security definer` helper only when the check is genuinely complex. This one does not need to be.

## Cross check

A read only cross check ran on a different model on 2026-08-24, before the spec was accepted. It found six decision gaps in the first draft, all of which are now closed in `index.md`: AC-14 had no fixture left in a "no profile" state to prove itself against (a third synthetic seeded user was added); the grants were named but never enumerated; `profile_skill` could not honour AC-4 as written, since it has no update path; the personal data list named three tables while claiming the whole model as authoritative for feature 21; the profile's own text fields appeared in no Value sourcing row; and the drop migration was gated on a preview confirmation when previews read the development project, so production's schema was never actually proved before a destructive migration could merge.

Two of those six were obligations spec 0002 had explicitly assigned to this spec and its first draft had not honoured: invariant 1 restated the conclusion without the mechanism, and the explicit grant rule was missing entirely. That is worth recording rather than quietly fixing, because 0002 predicted this exact failure in the sentence that assigned it.

It also corrected three points of Postgres fact: `with check` is not valid on a `select` or `delete` policy and `using` is not valid on an `insert` policy, so the clause differs by action; a composite foreign key needs a real unique constraint over exactly those two columns; and `application_answer.profile_id` needed its own index to match the principle this rationale cites.

## References

**Project sources** (verifiable, in this repo)

- Spec [0001](../0001-stack-and-architecture/index.md): row level security as the guarantee, no object relational mapper, Zod at every boundary, binding rule 1 (the secret key has one home, untouched here), binding rule 4 (the named span opens first), binding rule 6 (every operation checks its own caller), and the note that a wrong declared type is what the compiler cannot catch.
- Spec [0002](../0002-deployment-and-environments/index.md) and its rationale: expand then contract for schema change, which is why the drop of `scaffold_check` is a second migration applied after the repointed code is deployed; and the migration workflow as the only path schema takes to either hosted project.
- `supabase/migrations/20260820041006_scaffold_check.sql`: the two gates pattern, the foreign key index reasoning, and its own statement that feature 4 removes the table.
- `supabase/migrations/20260821120000_app_settings.sql`: the `security invoker` plus empty `search_path` trigger function this spec reuses, and the ordering discipline in a migration.
- `supabase/seed.sql`: the two synthetic users, the idempotency requirement, and the recorded fact that their identifiers do not satisfy `z.uuid()`.
- `src/lib/result.ts`: the `FailureKind` union this feature's read returns from, and `attempt()` for the boundary call.
- `src/features/scaffold-check/queries.ts`: the read shape `readOwnProfile()` replaces, including its session check and its treatment of a policy filtered empty result as an expected `record_not_found` rather than a silent blank.
- `docs/scope/scope.md`: feature 4's done when clause, and the later rows this model must serve (9, 11, 12, 14, 18, 20, 21, 22, 23, 24, 25, 26).
- `docs/jobhunt-carry-forward.md`, feature 4 section: the current publishable and secret key format, and the line this spec adopts verbatim, that migrating keys does not secure a project whose tables have no policies. A publishable key in front of an unprotected table exposes exactly as much as a legacy anonymous key did. Key rotation is not a substitute for row level security.
- Root `AGENTS.md`: store raw and format at render, no silent failures, folder by feature with anything two features share moving to `src/lib`, and errors as values through `failure()`.
- Installed skill `supabase-postgres-best-practices` (`.agents/skills/supabase-postgres-best-practices/`): row level security enabled and forced for per user data, `auth.uid()` wrapped in a `select` so it is evaluated once rather than per row, an index on every column a policy compares, and `security definer` helpers reserved for genuinely complex checks.

**Practices and standards**

- The database is the enforcement point; application code is convenience, never the guarantee.
- Expand then contract, so a schema change is safe against both the old and the new code at once.
- Store raw, format at render. A formatted string frozen into a column cannot be fixed by fixing the formatter.
- Normalise until a measured problem says otherwise; denormalise deliberately and say why in the schema, which is what `application_answer.profile_id` does.
- Make the safe path the only path: prefer a property the database enforces over a rule a person must remember.
- Fixtures never carry real personal data.
