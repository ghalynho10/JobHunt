# 0009 · Terms and privacy notices

**Date**: 2026-09-01
**Status**: Accepted

## Summary

Two public pages, `/terms` and `/privacy`, written against what this codebase actually stores and
actually sends to other companies, rather than from a template. They exist to be true, and they
exist to unblock Google: the OAuth app is stuck in Testing because the console's privacy policy and
terms fields are empty, and Testing is capped at 100 users counted over the app's whole lifetime.
The privacy notice names the real columns, the real recipients, and one email address for deletion
requests, which the operator fulfils by hand. A typed registry plus a test keeps the recipient list
from quietly going stale when features 11, 13 and 14 add their own.

## Requirements

**User stories**

- As a person signing in, I want to read plainly what is stored about me and who else sees it, so
  that I can decide whether to hand over my career history.
- As a person who has signed in, I want a way to have everything about me removed, so that leaving
  is as real as joining.
- As the operator, I want the notices to stay true as the product grows, so that they do not become
  a document that describes a product that no longer exists.
- As the operator, I want Google's consent screen to name JobHunt and the 100 user cap lifted, so
  that every new sign in stops spending a slot that never comes back.

**Acceptance criteria**

- **AC-1**: `/terms` and `/privacy` exist as routes in the `(marketing)` group. Each composes
  `EntryHeader` with `navigation="none"` and `EntryFooter`, and each ships zero client JavaScript.
- **AC-2**: The privacy notice names every category of personal data stored, and its list matches
  the applied schema. From the identity provider: the email address, display name and avatar URL in
  `auth.users`. From this app's own tables: full name, location and written summary (`profile`);
  skill names (`profile_skill`); company, job title, location, description and start and end month
  (`work_experience`); desired titles, desired locations, remote preference, minimum pay and its
  currency (`job_preference`); the source and its job id, job title, company, location, link,
  description, salary range and currency, posted and applied timestamps (`application`); and the
  question key with the person's own typed answer (`application_answer`). It also names the
  `created_at` and `updated_at` timestamps every one of these tables carries, since when a record
  was made and last changed is itself personal data.
