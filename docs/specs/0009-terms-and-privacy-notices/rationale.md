# 0009 · Terms and privacy notices, rationale

The decision record behind [index.md](index.md). Not read during a build.

## Context

Real personal data is already in this database, and more arrives with every slice. Spec 0003 put a
person's full name, location, written summary, skills, employment history, pay expectations,
applications and typed answers into six tables. Spec 0007 added the identity itself: an email
address, a display name and an avatar URL arriving from Google or GitHub into `auth.users`. Nothing
in the product tells anyone this, and nothing tells them how to get it back out.

The forcing function is not the ethics of that, which were never in doubt, but a meter. The Google
OAuth app is in Testing because the console's privacy policy and terms fields are empty. Testing
caps the app at 100 users, and Google counts that cap over the app's entire lifetime, so it never
resets. Every person who signs in before these pages exist spends one of those slots permanently.
That is why the feature was moved out of Slice 5 and into Foundation on 2026-08-31: waiting until
launch readiness would have been spending a budget that cannot be refilled.

A second, smaller force points the same way. Spec 0007 verified on 2026-08-30 that Google's consent
screen reads "Sign in to serbucmdtvbspkbmxewl.supabase.co" and points people at that host's privacy
policy and terms, which do not exist. The word JobHunt appears nowhere. Fixing that needs an
authorized domain the project owns, which it now has, and it needs these two pages to exist at it.

The constraint that shapes everything else is that this notice must stay true. The third party list
is incomplete the day it ships: Adzuna arrives at feature 11 and the model providers at 13 and 14.
A privacy notice that silently stops matching where data actually goes is worse than one written
later, because it reads as a guarantee while being wrong.

## Options considered

### Option 1: Two pages written from a template, checked by hand

Take a standard privacy policy and terms template, fill in the product name and the obvious fields,
publish, and revisit when something changes.

**Pros**

- Fastest route to unblocking the Google console, which is the pressing problem.
- Familiar structure that a reader and a reviewer both recognise.

**Cons**

- Templates describe a generic product. This one would name field categories that do not match the
  six real tables, and would miss the identity fields in `auth.users` entirely.
- It would almost certainly carry clauses that are simply false here, such as analytics, marketing
  email, or a fixed retention period that nothing enforces.
- Nothing stops it going stale, which is the failure this feature's own scope row names in advance.

### Option 2: Written from the code, enforced by a test, carried through to the console

Read the applied schema, the Sentry configuration and the environment schema, write both pages from
what is actually there, hold the recipient list in a typed registry that a test binds to
`src/env.ts`, and finish the job in the Google console rather than at the page.

**Pros**

- Every factual claim traces to a file. The field list comes from the migration, the Sentry claim
  from the running configuration, the deletion procedure from the cascade.
- The staleness that the scope row predicts becomes a failing test rather than a thing to remember.
- It closes the loop the feature exists to close, rather than producing two pages that nobody wires
  into the console.

**Cons**

- More work than a template, on a feature that is mostly prose.
- The enforcement test cannot cover the two OAuth providers, so the coverage is partial and has to
  be described as partial.
- Doing the console work makes the feature's completion depend on steps no test can hold, which
  have to live as manual steps in `verify.md`.

### Option 3: Pages only, console work split into its own feature

Ship two correct pages and stop, leaving the authorized domain, publishing and brand verification
to a later feature.

**Pros**

- Cleanly scoped and fully testable. Everything in the feature is code.
- Smaller, lands sooner.

**Cons**

- The meter keeps running. The pages exist and the cap does not lift, which is the exact gap that
  moved this feature into Foundation in the first place.
- It creates a feature whose value is entirely contingent on another feature nobody has scheduled.

## Rationale

Option 2, because the two forces in Context pull in the same direction and Option 1 satisfies
neither properly. The Google console will accept a template, so a template solves the meter. It does
not solve the thing that made this feature worth doing well: the notice is a factual claim about a
database that this session could read, and reading it costs an hour and removes the entire class of
error that small products actually make. The field list, the Sentry claim and the deletion cascade
were all checked against files here, and two of them turned out to differ from what a template would
have said. The deletion procedure in particular was wrong in the plan we started from: deleting the
profile row leaves the email address, display name and avatar URL in `auth.users` untouched, because
the cascade runs from `auth.users` down, not from `profile` up.

Option 3 was rejected on the meter alone. A feature whose stated reason for existing is that a
counter never resets cannot stop one step short of the thing that stops the counter.

The registry plus test is applied twice, and the second application was not in the first draft. A
cross check on a different model confirmed every factual claim in this spec against the repo, and
then found that the recipient list was guarded by a test while the stored field list, the other half
of the same notice, was not. A later migration adding a column would have made the notice quietly
incomplete, which is precisely the failure the pattern was adopted to prevent. The field registry
and its test against the generated database types close that, and the finding is recorded here
because the asymmetry was invisible to the author and obvious to a second reader.

