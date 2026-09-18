# 0009 · Terms and privacy notices

**Date**: 2026-09-01
**Status**: Accepted

**Revision 2, 2026-09-18, itself corrected the same day after a cross check.** AC-14's cookie
disclosure was found false on the deployed site: the privacy notice claimed one cookie is set, when
the codebase sets several. A second AC (AC-24) adds the drift guard that the recipient list (AC-5)
and the stored field list (AC-23) already have, which this claim never got; its primary check is
against real response cookies, not source text, after the first draft of this same correction
under-named the cookies and nearly registered something that was not a cookie at all. See the
corrected AC-14, the new AC-24, invariant 5, the Feature design section, and the Follow-up entry
dated 2026-09-18 below; reversed text is struck through and annotated SUPERSEDED rather than
deleted, per this repo's own precedent (spec 0006 AC-7, spec 0021).

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
- **AC-14**: ~~The privacy notice discloses the session cookie as strictly necessary to sign in, and
  states there is no analytics and no tracking today. A test fails if an analytics dependency or a
  third party script tag is introduced, so the claim cannot become false in silence.~~ ·
  **SUPERSEDED 2026-09-18, corrected further after a cross check the same day.** Found false on the
  deployed site: the notice claimed one cookie is set when the codebase sets, in three kinds, more
  than that. Replaced by: the privacy notice discloses every cookie the codebase sets, each
  described as strictly necessary and none used for tracking:
  - The Supabase session cookie, possibly split into numbered chunks (name and count chosen by
    `@supabase/ssr`, `sb-<project-ref>-auth-token`), written by `src/lib/supabase/server.ts` and
    refreshed by `src/proxy.ts`.
  - The short lived PKCE verifier cookies `@supabase/ssr` writes during the OAuth handshake itself
    (`<storageKey>-code-verifier` and, per flow, `<storageKey>-flow-<flowId>-code-verifier` plus a
    `<storageKey>-flows-code-verifier` index). **This fact was already known in this repository**:
    `src/features/auth/AGENTS.md:29` documents the verifier as a host only cookie that breaks sign
    in across a preview URL, and names it as documented expected behaviour. It simply never reached
    the page a visitor actually reads, which is the strongest argument for AC-24's registry being
    the one source both the code's own behaviour and the notice's prose read from.
  - `jobhunt_return_path` (spec 0008 AC-5b), a short lived, first party, `httpOnly` cookie written
    by `rememberReturnPath()` in `src/features/auth/actions.ts` only when a signed out visitor
    follows a protected deep link, and cleared by the callback
    (`src/app/auth/callback/route.ts:73`).

  It also still states there is no analytics and no tracking today. A test fails if an analytics
  dependency or a third party script tag is introduced, so that half of the claim cannot become
  false in silence; the cookie half now has its own guard, AC-24.
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
- **AC-24** (added 2026-09-18, revised the same day after a cross check): The cookie disclosure is
  enforced against the code and, primarily, against what a real visitor's browser actually
  receives, the same way AC-5 enforces the recipient list and AC-23 enforces the field list. A
  typed cookie registry names every cookie the codebase can set, whether by a literal name
  (`jobhunt_return_path`) or a documented pattern for one a library names at runtime (the Supabase
  session and PKCE verifier cookies). Two guards, not one:
  - **Primary: an integration test drives three real steps and asserts each step's own
    `Set-Cookie` names against the registry, not the combined set.** This measures what a visitor
    experiences rather than what the source text appears to do, per this project's own standing
    rule that a system level guarantee must be proved at the outcome, not at the code
    (`docs/reflexes.md`, added 2026-08-28). The three steps produce different cookies, and the test
    names each expectation so an absent cookie reads as a wrong assertion rather than a missing
    disclosure:
    1. **Starting sign in** (the provider Server Action, `src/features/auth/actions.ts`) is where
       the PKCE verifier cookie is actually written, verified against the installed
       `@supabase/auth-js` 2.112.3: `signInWithOAuth()` calls `_getCodeChallengeAndMethod()`
       (`GoTrueClient.js:4816`), which writes the verifier through the storage adapter
       synchronously, before the function returns the provider's authorization URL the action
       redirects to. There is no real provider round trip in CI (no browser, no Google or GitHub
       exchange, which is why `test/helpers/session.ts` mints sessions through the admin API
       instead), so this step only reaches as far as that response; it does not complete a sign in.
    2. **The callback** (`src/app/auth/callback/route.ts`) is driven against a session minted
       through the local stack rather than a real provider round trip, and is where the return
       path cookie is cleared.
    3. **An ordinary signed in navigation** is where the Supabase session cookie itself is present
       and refreshed.

    The exact response on which the verifier cookie appears is inferred from the library's source
    above rather than traced end to end through a live request; confirm it against a real response
    during the build, before the assertion is written, and correct this note if the live behaviour
    differs.
  - **Secondary, cheap net: a unit test walks every non-test `.ts`/`.tsx` file under `src/` for a
    call that could set a cookie** (`cookieStore.set(`, `request.cookies.set(`,
    `response.cookies.set(`, `.setAll(`) and fails when a call site is found that no registry
    entry names, or when a registry entry names a call site that no longer exists. This is a known
    incomplete blacklist, the same accepted shape `no-tracking.test.ts`'s script tag scan and
    `recipients.test.ts`'s `RECIPIENT_CONFIG_MODULES` list already carry: a wrapper function or a
    direct `Set-Cookie` response header write would pass it silently. It exists because it is cheap
    and catches the ordinary case; the integration test above is what actually backs the claim on
    the page.

  Nothing in the source tree is registered as a cookie unless it can put a `Set-Cookie` header on a
  real response. A call site that only ever writes to an in memory store never reaches a browser
  and is not a cookie at all; the first draft of this criterion nearly listed one on the public
  page (`src/features/demo/refresh-session.ts`'s session jar, a plain `Map`), caught only because
  the cross check verified the claim against the response, not the source text.

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

**Added 2026-09-18 (AC-24), revised the same day after a cross check.** A third registry, for the
same reason invariant 2's asymmetry was closed for fields in AC-23: the cookie claim had no drift
guard at all, and it went stale the moment spec 0008 added a second cookie.

```
CookieDisclosure = {
  readonly id: string             // stable key, e.g. "supabase-session", "pkce-verifier", "return-path"
  readonly namePattern: string    // a literal cookie name, or a documented pattern for one chosen
                                   // at runtime by a library (the Supabase cookies carry the
                                   // project ref and may be chunked or per OAuth flow). Descriptive
                                   // prose only, like DataRecipient's `receives`/`why`: asserted
                                   // non-empty, never fact checked against a name by either guard
  readonly setBy: readonly string[]  // every call site that can produce this cookie's Set-Cookie
                                      // header, file path with :line. A list because one cookie can
                                      // be written from more than one place (the session cookie
                                      // from both src/proxy.ts and src/lib/supabase/server.ts), and
                                      // because a single call site can differ in kind, per entry,
                                      // from another (src/proxy.ts's request.cookies.set never
                                      // reaches a browser; its response.cookies.set is what does,
                                      // so the two are named as separate registry entries sharing
                                      // one namePattern rather than one entry with mixed visibility)
  readonly purpose: string        // plain words, why it exists. Descriptive prose, not fact checked
  readonly lifetime: string       // plain words, e.g. "for as long as you are signed in", "10 minutes".
                                   // Descriptive prose; the session cookie's real expiry is Supabase
                                   // project configuration, outside src/, so this names what is
                                   // known rather than a value any test can read
  readonly visibleToVisitor: true // every entry in this registry reaches a real visitor's browser,
                                   // by construction: nothing that cannot produce a Set-Cookie
                                   // header on a real response belongs here at all (see below)
}
```

**Not every cookie setting call site is a cookie, and the registry only names the ones that are.**
The first draft of this criterion carried a `visibleToVisitor: false` entry for
`src/features/demo/refresh-session.ts`, the demo refresh's own dedicated internal identity, on the
theory that it "sets a cookie" internally but never for a visitor. The cross check that reviewed
this correction verified the claim against the code rather than trusting it, and found that module
never touches an HTTP cookie store at all: `createCookieJar()` (`refresh-session.ts:77`) holds its
state in a plain `Map`, and its `.set(name, value)` at line 100 is `Map.prototype.set`, not a
cookie API. Nothing there can ever put a `Set-Cookie` header on a response. It is not a cookie the
guard has to watch and not a fact the page has to omit; it is not in scope at all, and naming it in
a legal document, even marked undisclosed, would have been the exact kind of unchecked claim this
whole correction exists to stop making. It is not in the registry. The lesson is in `rationale.md`:
a guard built only on scanning source text is what proposed listing it; the primary guard below,
built on the response instead, could not have made that mistake.

`src/lib/supabase/read-only-cookies.ts`'s `setAll() {}` is a second, different non cookie: a
deliberate no-op adapter for a context where Next.js forbids mutating cookies at all. The secondary
source scan below names it explicitly as a known zero-effect match, rather than letting it read as
an unaccounted-for call site.

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
| render `/privacy` | ~~the cookie disclosure~~ · **SUPERSEDED 2026-09-18**, this row named only one of two real sources | ~~the Supabase session cookie the proxy refreshes, `src/proxy.ts`~~ |
| render `/privacy` | the cookie disclosure | the `CookieDisclosure` registry (AC-24), which names the Supabase session cookie and PKCE verifier cookies (`src/lib/supabase/server.ts`, refreshed by `src/proxy.ts`) and `jobhunt_return_path` (`src/features/auth/actions.ts`, cleared by `src/app/auth/callback/route.ts`), and is itself checked against real `Set-Cookie` headers rather than trusted |
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
5. **Added 2026-09-18 (AC-24), revised the same day after a cross check.** The `Set-Cookie` names a
   real visitor's browser receives, driven through a real sign in, the real callback, and an
   ordinary signed in navigation, match the cookie registry exactly, or the suite fails. This is the
   claim's real guarantee. A secondary, cheaper unit test also maps every cookie setting call site
   under `src/` to a registry entry, but it is a known incomplete net, not the source of truth: it
   would miss a wrapper function or a direct `Set-Cookie` header write, and it cannot by itself tell
   a real cookie store from something that merely resembles one in source text, which is exactly
   what nearly happened when this criterion's own first draft proposed disclosing an in memory
   `Map` as a cookie (see the Feature design section above). Invariants 1, 2 and 2b protect the
   recipient and field lists; this one protects the cookie claim, which had no such protection when
   spec 0008 added a second cookie and the privacy notice went stale without any test noticing. The
   asymmetry is the same shape invariant 2b closed for fields: a notice guarded on some of its
   claims and not others is a notice whose unguarded half nobody is watching.

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
- Cookie drift, real response (added 2026-09-18, revised after cross check): the integration
  suite drives sign in start, the callback, and an ordinary signed in navigation as three separate
  steps, and asserts each step's own `Set-Cookie` names against the registry, so a cookie added to
  what a visitor actually receives, at the step it actually appears, cannot quietly leave
  `/privacy` incomplete the way it already did once, verifies **AC-24**.
- Cookie drift, source scan (secondary net): a new cookie setting call site under `src/` with no
  matching registry entry fails the unit suite, and a registry entry naming a call site that no
  longer exists also fails. A known non cookie in source text (an in memory jar, a deliberate no-op
  adapter) is explicitly excluded rather than silently matched, so the scan does not propose
  disclosing something that is not a cookie, verifies **AC-24**.
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
7. **Added 2026-09-18, revised the same day after a cross check. Two separate steps rather than
   one, because a false claim is live on `/privacy` today and should not wait on the guard's
   design.**
   - **7a. Landed 2026-09-18.** Shipped a corrected, hand written `COOKIES` array in
     `privacy-notice.tsx`: discloses the session cookie, the sign in handshake cookie, and the
     deep link return cookie in plain words, matching the page's existing voice rather than
     exposing internal names. This is an interim, manually verified fix, not yet enforced by a
     test, satisfies the corrected **AC-14** on its own. 1284 unit tests pass; nothing pinned the
     old text.
   - **7b. Landed 2026-09-18.** Built the `CookieDisclosure` registry (`src/features/legal/cookies.ts`),
     replaced 7a's hand written array with `COOKIES` rendered FROM it the same way `RECIPIENTS_INTRO`'s
     list renders from `DATA_RECIPIENTS` (invariant 1's shape, extended to cookies), and added both
     guards, satisfies **AC-24**. Both directions of non vacuity were proved by deliberately breaking
     the registry and confirming each guard fails: an entry for a cookie nothing sets, and a missing
     entry for one that is. Two things found during the build, corrected rather than assumed:
     - A fourth field, `nameRegex`, was added to `CookieDisclosure` alongside `namePattern`: the
       prose field alone cannot be tested by a guard, so the primary integration test would have
       hardcoded its own expectations instead of reading the registry, which a first draft of it
       did and which a later pass caught and fixed. `nameRegex` is machine checked; `namePattern`
       stays human prose.
     - The primary guard's third step could not be built as designed. A freshly minted session, not
       near its access token's expiry, produces no `Set-Cookie` on an ordinary navigation at all;
       `@supabase/auth-js` only rewrites the cookie when it actually rotates the token. The session
       cookie's real name is instead proved through `mintSession()`'s own adapter call, a real
       network exchange with the local Supabase auth server, not a parallel implementation built for
       this test. Forcing a real rotation over HTTP as well is recorded in Follow-up rather than
       built here.

     Building the primary guard also found and fixed a real, pre-existing bug in
     `test/helpers/app-server.ts`, shared test infrastructure this correction does not own but had
     to touch to make AC-24 buildable at all: two test files calling `startAppServer()` at the same
     time raced for `next dev`'s single `<distDir>/lock`, and the loser's `next dev`/`next-server`
     process was left orphaned, still alive and still holding the directory open, rather than
     actually failing loudly. Fixed with a lock race retry (the shared `distDir` name stays fixed,
     matching the entry already pre-declared in `tsconfig.json`, since a unique name per call was
     tried first and reverted: `next typegen` appends a literal, uncollapsible entry to that
     committed file for every distinct name it sees, which would have grown it by two lines on every
     single test run, forever) and a process group kill in `stop()` (`detached: true` plus a negative
     PID signal, since killing only the immediate `pnpm` child left `next`'s own Turbopack workers
     running).

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

- [x] **This item was written on a false premise, corrected 2026-09-01.** It said feature 27's scope
      row does not mention account deletion. It does, and always did: that row's `Done when` clause
      reads "account settings covers deletion". The obligation that is genuinely missing runs the
      other way, and it is now recorded on row 27. This notice describes deletion as a request
      emailed to the published address and fulfilled by hand, phrased that way deliberately, because
      a sentence implying a control nobody can operate would be its one false claim (**AC-8**). The
      day feature 27 ships a real control, the same prose becomes false in the opposite direction by
      understating what a reader can do, so rewriting it is part of that build. No test guards it,
      because the wording is prose.

      Recorded by `/scope`, not `/sync`: `/sync` may reconcile a feature's status but never add to
      its row, so a session sent there would have done nothing and reported nothing.
- [x] Features 11, 13 and 14 each add their own recipient registry entry as part of their own build.
      **Recorded on all three rows on 2026-09-01** by `/scope`, not `/sync` (same reason as the item
      above). Enforced by the AC-5 test for any that add an `src/env.ts` key, which is every one of
      them that arrives with a credential; spec 0009's definition of "reaches" is the rule for
      classifying the rest of that feature's keys.
- [ ] Before features 13 and 14 send profile content to a model provider, read that provider's terms
      on retention and training, and update the notice's claim to match. Still owed, and it is owed
      at build time rather than now; recorded on row 14 on 2026-09-01, since 14 is the feature that
      actually sends a person's profile and written summary. This is the one obligation here that no
      test can catch, because it depends on a document held by somebody else.
- [x] **Two recipient registry entries were wrong. Found by the cross check on this revision and
      fixed the same day, 2026-09-01.** `NEXT_PUBLIC_VERCEL_ENV` sat in `ENV_KEYS_WITH_NO_RECIPIENT`
      saying it "carries nothing outward", which was false: both Sentry configs pass it as
      `environment`, so Sentry stamps it on every event, and it now sits in Sentry's `envKeys`.
      `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`'s reason claimed it tags a Sentry event, but the SDK infers
      the release from the separate unprefixed `VERCEL_GIT_COMMIT_SHA` and the declared key is read
      nowhere under `src/`; the classification was right and only the reason was wrong. Neither was
      ever visible on the page, since that list is not rendered, so both were a weakened guard rather
      than a false public claim.

      **The weakness behind them is now guarded**, which matters more than either fix: nothing
      validated a `why` string, so a wrong classification hid behind prose that read plausibly and
      took a different model to notice. `recipients.test.ts` now fails when a key filed as reaching
      nobody is read inside a module that configures a company's SDK, proved by restoring the
      original bug and watching it fail.
- [x] The scope row for feature 21 carries no `Design it (spec)` box, although the scope's own legend
      says every feature has exactly one. **Done**: the box was added and ticked when this spec was
      written on 2026-09-01, and it records why nothing had flagged the missing spec earlier.
- [ ] If the terms change materially before feature 9 ships, revisit recording acceptance, since
      there is no record of which version anyone agreed to.
- [ ] A lawyer's review is the only thing here that manages legal risk rather than reducing factual
      error. Deferred as a reasonable call for a free portfolio project, recorded so the deferral is
      visible.
- [ ] **AC-14's cookie disclosure was found false on the live site, 2026-09-18.** The privacy notice
      stated "One cookie is set, and it is the session cookie that keeps you signed in", which was
      wrong: `rememberReturnPath()` in `src/features/auth/actions.ts` writes a second cookie,
      `jobhunt_return_path` (spec 0008 AC-5b), whenever a signed out visitor follows a protected
      deep link, cleared by the callback at `src/app/auth/callback/route.ts:73`. It is first party,
      `httpOnly`, short lived (600 seconds) and strictly necessary, so the fix is accuracy rather
      than a consent question.

      **Why nobody noticed is the more important half.** The recipient list, the field list, the
      Sentry configuration and the no analytics claim are each pinned by a test that fails when
      reality drifts (AC-5, AC-23, AC-4, AC-14's tracking half). The cookie claim had no such guard:
      the only legal test mentioning cookies, `sentry-claim.test.ts`, is about Sentry's own
      configuration, not the page's cookie disclosure. Spec 0008 added a cookie in review, correctly,
      and the privacy page silently went stale the same day, because nothing compared what the page
      claimed against what the code actually does.

      **A cross check the same day found the first draft of this correction still wrong, twice.**
      First, AC-14's replacement text named only two cookie kinds; `@supabase/ssr` also writes
      short lived PKCE verifier cookies during the OAuth handshake, a fact already documented in
      this repo (`src/features/auth/AGENTS.md:29`, "the PKCE code verifier is a host only cookie")
      but never carried to the page a visitor reads, which is itself the clearest argument for
      AC-24's registry being the one place both the code's real behaviour and the notice's prose
      draw from. Second, AC-24's first draft proposed registering `src/features/demo/refresh-session.ts`
      as a cookie that reaches nobody: verified against the actual code, that module never touches
      an HTTP cookie store at all, `createCookieJar()` holds its state in a plain `Map`, so it was
      about to be named, even as an undisclosed one, in a legal document it has nothing to do with.
      A guard built by scanning source text is exactly what proposed that; it is why AC-24's primary
      guard asserts the real `Set-Cookie` names a browser receives rather than trusting what the
      source appears to do, with the source scan kept only as a cheap secondary net.

      **Resolved in this revision.** AC-14 now names three cookie kinds (struck through above,
      replaced), and AC-24 adds the drift guard: a `CookieDisclosure` registry, an integration test
      asserting real response cookies against it (primary), and a unit level source scan (secondary,
      explicitly excluding the two things in this codebase that resemble a cookie setting call in
      source text but are not one). The prose correction (Build plan 7a) ships promptly and alone,
      since the false claim is live on `/privacy` today; the registry, the render from it, and both
      guards (7b) follow separately.
- [ ] **The primary guard's session cookie step proves the name through `mintSession()`'s own real
      network exchange, not through an HTTP response from this app, recorded 2026-09-18.** A freshly
      minted session does not get its cookie rewritten on an ordinary navigation, measured rather
      than assumed while building AC-24: only an actual token rotation triggers
      `@supabase/auth-js` to write one, and a fresh mint has nothing to rotate. Forcing a real
      rotation and observing it over HTTP as well would need either a near-expiry session (no
      control over token lifetime from a test) or a second local Supabase project configured with a
      short one. Worth doing if this guard ever needs to prove the outward HTTP half of the session
      cookie specifically, not just its real name.
