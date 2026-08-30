# 0007. Auth and per user isolation, rationale

The reasoning behind [index.md](index.md). `/develop` does not read this file.

## Context

> ⚠️ **Premise note: this feature's name promises two things, and one of them is already built.** Per user isolation was delivered by feature 4 and proved by feature 8. [20260825162457_data_model.sql](../../../supabase/migrations/20260825162457_data_model.sql) enables **and forces** row level security on all six tables, grants only to `authenticated`, and writes `(select auth.uid())` policies for select, insert, update and delete. [test/integration/isolation.test.ts](../../../test/integration/isolation.test.ts) proves both directions against the real local stack, and that proof was itself checked for vacuousness by disabling row level security and watching four assertions fail. Treating isolation as unbuilt work here would mean rebuilding a guarantee that already holds, and the real risk of doing so is worse than the waste: touching working policies to satisfy a checklist is how a working policy gets broken. So this spec is narrower than its title. It is about identity, and about proving the existing isolation under real accounts rather than only under seeded fixtures. The scope row's "Done when" clause is met that way, and AC-15 is where the isolation half lands.

The product has had no way in since it started. Feature 1 built a development only password sign in purely so the scaffold could prove a protected read under a real session, and it has been the only door ever since. It is guarded by `DEV_SESSION_ENABLED`, which defaults to false, so production has never had a door at all. Everything from feature 9 onward writes rows keyed to a user, and none of it can start until a real user can exist.

Three forces shape the answer, and none of them is a preference.

**The first is a set of decisions already made and already Accepted.** Spec 0001 chose Supabase Auth with OAuth only, Google and GitHub, on the reasoning that two providers cover the named audience and no transactional email service is then needed for v1. It also wrote binding rule 6, which forbids authorisation decisions in the proxy and forbids route handlers under `src/app/api/` from touching user data. Spec 0006 shipped an entry page that renders zero client JavaScript and has an automated test that fails if any file it reaches carries `"use client"`. Each of those narrows this design before it starts.

**The second is that this project treats a silent success as worse than a loud failure.** The error model in [src/lib/result.ts](../../../src/lib/result.ts) makes every failure a value built by one constructor that reports to Sentry itself, with a required severity so an ordinary denial does not compete with an outage. Applied to sign in, that rules out the most common shape in the wild: a person who signs in with a second provider, silently gets a fresh empty account, and reads their own data as gone. The whole product is organised against exactly that kind of confident wrong answer.

**The third is the environment split.** Spec 0002 gave this project three environments across two Supabase projects, and `NEXT_PUBLIC_SITE_URL` is deliberately the production origin **everywhere**, including locally, so it cannot be used as an OAuth return address. A second value, `currentOrigin()`, exists for that job and has never had a caller, so it is code that has never run outside a build.

Not deciding is not an option that leaves anything intact. Feature 9, and the four features behind it, are blocked on a real user existing.

## Options considered

### Option 1: Client side OAuth, the conventional Supabase example

A client component calls `signInWithOAuth` on the browser client, the library redirects to the provider, and a callback route exchanges the code. This is the shape nearly every Supabase tutorial shows, and `src/lib/supabase/browser.ts` was written during feature 1 in anticipation of it.

**Pros**:
- The best documented path, so the most examples and the fewest surprises.
- Keeps `browser.ts` genuinely used rather than deleted.
- The provider redirect happens in the browser, which is where the reader already is, so no server hop is added.

**Cons**:
- Ships `"use client"` onto `/`, which breaks spec 0006 **AC-4** and fails its automated regression check. That is an Accepted criterion of a shipped feature, so this is not a tradeoff to weigh but a contract to break.
- Puts a Supabase client in the browser on a project whose spec 0001 data path decision is server only.
- The sign in control stops working with JavaScript disabled or still loading, on the one control the whole product depends on.

### Option 2: Server initiated OAuth, server completed (chosen)

Two thin Server Actions call `signInWithOAuth` on the request scoped server client, take the `data.url` it returns, and `redirect()` to it. A single route handler at `src/app/auth/callback/route.ts` exchanges the returned code for a session. A `before_user_created` hook refuses a second unlinked account at the database.

**Pros**:
- No `"use client"` anywhere, so spec 0006 **AC-4** holds by construction rather than by care, and both controls work as plain form submits.
- `redirectTo` comes from validated environment variables through `currentOrigin()`, so there is no host header to spoof and no open redirect surface to guard.
- The account rule lives in the database, like every other invariant in this project, so no caller can forget it.
- Two literal actions mean the provider name is never untrusted input, which removes a boundary rather than parsing one.

**Cons**:
- Deletes `browser.ts`, which means amending an Accepted spec's file tree rather than silently removing a file.
- Adds a server hop before the provider redirect, so sign in is marginally slower than the client side path.
- The refusal hook runs inside signup, so a hook that errors refuses every new account. That is a real outage mode this option creates and Option 1 does not.