- **AC-3**: The privacy notice names every third party receiving data today and what each receives:
  Supabase (everything, as the database and the identity store), Vercel (IP address and IP derived
  location data, per Vercel's own Privacy Notice), Sentry (error and performance events), Google and
  GitHub (only the sign in handshake, and only for whichever the person chooses).
- **AC-4**: The notice states that Sentry receives no personal data, and that claim holds against
  the running configuration (`userInfo: false`, `httpBodies: []`, `cookies: false`). A change that
  made it false fails a test.
- **AC-5**: Adding a key to `src/env.ts` that no registry entry accounts for fails the unit suite.
- **AC-6**: Both pages render their recipient list from one typed registry module, so the prose on
  the page cannot disagree with the list the test checks.
- **AC-7**: The privacy notice states the retention policy in words: data is kept until the person
  asks for it to be removed, there is no fixed period, and dormant accounts are not deleted
  automatically.
- **AC-8**: The privacy notice publishes `contact@usejobhunt.dev` for deletion and data requests,
  phrased as requesting deletion by contacting, never as a control the person can operate.
- **AC-9**: The published address receives mail. Configured and verified by the engineer on
  2026-09-01, before this spec was written, and re confirmed at verify time because an address that
  silently stops delivering is the failure this criterion exists for.
- **AC-10**: The privacy notice describes deletion truthfully: the operator removes the account
  record, which cascades to every table holding that person's data. Nothing is left behind.
- **AC-11**: The privacy notice identifies JobHunt as the service, Ghaly Nicolas Jules, resident in
  the United States, as the person responsible, and the contact address above.
- **AC-12**: The privacy notice carries the GDPR and UK GDPR shape, and names the lawful basis for
  each purpose rather than the word alone: contract necessity for the identity, profile and
  application data, because the service cannot be provided to somebody without processing their
  career history; and legitimate interest for error monitoring, because keeping the service working
  is not something the person is asked to opt into. It lists the rights (access, correction,
  deletion, portability, objection, restriction) and how to exercise each.
- **AC-13**: The privacy notice discloses how data received from Google is accessed, used, stored
  and shared, and states plainly that data is not sold, not used for advertising, not shared with
  data brokers, and not used to train models. It carries no Limited Use affirmation.
- **AC-14**: The privacy notice discloses the session cookie as strictly necessary to sign in, and
  states there is no analytics and no tracking today. A test fails if an analytics dependency or a
  third party script tag is introduced, so the claim cannot become false in silence.
- **AC-15**: The terms page states what the service is, that it is free with no guarantee of
  availability, and that it may change or stop. Four clauses are settled here rather than left to
  the build:
  - **Acceptable use**: no automated scraping of the service, no using it to apply on another
    person's behalf, and no attempt to reach another user's data. Breaking these is what "removed
    for abuse" means.
  - **Content ownership and licence**: the person keeps ownership of their profile and resume
    content. The licence granted is non exclusive, limited to operating the service for them,
    revoked when their data is deleted, and explicitly not sublicensable and not for training
    models.
  - **Warranty and liability**: the service is provided as is with no warranty, and liability is
    limited to the fullest extent the law allows. No cap figure is stated, because the service is
    free and there is no payment to anchor one against.
  - **How the terms change**: the published version is updated in place and the effective date
    bumped. There is no advance notice, which matches AC-16 and is the only mechanism this project
    can actually perform, having no email capability.

  It also states the governing law and venue: the laws of the State of Georgia, United States of
  America, with venue in the state and federal courts located in Georgia. The clause writes
  "State of Georgia, United States of America" in full rather than "Georgia", because Georgia is
  also a country and the readers this notice is written for are explicitly worldwide.
- **AC-16**: Both pages carry an effective date, and state that continued use means accepting the
  version currently published.
- **AC-17**: Both pages set their own `robots` metadata so they are indexable, and both existing
  robots assertions in `src/app/layout.test.ts` still pass unchanged.
- **AC-18**: The entry page footer's reserved centre slot links both pages.
- **AC-19**: `/sign-in` renders a static line under the two provider forms saying that continuing
  means agreeing to the Terms and the Privacy Notice, with both linked, and the page still ships
  zero client JavaScript.
- **AC-20**: Both pages carry their own title and description metadata, have exactly one `h1` with
  headings in order, and every link is keyboard reachable with a visible focus ring (WCAG 2.2 AA).
- **AC-21**: In the Google Cloud console, `usejobhunt.dev` is added as an authorized domain, the
  privacy policy and terms fields hold the two live URLs, and the app is moved out of Testing.
- **AC-22**: Brand verification is submitted, so the consent screen names JobHunt rather than the
  Supabase host.
- **AC-23**: The stored field list is rendered from a typed field registry, and a test fails when
  `src/lib/supabase/database.types.ts`, which is generated from the applied schema, shows a column
  in a personal data table that no registry entry names. A migration that adds a column the notice
  does not mention fails the suite rather than quietly making the notice incomplete.

## Decision

**Chosen option**: Option 2: Write both pages from the code, enforce the recipient list with a test,
and carry the work through to the Google console.

Two static pages generated from verified facts about this codebase, with the third party list held
in a typed registry that a test guards, and the feature is not finished until Google's app is
published and brand verification submitted.

**Implementation skills**: none. This feature writes no database code and no Supabase queries, so
neither `supabase` nor `supabase-postgres-best-practices` applies. `vitest`
(`antfu/skills`, `.agents/skills/vitest/`) is relevant only for the registry test's project
placement, and the existing unit tests beside components are a closer model than the skill.

## Rationale

See [rationale.md](rationale.md).

## Feature design

**Data model sketch**

No schema change. This feature adds no table and no column, deliberately: acceptance is not recorded
(see Consequences), and every fact the notice states is read from code and configuration that
already exists. The one new module is a typed registry, which is source code, not data:

```
DataRecipient = {
  readonly id: string             // stable key, e.g. "supabase"
  readonly name: string           // shown on the page
  readonly receives: string       // plain words, what this company gets
  readonly why: string            // plain words, why it gets it
  readonly envKeys: readonly string[]  // the src/env.ts keys that reach it, may be empty
}
```

`envKeys` is what makes AC-5 enforceable, and an empty array is meaningful: it marks a recipient
this app reaches without holding a credential of its own, which is exactly Google and GitHub.

An empty array is not, however, the same as a key that reaches nobody, and the build needed a
second shape to say so without lying (see invariant 2):

```
NonRecipientEnvKey = {
  readonly key: string            // a key in src/env.ts
  readonly why: string            // plain words, why it reaches no third party
}
```

The AC-5 test asserts that the set of keys declared in `src/env.ts` is exactly the union of the two
lists, with no key claimed twice and no entry naming a key that no longer exists. A stale entry
fails just as loudly as an unclassified key, so the registry cannot quietly outlive the
configuration it describes.

A second registry does the same job for the stored field list, which the cross check found had no
drift protection while the recipient list did:

```
StoredField = {
  readonly table: string          // a table in the generated database types
  readonly column: string         // a column in that table
  readonly describedAs: string    // the plain words the notice uses for it
}
```

The AC-23 test reads `src/lib/supabase/database.types.ts`, which is regenerated from the applied
schema by `pnpm db:types`, and fails when a personal data table holds a column no entry names. This
is the same guard as AC-5, pointed at the other half of the notice.

**State transitions**: none. Both pages are static.

**API surface**

| Route | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/terms` | GET | none | the terms document, indexable | public | none, static render |
| `/privacy` | GET | none | the privacy notice, indexable | public | none, static render |

Neither page reads the session, reads the database, or opens a Sentry span. Binding rule 4 asks for
a named span where a failure rate matters; a static prerender has no failure to rate, and opening
one would add a client boundary these pages must not have.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| render `/privacy` | the list of stored personal fields | the applied schema in `supabase/migrations/20260825162457_data_model.sql`, which spec 0003 `index.md:190` names authoritative for this feature |
| render `/privacy` | the identity fields from the provider | spec 0007 `index.md:155`: email address, display name, avatar URL in `auth.users` |
| render `/privacy` | the list of third parties and what each receives | the typed registry module, which the AC-5 test binds to `src/env.ts` |
| render `/privacy` | the claim that Sentry receives no personal data | `src/sentry.server.config.ts` and `src/instrumentation-client.ts`, the `dataCollection` block |
| render `/privacy` | the retention policy | decided here: kept until asked, no fixed period, no automatic dormancy deletion |
| render `/privacy` | the deletion contact address | decided here: `contact@usejobhunt.dev` |
| render `/privacy` | the deletion procedure described to the reader | the cascade in the migration: `profile.id references auth.users (id) on delete cascade`, so removing the account record removes everything below it |
| render `/privacy` | the responsible party and country | decided here: JobHunt, Ghaly Nicolas Jules, United States |
| render `/privacy` | the rights list | decided here: the GDPR and UK GDPR rights set |
| render `/privacy` | the lawful basis per purpose | decided here: contract necessity for identity, profile and application data; legitimate interest for error monitoring |
| render `/privacy` | the stored field list | the typed field registry, which the AC-23 test binds to `src/lib/supabase/database.types.ts` |
| render `/privacy` | what Vercel receives | Vercel's own Privacy Notice: IP address and IP derived location data. User agent is deliberately not claimed, because that notice does not confirm it |
| render `/privacy` | the cookie disclosure | the Supabase session cookie the proxy refreshes, `src/proxy.ts` |
| render `/terms` | acceptable use, and what "removed for abuse" means | decided here, AC-15: no scraping, no applying on another person's behalf, no reaching another user's data |
| render `/terms` | the content licence granted | decided here, AC-15: non exclusive, limited to operating the service, revoked on deletion, not sublicensable, not for training |
| render `/terms` | the warranty and liability position | decided here, AC-15: as is, limited to the fullest extent the law allows, no cap figure because the service is free |
| render `/terms` | how the terms change | decided here, AC-15 and AC-16: updated in place with the effective date bumped, no advance notice |
| render `/terms` | governing law and venue | decided here, AC-15: the laws of the State of Georgia, United States of America, venue in the state and federal courts located in Georgia. Named in full to disambiguate from the country of the same name |
| both pages | the effective date | a constant in the registry module, updated by hand when the text changes materially |
| `/sign-in` | the acceptance line | static copy, no stored value, because acceptance is deliberately not recorded |

**Key invariants**

1. The recipient list on the page and the registry are the same list. The page never hardcodes a
   company name the registry does not hold. This is the shape that already failed once in this
   repo, where `hero-section.tsx` carried a written count beside a list that had moved on
   (`src/features/entry-page/AGENTS.md`).
2. Every key in `src/env.ts` is accounted for by exactly one registry entry, or the suite fails.
   Most map to the recipient that receives them. Three reach no third party at all, two local
   switches and this site's own canonical address, and those are named in
   `ENV_KEYS_WITH_NO_RECIPIENT` with a reason each. Two of Vercel's three system values sit there
   too, because Vercel supplies them to the build rather than receiving them. The third,
   `NEXT_PUBLIC_VERCEL_ENV`, does not: Sentry stamps it on every event, so it is filed under
   Sentry. That mistake was made in this build and caught by a cross check, which is the case the
   definition below exists to prevent.

   **What "reaches" means**, since features 11, 13 and 14 will each have to apply it: a key reaches
   a recipient when it is what connects this app to that company, its credential, its address, or a
   value transmitted to it. It reaches nobody only when no company is on the other end of it at all.
   A key supplied *by* a company is not thereby a key that reaches it, and if its value is sent
   onward to somebody else it belongs to that somebody.

   **Corrected on 2026-09-01, after the build.** This invariant first said every key maps to a
   RECIPIENT, which cannot be satisfied honestly: the only way to obey it literally is to file a
   local switch under a company, which would put a false sentence on a page whose entire value is
   that every claim on it can be checked. AC-5 itself is unchanged, because its wording is broad
   enough to cover a second list, and so is the forcing function. A new key still fails the suite until somebody decides which side of
   the line it falls on, and landing one in the second list is exactly as visible in review as
   adding a company.
2b. Every column in a personal data table maps to exactly one field registry entry, or the suite
   fails. Invariants 1 and 2 protect the recipient list; this one protects the field list, and it
   exists because the cross check found the notice guarded on one side only.
3. Neither page may introduce `"use client"`. Both live under the marketing tree, whose
   `AGENTS.md` forbids it outright.
4. The published address receives mail. An address on a permanent public page that nobody reads is
   a silent failure, which this project's rules forbid. Verified on 2026-09-01; it is the kind of
   thing that breaks later without telling anyone, so verify checks it again rather than trusting
   the date.

**Security model**

Both pages are public and hold no user data, so there is nothing to authorise. They read no session
and query nothing. The one security relevant property is the opposite of the usual: these two routes
deliberately opt back in to search indexing while every other route stays out, so the build must not
widen that beyond the two pages.

Compliance scope: this feature is where the project's GDPR and UK GDPR posture is written down. It
does not change what is processed; spec 0003 and spec 0007 decided that.

**Configuration required**

No new environment variable. Two prerequisites outside the code:

- Mail on `usejobhunt.dev` delivers `contact@usejobhunt.dev` to a mailbox that is read. **Already
  done**: configured and verified by the engineer on 2026-09-01, and corroborated here by DNS on the
  same day (Zoho MX at priorities 10, 20 and 50, plus an SPF record including `zohomail.com`). This
  is a prerequisite that is already met, not one the build waits on.
- Google Cloud console access, for AC-21 and AC-22.

**Critical test scenarios**

- Happy path: both pages render, and the recipient list on each matches the registry, verifies
  **AC-1**, **AC-3**, **AC-6**.
- Drift: adding a key to `src/env.ts` with no matching registry entry fails the unit suite, and
  removing the assertion is checked to fail the test, so it is not vacuous, verifies **AC-5**.
- Regression: changing a Sentry `dataCollection` value to send personal data fails a test, so the
  claim on the page cannot become false silently, verifies **AC-4**.
- Schema drift: adding a column to a personal data table without naming it in the field registry
  fails the unit suite, verifies **AC-23**.
- Tracking drift: adding an analytics dependency or a third party script tag fails the unit suite,
  verifies **AC-14**.
- Metadata: the two pages are indexable while the root layout's robots assertions still pass,
  verifies **AC-17**.
- No client boundary: `/sign-in` still ships zero client JavaScript with the acceptance line added,
  verifies **AC-19**.
- Delivery: a real message to the published address arrives, re confirmed at verify time rather
  than assumed from the setup date, verifies **AC-9**.

## Build plan

Ordered as a Tracer Bullet: a thin but real thread from route to footer link to the live domain
first, because the Google console is the thing this feature exists to unblock and it needs live
URLs, not finished prose. The words thicken after the thread is proved.

1. Create the two typed registries (recipients, with today's five entries; stored fields, covering
   the six tables plus the identity fields) and the effective date constant, plus the three guard
   tests: the recipient test binding to `src/env.ts`, the field test binding to
   `src/lib/supabase/database.types.ts`, and the absence test for analytics dependencies and third
   party script tags. Add the Sentry configuration regression test, satisfies **AC-4**, **AC-5**,
   **AC-6**, **AC-23**, and the enforcement half of **AC-14**.
2. Create `/terms` and `/privacy` as `(marketing)` routes composing `EntryHeader navigation="none"`
   and `EntryFooter`, each with its own metadata and indexable robots override, on placeholder
   prose, satisfies **AC-1**, **AC-17**, **AC-20**.
3. Link both from the entry page footer's reserved centre slot and from a static line under the
   provider forms on `/sign-in`, satisfies **AC-18**, **AC-19**.
4. Write the privacy notice's real content: the stored field list, the recipient list rendered from
   the registry, the Sentry claim, retention, the deletion procedure and contact address, the
   responsible party, the rights and lawful basis, the Google disclosure, and the cookie line,
   satisfies **AC-2**, **AC-3**, **AC-7**, **AC-8**, **AC-10**, **AC-11**, **AC-12**, **AC-13**,
   **AC-14**.
5. Write the terms content and the effective date treatment on both pages, satisfies **AC-15**,
   **AC-16**.
6. Re confirm delivery to the published address, then do the console work: authorized domain, the
   two URLs, publish out of Testing, and submit brand verification, satisfies **AC-9**, **AC-21**,
   **AC-22**. The address is already configured and verified, so this step is a check, not setup.

## Consequences

**Positive**

- The 100 user meter stops running. Every sign in after this costs nothing permanent, which is the
  reason the feature moved into Foundation.
- The consent screen can finally name JobHunt, closing the finding spec 0007 recorded on 2026-08-30.
- Both halves of the notice become something the suite holds rather than something a person must
  remember: the recipient list at features 11, 13 and 14, and the stored field list at every future
  migration. The field guard exists because a cross check found the notice protected on one side
  only, which is the same asymmetry that produced the drift bug this pattern was borrowed from.
- The notice is accurate in the way templates never are: the field list comes from the applied
  schema, and the Sentry claim from the running configuration.

**Negative and tradeoffs**

- **No EU or UK representative is appointed, and this is an accepted risk, not an exemption.**
  Article 27 requires one for a controller outside the Union offering services to people in it. The
  exception in Article 27(2) needs processing that is occasional, and the EDPB reads occasional as
  not carried out regularly and outside the regular course of business. Storing a profile and work
  history for every signed in person is the regular course of this business, so the exception does
  not hold. The conditions are cumulative, so failing one is enough. This is recorded as a knowing
  choice given the project's realistic exposure, and it is a real exposure.
- **No lawyer reviews this.** Drafting from verified facts removes factual error, which is the most
  common defect in a small product's privacy notice. It does not remove legal risk, and nothing here
  should be read as saying it does.
- **Acceptance is not recorded.** Nobody knows who agreed to which version. Recording it needs a
  `profile` row that does not exist until feature 9, and a checkbox needs client state the marketing
  tree forbids. If the terms change materially before feature 9 ships, there will be no record of
  what anyone accepted.
- **Deletion is manual.** A request is fulfilled by a person removing the account record by hand. It
  works and it cascades correctly, and it depends on the operator reading an inbox. Self serve
  deletion is feature 27.
- **The enforcement test cannot cover Google and GitHub.** Their credentials live in
  `supabase/config.toml` and the Supabase dashboard, never in `src/env.ts`, so the AC-5 test is
  blind to them. It is well aimed at Adzuna and the model providers, which is the staleness this
  feature actually fears, and the two OAuth entries stay correct by review alone.
- **Two routes become indexable while the rest of the site stays hidden.** A deliberate asymmetry
  that a later reader could mistake for drift.

**Neutral**

- No migration, no new environment variable, no new dependency.
- The third party list is knowingly incomplete on the day it ships. Adzuna arrives at feature 11 and
  the model providers at 13 and 14, and each must add its own entry as part of its own build. The
  AC-5 test is what makes that fail loudly rather than pass quietly.
- The claim that data is not used to train models is true today and needs care at features 13 and
  14. Sending data to a model to get an answer is not training it, but whether a provider retains or
  trains on what it is sent is that provider's terms, and those must be read before the claim is
  extended to cover them.

## Follow-up

- [ ] Feature 27's scope row does not mention account deletion. If the privacy notice implies self
      serve deletion arrives later, that obligation belongs on row 27, the way feature 21's
      dependency was recorded on row 7. **For `/scope`, not `/sync`**: corrected on 2026-09-01 after
      the `/sync` run, whose boundary allows reconciling a feature's status but never adding to its
      row. Sending a later session to `/sync` for this would have it do nothing and report nothing.
- [ ] Features 11, 13 and 14 each add their own recipient registry entry as part of their own build.
      Recorded in their scope rows by **`/scope`, not `/sync`** (corrected 2026-09-01, same reason as
      the item above), and enforced by the AC-5 test for any that add an `src/env.ts` key.
- [ ] Before features 13 and 14 send profile content to a model provider, read that provider's terms
      on retention and training, and update the notice's claim to match.
- [x] **Two recipient registry entries are wrong and need a code fix, for `/develop`.** **Done 2026-09-01**, and the weakness behind them is now guarded: `recipients.test.ts` fails when a key filed as reaching nobody is read inside a module that configures a company's SDK. That guard was proved by restoring the original bug and watching it fail, naming both Sentry configs. Found by the
      cross check on this revision, 2026-09-01. First, `NEXT_PUBLIC_VERCEL_ENV` sits in
      `ENV_KEYS_WITH_NO_RECIPIENT` saying it "carries nothing outward", which is false: both Sentry
      configs pass it as `environment`, so Sentry stamps it on every event. It belongs in Sentry's
      `envKeys`. Second, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`'s stated reason says it tags a Sentry
      event, but the SDK infers the release from the separate unprefixed `VERCEL_GIT_COMMIT_SHA`;
      the declared key is read nowhere in `src/`. The classification is right, the reason describes
      a different variable. Neither is visible on the page, since that list is not rendered, so this
      is a weakened guard rather than a false public claim.
- [x] The scope row for feature 21 carries no `Design it (spec)` box, although the scope's own legend
      says every feature has exactly one. **Done**: the box was added and ticked when this spec was
      written on 2026-09-01, and it records why nothing had flagged the missing spec earlier.
- [ ] If the terms change materially before feature 9 ships, revisit recording acceptance, since
      there is no record of which version anyone agreed to.
- [ ] A lawyer's review is the only thing here that manages legal risk rather than reducing factual
      error. Deferred as a reasonable call for a free portfolio project, recorded so the deferral is
      visible.