The registry plus test is not a new pattern invented for this feature. It is the fix this codebase
already applied to the same failure: `src/features/entry-page/AGENTS.md` records that hardcoded
skill counts in `hero-section.tsx` drifted from their own source list, leaving a written count next
to a bar that said something else. A prose list of companies beside a code path that reaches a sixth
company is that bug with higher stakes.

Two of the engineer's earlier positions were revised by checking rather than by argument, and both
revisions are load bearing. The first was that a GDPR shaped notice is what Google expects: Google's
own policy makes Limited Use apply to Sensitive and Restricted scopes only, and this app requests
neither, which is locked by a test asserting Google is asked for no extra scopes. Writing a Limited
Use affirmation would have been claiming compliance with a regime the app is not in. The second was
the opposite direction: the occasional processing exception in Article 27(2) was assumed to cover a
project this small, and the EDPB's reading defeats it, because occasional means outside the regular
course of business rather than infrequent by volume. Storing a career history for every signed in
person is this business. So no representative is appointed and the spec says that is a risk being
accepted, which is a different sentence from saying it does not apply.

On the two things deliberately not built. Acceptance is not recorded because both routes to
recording it are blocked by decisions already made: a checkbox needs client state that the marketing
tree forbids outright, and a stored timestamp needs a `profile` row that feature 9 creates. Deletion
is manual because self serve deletion is feature 27, and because the honest phrasing, request
deletion by contacting us, is what the scope row's own Done when clause asks for. Both are named in
Consequences rather than left to be discovered.

**On invariant 2, corrected after the build (2026-09-01).** As first written, invariant 2 said every
key in `src/env.ts` maps to exactly one RECIPIENT registry entry. That was wrong, and the build
found it: three keys reach no third party at all, and Vercel's three system values travel inward to
the build rather than outward to a company. There were two ways to satisfy the invariant literally,
and both were worse than changing it. Filing a local development switch under a company name would
have put a false line on a page whose entire argument is that every claim on it can be checked,
which is the one defect this feature exists to avoid. Adding a hidden recipient entry that the page
does not render would have broken invariant 1 instead, since the registry and the printed list would
no longer be the same list.

So the registry classifies rather than assigns: a second exported list, `ENV_KEYS_WITH_NO_RECIPIENT`,
holds those keys with a stated reason each. What matters is that nothing was weakened. AC-5 was
wording, a key that no registry entry *accounts for*, is broad enough to cover a second list, so the
criterion itself did not have to change and the invariant was the narrower, wrong restatement of it.
That is worth stating accurately rather than as foresight: AC-5 reads correctly here because it was
written loosely, not because it anticipated a second category. The lesson belongs to the invariant,
not to AC-5. The forcing function is
unchanged, which is the whole point of the guard: a new key added at feature 11, 13 or 14 still
fails the suite until somebody classifies it, the test also fails on a stale entry naming a key that
no longer exists, and putting a key in the second list is exactly as visible in code review as
adding a company to the first. The lesson worth keeping is narrower than the fix: an invariant
phrased as a total mapping onto one list is a bet that the second category will never exist, and
here it already did on the day it was written.

## References

**Project sources**

- `supabase/migrations/20260825162457_data_model.sql`, the applied schema and the delete cascade
- spec 0003 `index.md:190`, which names its data model sketch authoritative for this feature's notice
- spec 0007 `index.md:155`, the identity fields arriving into `auth.users`, and the consent screen
  finding recorded on 2026-08-30
- `src/sentry.server.config.ts` and `src/instrumentation-client.ts`, the `dataCollection` block
- `src/env.ts`, the environment schema the AC-5 test binds to, holding no Google or GitHub credential
- `src/features/auth/actions.test.ts:314`, which locks that Google is asked for no extra scopes
- `src/app/layout.test.ts:80-105`, the only two robots assertions in the suite
- `src/features/entry-page/AGENTS.md`, the no client JavaScript rule and the drifted count precedent
- `src/features/entry-page/entry-footer.tsx`, whose centre slot was left free for this feature
- `docs/scope/scope.md`, feature 21's row and the Resolved entry on the custom domain

**Practices and standards**

- GDPR and UK GDPR transparency duties, and Article 27 on representatives
- EDPB Guidelines 3/2018 on territorial scope, for the reading of occasional
- Google API Services User Data Policy, the general disclosure duty and the Limited Use boundary
- WCAG 2.2 AA, the project's accessibility floor
- Vercel's own Privacy Notice, for what the hosting platform collects (IP address and IP derived
  location data). Checked by the engineer on 2026-09-01, not fetched here, so it is cited by name
  without a URL. It does not confirm user agent logging, which is why the notice does not claim it

**Links** (web verified 2026-09-01)

- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy
- Google OAuth app verification overview: https://support.google.com/cloud/answer/9110914
- GDPR Article 27: https://gdpr-info.eu/art-27-gdpr/
- EDPB Guidelines 3/2018 on territorial scope: https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_en.pdf

Not verified on the web: the 100 user Testing cap and its non reset. Both were observed directly in
the Google Cloud console and recorded in spec 0007; Google's public pages did not state them where
this check looked. Treat them as console observed rather than documentation confirmed.