### Option 3: Server initiated, with a profile row created by an `auth.users` trigger

Everything in Option 2, plus the Supabase convention of a trigger on `auth.users` that creates the `profile` row at signup, taking `full_name` from the provider's metadata.

**Pros**:
- Guarantees at least one profile per user in the database, so no feature downstream has to handle a signed in user with no profile.
- Takes the display name from the provider at the one moment it is available, so feature 9's form does not have to ask again.
- The most common Supabase pattern, so the most familiar to a later reader.

**Cons**:
- `profile.full_name` is `not null` with `check (length(trim(full_name)) > 0)`, so a provider returning no name makes the trigger raise **inside the signup transaction**, which surfaces as an opaque "Database error saving new user" with nothing pointing at the cause.
- [supabase/seed.sql](../../../supabase/seed.sql) inserts directly into `auth.users`, so the trigger fires on the seed and gives `dev-three@example.test` a profile, breaking spec 0003 **AC-14**'s deliberately profile free fixture and the test at [test/integration/profile-read.test.ts](../../../test/integration/profile-read.test.ts) whose failure message reads "something is inventing a profile".
- Contradicts spec 0003's own value sourcing table, which already assigns profile creation to feature 9, and `readOwnProfile()`'s doc comment, which says the same.
- Makes `docs/app-shell-direction.md`'s landing rule meaningless. "Land on `/profile` if no profile row exists" cannot discriminate when a row always exists, and it would have to become a three table completeness query instead.

### Option 4: A hosted auth provider instead of Supabase Auth

Move identity to a dedicated provider and keep Supabase for data only.

**Pros**:
- More identity features out of the box (organisations, multi factor, session management UI) than Supabase Auth carries.
- Decouples identity from the database vendor, so a later Postgres move would not also be an auth move.

**Cons**:
- `auth.uid()` is the spine of all six tables' policies and `profile.id` **is** the auth user id. Replacing the issuer means rewriting every policy and re keying the data model, on a foundation that is already Accepted and already proved.
- Adds a third party account, a third set of credentials, and a token verification path to a project run by one person.
- Solves problems this product does not have. There are no organisations, no roles, and no enterprise identity requirement anywhere in the scope.

## Rationale

Option 2 is chosen because it is the only one that satisfies contracts this project has already accepted, rather than the one that is most conventional. Option 1 is what almost every Supabase example shows, and it would be the right answer on almost any other codebase. Here it fails immediately against spec 0006 **AC-4**, which is not a style preference but an Accepted acceptance criterion with an automated regression test behind it, on a page whose whole argument is that it ships nothing it does not need. Choosing the conventional path would mean breaking a shipped guarantee to save a server hop.

Option 3 is the interesting rejection, because it is the Supabase convention and it was rejected on evidence rather than taste. Its benefit is a database guarantee of **at least** one profile per user. But **at most** one is already guaranteed by the primary key, recorded in the migration as invariant 1, and the missing half turns out to be cheap: a signed in user with no profile is exactly the state spec 0003 **AC-14** designed for, proves, and renders as a visible `record_not_found`. Against that modest benefit sit four concrete breakages, three of which are in code that exists today and would fail on the first `pnpm db:reset`. It is worth naming why Option 3's failure mode is disqualifying while the chosen refusal hook's is not, because a later reader could otherwise read the two as contradictory: the trigger raises inside a transaction that was never designed to carry a user facing reason, so the person sees an opaque database string, whereas rejecting with a named reason is precisely what `before_user_created` is designed to do, and GoTrue propagates that reason to the client. One mechanism is being used against its grain and the other with it.

The refusal hook is the part of this design that carries real new risk, and it is chosen with that risk stated rather than discovered. It runs inside signup, so a hook that errors refuses every new account, which is a total outage of the front door resting on one Postgres function. It earns its place because the alternative is worse in a way this project has already ruled out: without it, a person returning on the second provider whose email did not link gets a successful sign in to an empty account, which is a confident wrong answer wearing the appearance of success. That is the single failure shape the error model exists to prevent. So the hook goes in, and AC-10 exists specifically to prove that a broken hook fails differently from a working one. Automatic linking on a verified email is what keeps the path rare, and requesting `user:email` on GitHub is what makes that linking actually fire.

Two smaller calls worth recording. Sign in is two literal actions rather than one taking a provider argument, because a provider name arriving from a form would be untrusted input needing its own boundary parse for a set that is closed at two; removing a boundary beats parsing one. And `redirectTo` is built from `currentOrigin()` rather than from request headers, which was the engineer's initial instruction: the helper already exists, is already doc commented for this feature, derives from validated environment variables, and throws rather than guessing when a preview is missing its branch URL. Reading the host header instead would introduce untrusted input whose only guard lives in a dashboard outside the repository, to cover the case of a preview opened by its per commit URL, which the branch URL resolver handles by landing the person on the branch URL instead.

### The preview URL case, and the alternative rejected there

`currentOrigin()` returns the **branch** URL on a preview, never the per commit deployment URL. That has a consequence the first draft of this spec got backwards, caught by the cross check on 2026-08-29 and corrected in AC-4. `signInWithOAuth` writes the PKCE code verifier as a **host only** cookie, on whichever host served the Server Action. Vercel's per commit and per branch preview aliases are different hostnames, and `vercel.app` sits on the Public Suffix List, so they are different sites to a browser rather than two subdomains of one. Start a sign in on a per commit URL and the return leg lands on the branch host, which never receives that cookie, and the exchange fails. So sign in must be **started** from the branch URL, and the per commit case failing as `exchange_failed` is documented rather than surprising.

The obvious alternative, making origin resolution request aware so the return address always matches the host that served the action, is rejected. It would reintroduce exactly the untrusted host header path that [src/lib/origin.ts](../../../src/lib/origin.ts) already refuses, and that module's own doc comment records why even Vercel's `VERCEL_URL` is not used: Vercel documents it as incompatible with standard deployment protection, which is the protection this project's whole environment split rests on. Trading a documented, testable limitation on one preview URL shape for an untrusted input on every sign in is the wrong direction.

## References

**Project sources** (verifiable, in this repo):

- [spec 0001](../0001-stack-and-architecture/index.md), line 36 (Supabase Auth, OAuth only, Google and GitHub), binding rule 6 (authorisation never in the proxy; no user data in `src/app/api/` route handlers), and the file tree at line 74 that this spec amends.
- [spec 0002](../0002-deployment-and-environments/index.md), the configuration table at line 194 and "Site URL: two values, two jobs", which is why `canonicalSiteUrl` cannot serve as a return address; and its [verify.md](../0002-deployment-and-environments/verify.md) line 181, the step blocked on this feature becoming `currentOrigin()`'s first caller.
- [spec 0003](../0003-data-model/index.md), **AC-2** and **AC-14**, the value sourcing table assigning profile creation to feature 9, and the migration's invariant 1.
- [spec 0004](../0004-test-foundation/index.md), the session mint that does not depend on any password, and the follow up at line 174 that this spec shrinks.
- [spec 0006](../0006-entry-page-and-link-metadata/index.md), **AC-4**, **AC-7** (superseded here), **AC-17**, and the security model at line 137 that keeps `/` session free.
- [docs/app-shell-direction.md](../../app-shell-direction.md) section 2, marked BLOCKED pending this feature's trigger decision.
- [docs/experiments/0002-deployment-and-environments.md](../../experiments/0002-deployment-and-environments.md), the wrong environment conclusion behind AC-19's three column matrix.
- Installed community skills: `supabase` and `supabase-postgres-best-practices` (`supabase/agent-skills`), `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`).

**Practices and standards**:

- Pre account takeover is the named attack behind linking only on a **verified** email; linking an unverified one is the vulnerability.
- Fail closed by default, already this project's pattern for `DEV_SESSION_ENABLED` and `UI_PREVIEW_ENABLED`, applied here to the account rule.
- Parse at every boundary, applied to the `error` query parameter as a closed Zod enum rather than a rendered string.
- Never render untrusted third party text, applied to the provider's `error_description`.
- Defence in depth: the redirect allowlist still matters even though `redirectTo` carries no untrusted input.

**Links** (fetched and confirmed 2026-08-29):

- Supabase identity linking: https://supabase.com/docs/guides/auth/auth-identity-linking · **verified 2026-08-29, re read and extended 2026-08-30 (P7)**: automatic linking is the default, on same email address, and only when verified, because linking an unverified address "could lead to pre-account takeover attacks". **There is no setting for it**, so nothing has to be switched on. GoTrue additionally "will remove any other unconfirmed identities linked to an existing user" when it makes a link, which rewrites the same `auth.identities` rows the `before_user_created` hook reads and is why AC-9's test covers that interaction. **SAML SSO users are excluded** from linking of either kind. Manual linking (`enable_manual_linking`) is a separate beta feature, off by default, for linking a **different** email while signed in, and stays off.
- Supabase redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls · **verified**: `*` matches non separator characters, `**` matches any characters, separators are `.` and `/`. The documented Vercel preview pattern is `https://*-<team-or-account-slug>.vercel.app/**`, and the page recommends an exact redirect URL for production.
- Supabase before user created hook: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook · **verified**: implementable as a Postgres function, runs on OAuth signups, and "Returning a JSON response with an `error` object and a `4xx` status code blocks the request and propagates the error message to the client". **Not verified**: the page states no plan restriction at all, which is not the same as confirming entitlement, hence prerequisite P6.
- GitHub OAuth scopes: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps · **partly verified**: `user:email` "Grants read access to a user's email addresses", and no scope grants public information only. **Not verified**: neither this page nor Supabase's GitHub provider guide documents the verified flag or how Supabase reads it, so prerequisite P8 stays inferred until checked on a real account.
