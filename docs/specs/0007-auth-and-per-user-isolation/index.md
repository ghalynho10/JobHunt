# 0007. Auth and per user isolation

**Date**: 2026-08-29
**Status**: Accepted

## Summary

This spec builds the real sign in: OAuth through Google and GitHub, on Supabase Auth, with no password anywhere. The isolation half of this feature's name is already built and already proved, by spec 0003's policies and spec 0004's tests, so almost all the work here is identity. The whole handshake runs on the server, so the entry page keeps shipping zero client JavaScript. The development only password sign in from feature 1 is deleted along with the browser client that was only ever reserved for this feature, and a database level hook refuses to create a second empty account for someone who returns on the other provider.

## Requirements

**User stories**:

- As a job seeker, I want to sign in with the Google or GitHub account I already have, so that I do not create another password and my account is tied to a real identity rather than a burner address.
- As a returning user, I want to reach my own data whichever of the two providers I pick, so that forgetting which one I used first does not read as my data being gone.
- As a signed in user, I want to sign out from wherever I am signed in.
- As someone whose sign in fails, I want to be told plainly what happened, in a sentence written by this product, rather than landing on an empty page or reading a provider's raw error text.
- As the operator, I want the development only password path gone from the product rather than switched off, so that no environment can be one variable away from accepting a password.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: A person signs in with Google, and separately with GitHub, on a deployed URL, and arrives signed in at ~~`/health`~~. Signing out returns them to `/` with no session. · **The destination is SUPERSEDED, 2026-08-31, by spec [0008](../0008-app-shell-and-navigation/index.md) AC-6**, which is Accepted and shipped, so the replacement is what the product does today. This spec already flagged its literal `/health` redirect as the single most likely thing here to calcify by accident, and feature 32 is the feature that was always going to replace it. What replaces it: a shared landing rule sending a user with no profile row to `/profile` and everyone else to `/search`. What survives untouched: the rest of this criterion, including the sign out destination.
- **AC-2**: The whole handshake is server side. No file reachable from `/` or from `/sign-in` carries `"use client"`, so spec 0006 **AC-4** still holds after this feature ships, and both provider controls are `<form action={...}>` submits.
- **AC-3**: The return leg lives at `src/app/auth/callback/route.ts`. No route handler under `src/app/api/` reads or writes user data, so binding rule 6 is untouched.
- **AC-4**: `redirectTo` is built from `currentOrigin()` and never from `canonicalSiteUrl`. The PKCE code verifier is a **host only** cookie written on whichever host served the action, so sign in only completes when it is started on the host `currentOrigin()` will return to. Two hostnames can break that, and they are handled differently on purpose:
  - **Preview**: `currentOrigin()` returns the **branch** URL, so sign in must be started there. Starting it on a per commit preview URL fails at the exchange with `exchange_failed`. Documented expected behaviour, not a misconfiguration.
  - **Production**: `currentOrigin()` returns `canonicalSiteUrl`, now `https://usejobhunt.dev`, so a sign in started on the old `usejobhunt.vercel.app` would write the verifier there and be returned to a host that never receives it. **Mitigated at the platform rather than documented**: Vercel 308 redirects the old host, so it cannot serve the application at all and the verifier can never be written on it. Deliberately **not** done in `proxy.ts`, because binding rule 6 confines the proxy to refreshing the session cookie and a host redirect there would widen it.
- **AC-5**: Every failure path redirects to `/sign-in?error=<code>` and the page renders this product's own sentence for that code, verbatim from `## Copy`, **above the two provider forms**. The position is part of the criterion because five of the six sentences say "below" or "from here" and are wrong anywhere else. There are **five** codes, four raised by the callback and one by the sign in actions, listed in `## Feature design` under **Failure codes**. The provider's `error_description` reaches Sentry and never reaches the page.
- **AC-6**: Each of the five codes carries the kind and severity given in the **Failure codes** table, so an ordinary denial never competes with an outage. A cancelled consent and a refused signup are `expected` and raise no alert; a failed exchange and an unreachable provider are `unexpected`. Every one is built by `failure()`, with no log line written beside it.
- **AC-7**: The `error` query value is parsed with Zod as a closed enum of exactly those five codes. An unrecognised value renders the one generic sentence (`COPY-6`) and is never echoed back to the page.
- **AC-8**: A person who signs in with one provider and later with the other, on the same verified email address, reaches the same account and sees the same rows.
- **AC-9**: When linking does not happen, no empty second account is created. The signup is refused with a named reason that tells the person which provider owns that email address.
- **AC-10**: The hook **rejects on its own internal error too**, with its own distinct message, rather than failing open and admitting the signup. A hook that failed open would reintroduce exactly the silent failure this design exists to prevent. That case is proved separately from the case the hook exists to catch, against the real local stack, and the spec's one step rollback is written down rather than improvised.
- **AC-11**: Sign out is a Server Action in `src/features/auth/`, opens its registered span as its first statement, and **constructs** a `failure()` on the failing path, which reports, before redirecting either way. It does not return one: `redirect()` works by throwing, so no caller ever regains control to read a returned value. `src/app/(app)/health/page.tsx` imports it from there.
- **AC-12**: `src/features/dev-session/` no longer exists, `signInWithDevPassword` no longer exists, `src/lib/supabase/browser.ts` no longer exists, and `/sign-in` renders the real page in every environment rather than a 404 outside development.
- **AC-13**: `DEV_SESSION_ENABLED` survives with exactly one remaining job, guarding the test mint in `test/helpers/admin.ts`. It is no longer set on Vercel Preview, `src/env.ts`'s comment about it says so, and spec 0002's configuration table matches.
- **AC-14**: An unauthenticated request to any route under `(app)` redirects to `/sign-in` and never renders an empty page that reads like success.
- **AC-15**: Two real OAuth accounts see only their own rows, proved against the running app rather than only against the seeded fixture pool.
- **AC-16**: ~~The entry page's two provider controls are real submits.~~ `COPY-1` and both `Chip state="status"` labels are gone, because they become false for every visitor the moment this ships. Spec 0006 **AC-17**, the inert apply control, is untouched and its half of the "no dead controls" test still runs. · **The first sentence is SUPERSEDED, 2026-08-31, by spec [0008](../0008-app-shell-and-navigation/index.md) AC-18**, which is Accepted and shipped, so the replacement is what the product does today. Spec 0008 removes every provider form from `/`, which leaves the page with zero `<form>` elements, so the claim about the entry page's provider controls has nothing left to describe. **The substance survives where the controls move to**: they are still real submits, working with JavaScript switched off, on `/sign-in`. What replaces them on `/` is a plain anchor to a door route, which keeps that page static and session free. The deletion of `COPY-1` and the two status labels stands and is not affected.
- **AC-17**: `auth.sign_in`, `auth.callback` and `auth.sign_out` are registered in [docs/observability/spans.md](../../observability/spans.md), and `dev_session.sign_in` is removed from it.
- **AC-18**: `supabase/config.toml` declares both providers with environment variable substitution, its local site and redirect URLs match what `currentOrigin()` actually returns locally, and both `pnpm db:start` and CI's `supabase start` still succeed.
- **AC-19**: The session policy (token lifetime, refresh, forced logout, auth rate limits, manual linking) is recorded for all three environments (local, the development project, the production project), not read off `config.toml` alone, which governs only the local stack.
- **AC-20**: Prerequisites **P1 to P9** are confirmed before the build starts, each marked verified with what was read, not assumed. **P10 is carved out by name and is not part of this criterion**, because it is only answerable once the hook exists: it is verified at milestone 4, and both answers are already handled, so neither blocks the build.

## Decision

**Chosen option**: Option 2: Supabase OAuth, initiated and completed entirely on the server.

Build sign in as two thin Server Actions that call `signInWithOAuth` on the request scoped server client and redirect to the URL it returns (basis: spec 0006 **AC-4**, the entry page ships zero client JavaScript, and spec 0001's server only data path), with a single route handler at `src/app/auth/callback/route.ts` exchanging the returned code for a session (basis: spec 0001 binding rule 6, no user data in `src/app/api/` route handlers), and refuse a second unlinked account at the database with the `before_user_created` hook (basis: the project's no silent failures rule, plus the vendor's documented `4xx` refusal that propagates a reason to the client).

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

Reasoning, the options weighed and the references: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**

This feature adds **no table and no column**. Spec 0003's six tables already key off `profile.id`, which is the `auth.users` id, and their policies already compare against `auth.uid()`. The only new database object is one function:

| Object | Kind | Notes |
|---|---|---|
| `public.before_user_created_hook(event jsonb) returns jsonb` | Postgres function | Called by GoTrue before a new user row is created. Returns an empty object to allow, or an `error` object with a `4xx` status to refuse. Reads `auth.identities` and `auth.users` to decide whether this email already belongs to somebody. |

The function's security context is **not** copied from `public.set_updated_at()` beside it, only its discipline:

- **`security definer`**, deliberately, with the reason stated in the function's own comment. `set_updated_at` is `security invoker` precisely because, as its comment says, it "does nothing that needs elevated rights". This one does: it reads `auth.users` and `auth.identities`, which the calling role cannot.
- **`set search_path = ''`** with every name written fully qualified, the same reason `set_updated_at` gives. On a definer function this is not hygiene, it is the difference between a safe function and a privilege escalation.
- **Explicit `revoke` from `public` and a `grant` to only the role GoTrue calls it as.** A definer function reachable by the wrong role is a different risk class from the invoker function beside it, so the grant is written out rather than inherited.
- It lives in the **`public` schema, not `auth`**, and the URI is `pg-functions://postgres/public/before_user_created_hook`. `config.toml`'s commented template shows `pg-functions://postgres/auth/before-user-created-hook`, which is wrong twice over for this project: the hyphenated name is not a legal unquoted Postgres identifier, and `auth` is Supabase's own schema, changeable by a platform upgrade. This project's migrations own `public`, where all six tables and `public.set_updated_at()` already live, and the dashboard's own schema selector defaults to `public`. Do not copy the template.

**What the hook reads, and the GoTrue behaviour that moves it.** The hook decides by reading `auth.identities` and `auth.users`. Those are not static rows. Verified 2026-08-30 with P7: when GoTrue makes an automatic link it "will remove any other unconfirmed identities linked to an existing user". So the very table the hook queries is rewritten by the linking path the hook does not itself run on, and a later signup reads a table an earlier link already pruned. The hook has to be correct against that, not only against a clean fixture, which is why AC-9's integration test covers the interaction explicitly rather than testing the hook in isolation.

**Rollback, one step**: set `enabled = false` on the `[auth.hook.before_user_created]` stanza. A broken hook stops new signups while existing users keep signing in, so the failure is loud, noticed on the first attempt, and reversed without a migration.

**Deliberately not added**: a trigger on `auth.users` creating a `profile` row. Rejected for four reasons recorded in [rationale.md](rationale.md); the short version is that `profile.full_name` is `not null` with a non blank check, so a provider that returns no name would make the trigger raise inside the signup transaction and surface as an opaque "Database error saving new user". Profile creation stays with feature 9, exactly as spec 0003's value sourcing table already assigns it.

**State transitions**

```
signed out
  -> (submit provider form)      -> at the provider
  -> (consent granted)           -> at GoTrue, /auth/v1/callback
  -> (identity resolved)         -> back at /auth/callback with a code
  -> (code exchanged)            -> signed in, at /health
  -> (sign out)                  -> signed out, at /

  the action cannot reach the provider -> /sign-in?error=provider_unavailable
  at the provider, consent cancelled   -> /sign-in?error=access_denied
  at GoTrue, signup refused            -> /sign-in?error=account_exists
  at /auth/callback, no code           -> /sign-in?error=no_code
  at /auth/callback, exchange fails    -> /sign-in?error=exchange_failed
```

**Failure codes** (the closed set AC-7 parses, and the kind and severity AC-6 requires)

| Code | Raised by | When | `FailureKind` | Severity | Sentence |
|---|---|---|---|---|---|
| `access_denied` | callback | the person cancelled at the provider's consent screen | `session_missing` | `expected` | `COPY-1` |
| `account_exists` | callback | the hook refused the signup, because that email already belongs to another identity | `session_missing` | `expected` | `COPY-2` |
| `no_code` | callback | the callback was reached with no `code` at all, which is a malformed request rather than an outage | `validation_failed` | `expected` | `COPY-3` |
| `exchange_failed` | callback | `exchangeCodeForSession` failed, including the host only cookie case in AC-4 | `external_service_failed` | `unexpected` | `COPY-4` |
| `provider_unavailable` | sign in action | `signInWithOAuth` itself failed before the person ever left the site | `external_service_failed` | `unexpected` | `COPY-5` |
| (anything else) | the page | an `error` value outside the enum, which is never echoed | not a failure, the page only renders | n/a | `COPY-6` |

**API surface**

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `signInWithGoogle()` (Server Action) | POST (form) | none | redirect to Google | public | redirect to `/sign-in?error=provider_unavailable` when `signInWithOAuth` fails |
| `signInWithGitHub()` (Server Action) | POST (form) | none | redirect to GitHub | public | as above |
| `/auth/callback` (route handler) | GET | `code:string` (opt), `error:string` (opt), `error_description:string` (opt) | 303 to `/health`, or to `/sign-in?error=<code>` | public | never 500s to the browser; every path is a redirect |
| `signOut()` (Server Action) | POST (form) | none | redirect to `/` | authenticated | `failure()` on a failing `signOut`, then redirect anyway |
| `/sign-in` (page) | GET | `error:string` (opt, parsed with Zod) | the two provider forms, plus one sentence when `error` is present | public | an unknown code renders the generic sentence |

Two thin actions rather than one taking a provider argument, on purpose: a provider name arriving from a form is untrusted input needing its own boundary parse, and there is nothing to gain from it when the set is closed at two.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| sign in (either provider) | `provider` | a literal in each action, never form input, because there are exactly two and neither comes from the browser |
| sign in (either provider) | `redirectTo` | `currentOrigin()` from [src/lib/origin.ts](../../../src/lib/origin.ts) plus `/auth/callback`. Never `canonicalSiteUrl`, which is the production origin in every environment |
| sign in (either provider) | the provider URL to redirect to | `data.url` returned by `signInWithOAuth`, never built by hand |
| sign in (GitHub) | the `user:email` scope | a literal in the GitHub action's options, because automatic linking needs a verified primary email back |
| callback | `code` | the `code` query parameter, put there by GoTrue |
| callback | the session cookies | `exchangeCodeForSession`, written through `src/lib/supabase/server.ts` |
| callback | the error code on the redirect | the **Failure codes** table above, a fixed map from each failure case to one enum member, never the provider's own string |
| callback | what Sentry records | `failure()` in [src/lib/result.ts](../../../src/lib/result.ts), carrying `error_description` as context |
| callback | the landing path | the literal `/health`, provisional, see `## Consequences` |
| `/sign-in` page | the sentence shown for a failure | the `## Copy` block below, `COPY-1` to `COPY-6`, written by the engineer and used verbatim, keyed by the parsed code |
| `/sign-in` page | the parsed code | `error` query parameter through a Zod enum, with an unknown value falling to the generic sentence |
| refusal hook | which provider owns the email | a query over `auth.identities` inside the hook function |
| refusal hook | the message the person sees | the hook's own `error` object, propagated to the client by GoTrue |
| sign out | the destination | the literal `/` |
| `/health` | the profile, or the missing profile failure | unchanged, `readOwnProfile()` under the existing policy |

**Key invariants**

1. **No password path exists anywhere in the product.** Not disabled, not flagged, absent. The only remaining credential path is the test mint, which lives outside `src/` and is guarded by `DEV_SESSION_ENABLED`.
2. **One person, one account, per verified email.** Enforced in the database by the refusal hook, not by application code that a later caller could forget.
3. **`redirectTo` never carries untrusted input.** It is derived from validated environment variables, so the allowlist is a second line of defence rather than the only one.
4. **No provider text reaches a rendered page.** Provider strings go to Sentry as context. This is the same untrusted input reaching a surface shape that feature 14 will meet again with job descriptions, arriving one layer earlier.
5. **The two origin values never substitute for each other.** `currentOrigin()` for `redirectTo`, `canonicalSiteUrl` for metadata. [src/app/layout.test.ts](../../../src/app/layout.test.ts) already fails if `layout.tsx` so much as mentions `currentOrigin`.
6. **Sign out is best effort but never silent.** A failing `signOut` still clears what it can and still redirects, and it still reports.

**Security model**

Every route under `(app)` requires a session, checked in its layout, with row level security in Postgres as the real guarantee behind it. `/` and ~~`/sign-in`~~ are public and read nothing. Route handlers under `src/app/api/` are untouched by this feature; the callback deliberately sits at `src/app/auth/callback/route.ts` instead.

> **AMENDED, 2026-08-31, by spec [0008](../0008-app-shell-and-navigation/index.md), which is Accepted and shipped.** `/sign-in` stops reading nothing. Spec 0008 AC-20 has it read the session, so a visitor who is already signed in is bounced to the landing rule rather than shown the provider buttons again, and that bounce also reads profile row existence through the landing rule. **`/` is not affected and its half of this sentence stands unchanged**: it still reads no session, mounts no Supabase client, and stays statically prerendered, which spec 0008 AC-19 restates and holds itself to. The distinction matters, because `/` being session free is the accepted contract spec 0008 rejected three of its four options to preserve.

The data this feature newly touches is the identity itself: an email address, a display name, and an avatar URL, arriving from the provider into `auth.users`. That is personal data, and the privacy notice describing it belongs to feature 21, which this spec does not pre empt. No new compliance scope is triggered here beyond what spec 0003 already carries.

`redirectTo` takes no untrusted input, so there is no open redirect surface to guard. The Supabase allowlist still exists and still matters, as defence in depth and as the thing that stops a stolen client id being used against a different origin.

**Configuration required**

New environment variables, local stack only, consumed by `config.toml` through `env()` substitution. The exact names the Supabase CLI expects must be read off the CLI's own convention at build time rather than guessed:

- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`
- `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`

Both pairs go into `.env.example`, since `.gitignore` ignores `.env*` with only `.env.example` and `.env.test.example` excepted, so an undocumented variable is invisible to a fresh clone. Confirm which file the Supabase CLI actually reads them from when running `supabase start`; it is not necessarily the file Next.js reads.

CI gets placeholder values for all four, so `supabase start` succeeds on a job that never drives a real handshake.

**A real user row now exists in `jobhunt-dev`.** Completing the Google sign in during P1 created at least one row in that project's `auth.users`, carrying a real personal email address. It is **kept deliberately**, not inherited: it is the identity AC-8 is proved with, and P8's residual risk is only exercised by a real account with private email on. Three constraints come with keeping it. It lives in the hosted development project **only**, never production. It is not fixture data, so it never enters `supabase/seed.sql`, never enters a recorded fixture, and AGENTS.md's rule that fixtures carry no real personal data is unaffected because this is not one. And the integration suite is untouched by it, because that suite runs against the local stack rather than this project.

**Removed**: `DEV_SESSION_ENABLED` from the Vercel Preview scope. Nothing deployed reads it after this feature, and CI sets it on the test jobs itself.

**Prerequisites.** **P1 to P9 are complete**, worked 2026-08-29 and 2026-08-30. Several are *exercised* rather than inspected: a real sign in was driven through both providers against `jobhunt-dev`, so P1, P2 and P3 rest on the handshake actually completing, not on a settings page reading correctly. That is what AC-20 covers. **P10 sits outside AC-20 and blocks nothing**: it cannot be answered until the hook exists, it is answered at milestone 4, and both of its answers are already handled below.

| # | What to confirm | Where | State today |
|---|---|---|---|
| P1 | A Google OAuth application exists | Google Cloud console | **VERIFIED AND EXERCISED 2026-08-30.** Client id `703897676335-netlumnloml2k0e63s70o9pp315n4d6i.apps.googleusercontent.com`, in a **new** Google Cloud project created for JobHunt. The separate project was necessary rather than tidy: there is one consent screen per project and "My First Project" already hosts one for another app, `jobpilot`, so reusing it would have shown "jobpilot" to JobHunt's users. Branding: support and developer contact `mghalynho@gmail.com`, no logo, App domain fields empty, Authorized domains are the two Supabase hosts only. Audience: External, publishing status **Testing**, test user added, OAuth user cap 0 of 100. Verification status reads "Verification is not required since your app is in Testing status". A full Google sign in completed live against `jobhunt-dev` |
| P2 | A GitHub OAuth application exists | GitHub developer settings | **VERIFIED AND EXERCISED 2026-08-30.** Client id `Ov23li5Bou0Avqa30EEA`, homepage `https://usejobhunt.vercel.app`. **One app serves all three hosts**: GitHub now allows up to 10 redirect URIs per OAuth app, so the spec needs no per environment app. "Allow wildcard matching" unchecked on all three entries, Device Flow off. Its authorization screen was reached live and reads "Authorize JobHunt" |
| P3 | GoTrue's callback registered as a redirect URI on both providers, three times each | both consoles | **VERIFIED AND EXERCISED 2026-08-30.** `https://serbucmdtvbspkbmxewl.supabase.co/auth/v1/callback`, `https://fvaaebmjrrrjxxnaiyrb.supabase.co/auth/v1/callback`, and `http://127.0.0.1:54321/auth/v1/callback` on each. Both providers were driven live through Supabase's authorize endpoint with **no `redirect_uri_mismatch`**, so both halves are proven rather than inspected |
| P4 | Both providers enabled, with credentials, on both hosted projects | Supabase dashboards | **VERIFIED 2026-08-30.** Same two credential pairs on both, since one Google client and one GitHub app cover all three hosts. Two dialog settings recorded as **deliberate, not default drift**: "Allow users without an email" is **off** in all four provider dialogs, which is what enforces at the platform the verified email condition automatic linking depends on rather than leaving it an assumption; and "Skip nonce checks" is **off** on Google in both, see finding 4 for why local differs |
| P5 | Redirect allowlists: exact origin on production, branch shaped wildcard on development | Supabase dashboards | **VERIFIED 2026-08-30.** `jobhunt-dev`: Site URL `http://localhost:3000`, allowlist `https://*-pgjules1996-6954s-projects.vercel.app/**`. The Vercel account slug is `pgjules1996-6954s-projects` and the project is `jobhunt`, so branch URLs take the shape `jobhunt-git-<branch>-pgjules1996-6954s-projects.vercel.app`. `jobhunt-prod`, **updated 2026-08-30 after the domain move**: Site URL `https://usejobhunt.dev`, redirect `https://usejobhunt.dev/**`. **The `/**` is not optional and the record says so on purpose**: it was briefly set as a bare `https://usejobhunt.dev`, which is an exact match and would not have matched the `/auth/callback` return, so production sign in would have fallen through to Site URL instead of completing. Google's and GitHub's six redirect URIs are untouched by the move, because they point at `<ref>.supabase.co`. **The dev Site URL pointing at localhost is deliberate**: Site URL is the fallback when a redirect matches nothing in the allowlist, and an unreachable localhost fails **loudly** where a real URL would quietly sign someone in on the wrong environment. That is the same loud over quiet trade this feature makes everywhere else. **The wildcard pattern itself stays unproven until the first preview sign in at build plan step 5**, and if that fails on a redirect mismatch this line is the first suspect |
| P6 | `before_user_created` is available on the plan | Supabase dashboards, Auth Hooks | **VERIFIED ON BOTH PROJECTS**, 2026-08-29 on `jobhunt-dev` and extended 2026-08-30 to `jobhunt-prod`. "Before User Created hook" appears **above** the "Team or Enterprise Plan required" divider on the Free org in each; only MFA Verification Attempt and Password Verification Attempt are gated. The Add dialog offers hook type Postgres with a schema selector defaulting to `public`. **Not created on either project**: the function does not exist yet and the dialog requires selecting one |
| P7 | Automatic linking behaves as documented, same email and verified only | the vendor's own documentation, **not** a dashboard | **VERIFIED 2026-08-30.** There is **no dashboard toggle**: automatic linking is default GoTrue behaviour, not a setting, so this row is a recorded finding rather than a check that was missing. It links a new OAuth identity to an existing user sharing the same email address, and only when that address is verified, because linking an unverified one "could lead to pre-account takeover attacks". Two limits recorded with it: **SAML SSO users are excluded** from linking of either kind, and manual linking (`linkIdentity`) is a separate beta feature, off by default, which supports a *different* email address, so it is **not** the mechanism AC-8 rests on |
| P8 | GitHub returns a verified primary email for the account being used | a real GitHub account | **VERIFIED 2026-08-30, with a named residual risk.** `mghalynho@gmail.com` is **Primary and Verified** on GitHub and is the same address as the Google account, so AC-8 is provable with one real identity. It is also marked **private**, which was the risk: with private email on, GitHub's `/user` endpoint returns `32783189+ghalynho10@users.noreply.github.com` instead, and if GoTrue read *that* field the address would not match the Google identity, automatic linking would not fire, and the hook would refuse a signup that should have linked. AC-8 would fail and AC-9 would fire wrongly, **with a symptom that looks like a broken hook rather than a scope problem**. Reduced by direct observation: GitHub's authorization screen, reached with **no scope parameter in the URL**, requested "Personal user data, Email addresses (read only)", so Supabase's GitHub provider requests `user:email` by default and `/user/emails` is in scope. **Still inferred**: whether GoTrue actually prefers `/user/emails` over `/user`'s email field. Mitigation, in verify.md: prove AC-8 with this account while private email stays **on**, so the risky path is the one tested |
| P9 | Session policy on both hosted projects matches what this spec records | Supabase dashboards | **VERIFIED 2026-08-30**, read off both and identical to each other and to `config.toml`. Values in the matrix below are the **read** values, not inherited scaffold ones, which is the whole point of the row |
| P10 | **How a hook rejection reaches this application during an OAuth signup.** The vendor page confirms the general claim, that a `4xx` with an `error` object "blocks the request and propagates the error message to the client", but not the concrete shape for OAuth: does GoTrue forward it to the registered `redirect_to` as `/auth/callback?error=...`, the same channel a cancelled consent uses, or answer from its own endpoint so this application never sees it? | the local stack, **at milestone 4**, since it cannot be answered before the hook exists | **open, and carved out of AC-20 on purpose.** Both answers are handled, so it blocks nothing. **Yes**: `account_exists` renders `COPY-2` naming the owning provider. **No**: `COPY-2` falls back to its own escape hatch, "or say plainly how to find out", which is a copy change rather than a spec change |

**Fallback, and the amendment it requires first.** P6 is now **verified available**, so this is no longer a live branch of the build: it is the contingency for the hook being withdrawn or changed on a surface the vendor marks beta. If it is ever taken, AC-9 is met in the callback instead. Read the freshly signed in user, and where the email already belonged to another identity, refuse and sign back out, removing the partial account through [src/lib/supabase/secret.ts](../../../src/lib/supabase/secret.ts).

**That fallback cannot simply be built.** Spec 0001 binding rule 1 closes the secret key allow list at three named callers (the test mint, the kill switch read, feature 31's demo account) and says in terms: "Adding a fourth caller means editing this spec." The callback would be a fourth. So taking this path means **amending spec 0001 first**, as part of the same change, not as a footnote discovered mid build. Sequencing: this stays a contingency while the hook works, and the moment it is taken it becomes the primary path, so the spec 0001 edit has to land with it rather than after it.

That fallback also has a window worth naming: by the time the application can read the freshly signed in user, `exchangeCodeForSession` has already written real session cookies, so the account and a live session exist briefly before the check deletes the row. A crash between those two steps leaves a browser holding a session pointing at a deleted user.

**Session policy** (AC-19). `supabase/config.toml` governs the **local Docker stack only**. The two hosted projects carry their own settings in their own dashboards and nothing in this repository constrains them, so recording the local file as though it were the product's policy would document the wrong environment, the exact failure written up in [docs/experiments/0002-deployment-and-environments.md](../../experiments/0002-deployment-and-environments.md): "A verification pointed at the wrong environment returns a perfectly real result about the wrong thing, and it reads as success."

| Setting | Local (`config.toml`) | Development project | Production project |
|---|---|---|---|
| Access token (JWT) expiry | `3600` | `3600` | `3600` |
| Session timebox | commented, so none | `0`, none | `0`, none |
| Inactivity timeout | commented, so none | `0`, none | `0`, none |
| Enforce single session | not set | off | off |
| Detect and revoke compromised refresh tokens | not set | **on** | **on** |
| Refresh token reuse interval | not set | `10s` | `10s` |
| `sign_in_sign_ups` rate limit | `30` per 5 minutes per IP | `30` per 5 minutes | `30` per 5 minutes |
| `token_refresh` rate limit | `150` per 5 minutes per IP | `150` per 5 minutes | `150` per 5 minutes |
| `token_verifications` rate limit | `30` per 5 minutes per IP | `30` per 5 minutes | `30` per 5 minutes |
| `email_sent` / `sms_sent` / `anonymous_users` rate limits | `2/h` / `30/h` / `30/h` | same | same |
| Web3 rate limit | `30` per 5 minutes | `30` per 5 minutes | `30` per 5 minutes |
| IP address forwarding | not set | off | off |
| `enable_manual_linking` | `false`, deliberately | off | off |
| **`skip_nonce_check` on Google** | **must be `true`**, see finding 4 | **off** | **off** |
| `before_user_created` hook **enabled** | `config.toml` stanza | **dashboard state, nothing in this repository records it** | **dashboard state, nothing in this repository records it** |

`enable_manual_linking` stays `false` on purpose and is recorded here so a later reader does not flip it thinking it is what makes linking work. Verified 2026-08-30 (P7): it is **off by default**, so `false` is confirming the default rather than changing it, and it governs the `linkIdentity` API for linking a **different** email while already signed in, a separate beta feature from the automatic linking this decision rests on. Automatic linking has no setting at all.

**Finding 4, an asymmetry worth knowing before local Google sign in fails opaquely.** `skip_nonce_check` is the one row where local must differ from both hosted projects. `config.toml`'s own comment on the provider stanzas says it plainly: "If enabled, the nonce check will be skipped. Required for local sign in with Google auth." Both hosted projects keep it off, correctly. Local needs it on, and discovering that from a failed handshake rather than from this table is exactly the cost this row exists to avoid.

**Finding 1, the constraint behind the judgement.** This spec records keeping the session defaults as a judgement about a product whose users come back to check applications, and that reasoning holds. But it should not read as a free choice, because it was not one: both projects show "Configuring user sessions is only available on the Pro Plan and above", so the timebox and inactivity timeout were never available to set. Recorded alongside the judgement so a later reader on a paid plan knows it has become a real decision rather than a settled one.

**The last row is a split that matters.** The hook **function** ships in a migration, so it is versioned, reviewed and applied the same way as everything else. Its **enablement** on `jobhunt-dev` and `jobhunt-prod` is dashboard state that no file here records, so the two can drift: a migration can land with the hook switched off on production and nothing in this repository would say so. That is the same drift shape as the deferred alert rule detection item, and it is why the row is written out rather than assumed to follow the migration.

**Critical test scenarios**

- Happy path, manual: sign in with Google on a deployed URL, land on `/health`, sign out, land on `/` signed out. Repeat with GitHub, verifies **AC-1**.
- Happy path, automated: an unauthenticated request to `/health` redirects to `/sign-in`, verifies **AC-14**.
- Failure case: the callback with `error=access_denied` redirects to `/sign-in?error=access_denied`, renders this product's sentence, and emits **no** Sentry alert, verifies **AC-5**, **AC-6**.
- Failure case: the callback with no `code` and with an unusable `code` each redirect to their own code, and the failing exchange reports as `external_service_failed`, verifies **AC-5**, **AC-6**.
- Failure case: `/sign-in?error=<junk>` renders the generic sentence and never echoes the junk, verifies **AC-7**.
- Failure case: a hook made to error internally still **refuses**, with its own distinct message, rather than failing open and admitting the signup. A hook that failed open would recreate the silent empty account this whole mechanism exists to prevent, verifies **AC-10**.
- Auth and permission: two real OAuth accounts each read only their own rows, verifies **AC-15**.
- Auth and permission: a second provider on the same verified email reaches the same account, verifies **AC-8**; and on an unverified or absent email is refused with the owning provider named, verifies **AC-9**.
- Failure case: the hook still decides correctly **after** GoTrue has pruned unconfirmed identities during an earlier automatic link, since that prune rewrites the `auth.identities` rows the hook reads. Driven against the real local stack, not a clean fixture, verifies **AC-9**.
- Regression: nothing reachable from `/` or `/sign-in` carries `"use client"`, verifies **AC-2**.
- Regression: `grep` finds no `signInWithDevPassword`, no `src/features/dev-session/`, and no `src/lib/supabase/browser.ts`, verifies **AC-12**.

## Copy

**Written by the engineer, used verbatim.** One slot per code in the **Failure codes** table. Five were written on 2026-08-30 and are **final**. `COPY-2` stays empty until milestone 4, because its content depends on P10's answer. `/develop` must not invent or reword any of them.

**These strings are the engineer's and are used verbatim**, and the punctuation rule that applies to the rest of this document applies inside the Text column too. There is no carve out. The reasoning is stronger here than anywhere else in the spec: this workflow already avoids dashes in its own prose, and product copy is the last place to make an exception, because it is the only text a user actually reads. Em dashes and semicolons in microcopy read as machine written, and em dash overuse in particular is one of the most cited markers of AI generated text, which costs something real on a portfolio facing product. All five strings use full stops, with a single comma in `COPY-5`. **Do not reintroduce an em dash, an en dash, or a semicolon into any of them, `COPY-2` included when it is written at milestone 4.**

| Slot | Shown when | Text |
|---|---|---|
| `COPY-1` | `access_denied`, the person cancelled at the provider | You cancelled before signing in. Nothing changed. Pick an option below when you're ready. |
| `COPY-2` | `account_exists`, the signup was refused because the email already belongs to another identity | _written at milestone 4, once P10 is answered_ |
| `COPY-3` | `no_code`, the callback was reached with no code | Something was missing from that link. Start again below. |
| `COPY-4` | `exchange_failed`, the code could not be exchanged | We couldn't finish signing you in. Start again from here. An older tab or link won't work. |
| `COPY-5` | `provider_unavailable`, the provider could not be reached at all | That provider isn't responding right now. Try the other option, or try again shortly. |
| `COPY-6` | anything else, an `error` value outside the enum | Something went wrong signing you in. Please start again below. |

**Three constraints the copy creates.** Each is a requirement on the build, not a note about tone.

1. **`COPY-4`'s "Start again from here. An older tab or link won't work." is the AC-4 fix in plain words, not politeness.** Restarting from this page is precisely what resolves the host only PKCE cookie case, on a per commit preview URL or on the old production host. The clause is load bearing and must not be trimmed for brevity.
2. **Every "below" assumes the error line renders ABOVE the two provider forms.** That is a layout constraint the copy imposes on `/sign-in`, recorded here because otherwise someone reorders the page later and the copy silently becomes wrong. AC-5 carries it so it is checkable rather than only documented.
3. **`COPY-3`, `COPY-4` and `COPY-6` all tell the person to "start again", and that repetition is deliberate.** The action genuinely is the same and only the first sentence differs. Recorded so a later reader does not improve them into artificial variety.

**Two decisions already settled, so they are not reopened at build time.**

- **`COPY-5` stays generic rather than naming the failing provider.** The redirect carries only `/sign-in?error=<code>`, and AC-7 parses a closed enum of five with no provider dimension in it. Naming the provider would mean widening what AC-7 parses, for very little gain.
- **No slot apologises or reassures.** This matches spec 0006's register, where its own `COPY-1` states the fact and moves on with nothing softening it.

## Build plan
## Build plan

Tracer Bullet, so the first milestone is one provider all the way through a real deployment, not the full surface half built. The refusal hook and the second provider come after the thread is proved, because a thread that does not reach a real provider proves nothing about any of this.

**Milestone 1: prerequisites, confirmed not assumed.**

1. Work P1 to P9 in `## Configuration required`, marking each verified with what was read. Register the GoTrue callbacks (P3) and the allowlists (P5). Stop and return to `/architect` if P6 comes back unavailable and the fallback changes the shape, satisfies **AC-20**.

**Milestone 2: the thin thread, Google only, proved on a preview.**

2. Add `[auth.external.google]` and `[auth.external.github]` to `config.toml` with `env()` substitution, fix `site_url` and `additional_redirect_urls` to match `http://localhost:3000` (both are stock scaffold values today and the second is `https` on a loopback address), add the four variables to `.env.example`, and add placeholders to CI, satisfies **AC-18**.
3. Build `src/features/auth/`: `signInWithGoogle()`, the `/auth/callback` route handler, and the failure code map from the **Failure codes** table, with each code's kind and severity as given. Open the span first in each, keep `redirect()` outside the span callback and outside any `attempt()`, since it works by throwing, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**.
4. Rebuild `/sign-in` as a real page with the Google form and the **full five member Zod enum**, including `account_exists`. Wire the copy slots reachable at this milestone verbatim: `COPY-1`, `COPY-3`, `COPY-4`, `COPY-5`, `COPY-6`, all five final as of 2026-08-30. **Render the error line above both provider forms**, since the copy says "below" and "from here". **`COPY-2` waits for milestone 4**, because `account_exists` cannot be raised until the hook exists, so its sentence is unreachable here and its content is not yet decided. Delete the dev only guard from it, satisfies **AC-5**, **AC-7**, **AC-12**.
5. Deploy and sign in with Google on the preview, confirming the return lands on the branch URL. Tick spec 0002's blocked verify step for `currentOrigin()` while doing it, which has been waiting for this feature to become its first caller, satisfies **AC-1**, **AC-4**.

**Milestone 3: thicken. GitHub, sign out, and the deletions.**

6. Add `signInWithGitHub()` and its form. **Name `user:email` explicitly, and word it as confirming a default rather than adding a scope**: P8 observed GitHub's authorization screen requesting "Email addresses (read only)" with no scope parameter in the URL at all, so Supabase already asks for it. Written that way, nobody later strips it as redundant nor re adds it as missing, satisfies **AC-1**.
7. Rebuild `signOut()` in `src/features/auth/` with its span and its `failure()` path, and repoint `src/app/(app)/health/page.tsx`'s import, satisfies **AC-11**.
8. Delete `src/features/dev-session/` and `src/lib/supabase/browser.ts`. Rewrite `src/env.ts`'s `DEV_SESSION_ENABLED` comment to name its one remaining job, and remove the variable from Vercel Preview, satisfies **AC-12**, **AC-13**.
9. Register the three spans and remove `dev_session.sign_in` from the registry, satisfies **AC-17**.

**Milestone 4: the account rule.**

10. Write `public.before_user_created_hook(event jsonb)` and its migration: `security definer` with its reason in the comment, `set search_path = ''` with fully qualified names, an explicit `revoke` from `public` and a `grant` to only the role GoTrue calls it as. Make it **reject on its own internal error** with a distinct message rather than failing open. Enable it in `config.toml`, and enable it in **both hosted dashboards**, which is state no file here records. Answer **P10** against the local stack now that the hook exists, then wire **`COPY-2`**, taking its escape hatch wording if P10 comes back no, satisfies **AC-9**, **AC-10**, **AC-19**.
11. Integration tests against the real local stack for both hook paths, the hook's behaviour **after** an automatic link has pruned unconfirmed identities, both callback failure paths, sign out, the protected redirect, and isolation between two users, satisfies **AC-5**, **AC-6**, **AC-9**, **AC-10**, **AC-14**, **AC-15**.

**Milestone 5: the entry page, and the record.**

12. Turn the entry page's two provider labels into real submits, delete `COPY-1` and both status chips, and split spec 0006's "no dead controls" test so its apply control half survives, satisfies **AC-16**.
13. Record the session policy matrix from the two dashboards, satisfies **AC-19**. Prove AC-8 and AC-15 on real accounts, satisfies **AC-8**, **AC-15**.

## Consequences

**Positive**:

- The product has a real front door. Every feature from 9 onward has a real user to attach rows to, and the thread spec 0001 opened at feature 1 finally runs on a real identity.
- The password path is gone rather than guarded, so the class of bug where a flag is set in the wrong environment cannot happen for authentication at all.
- `currentOrigin()` gets its first caller, which unblocks a spec 0002 verify step that has been stranded since 2026-08-22 on code that had never run outside a build.
- `docs/app-shell-direction.md` section 2, marked **BLOCKED** pending exactly this feature's trigger decision, is unblocked. Choosing no trigger keeps "land on `/profile` if no profile row exists" meaningful, so the app shell feature inherits a rule rather than redesigning it.

**Negative and tradeoffs**:

- **Between this feature and feature 9, a brand new user's happy path ends on a visible error.** They land on `/health` and see the `record_not_found` that spec 0003 **AC-14** exists to prove. That is the honest state and the tracer bullet working, not a defect, and [verify.md](verify.md) carries it as an expected outcome so `/check verify` does not read it as a failure. It ends when feature 9 ships.
- **`/health` as the landing destination is provisional and is the single most likely thing here to calcify by accident.** The real rule belongs to `docs/app-shell-direction.md` section 2 and the app shell feature owns it.
- **A deep link does not survive sign in.** The protected layout discards what was asked for. Deferred to the app shell feature, with the constraint already settled here so the validator is designed once: reject anything that is not a single leading slash path.
- **The refusal hook runs inside signup, so a broken hook is a total outage of the front door** resting on one Postgres function. This is accepted on the visibility axis rather than the reach axis: a broken hook fails **loudly**, nobody can create an account, existing users keep signing in, it is noticed on the first attempt, and it rolls back in one step by setting `enabled = false` on the stanza. The alternative fails quietly, where one rare person gets an empty account and reads their own data as lost. This project prefers a loud total failure to a quiet wrong answer, the same call already made for the missing profile and for `currentOrigin()` throwing rather than guessing. AC-10 is the price: the hook must reject on its own internal error too.
- **The done when clause cannot be proved by a machine.** Google blocks automated browsers, and this project has Vercel deployment protection on, so a run would have to clear Vercel SSO before it ever reached Google. Two walls, not one. **Feature 7 is explicitly not the feature that brings Playwright**, so AGENTS.md's line about it arriving with the first feature needing a browser stays true and the next feature does not reopen it.
- **Google's consent screen does not name this product, and that is a user visible misrepresentation on the front door.** Verified 2026-08-30 by running the real handshake: the screen reads "Sign in to `serbucmdtvbspkbmxewl.supabase.co`", tells the person Google will let *that host* access their information, and points them at that host's Privacy Policy and Terms of Service, which do not exist. The word "JobHunt" appears nowhere. GitHub's screen, run minutes earlier against the same project, reads "Authorize JobHunt" correctly, so this is Google specific rather than a misconfiguration. **Cause is inferred, not confirmed**: Google appears to derive the displayed name from an Authorized domain, and the only authorized domains are the two `supabase.co` hosts, which this project does not own and cannot verify. Both remedies need a domain we own, so see the Follow-up. **Not a v1 blocker**: sign in works and both providers were exercised live.
- **Leaving Google's Testing mode is gated on feature 21, and the meter only runs one way.** Publish app is greyed because the privacy policy and terms of service links are empty, and feature 21 (Terms and privacy notices) is what produces them. Until then the app is capped at 100 users, and Google counts that cap "over the entire lifetime of the app", so it never goes back down. Confirmed not to block feature 7: Branding flags no field, Verification status says verification is not required in Testing, and a real sign in completed. **Updated 2026-08-31**: when this was written feature 21 sat in Slice 5 and neither scope row recorded the dependency. Both changed on the strength of this paragraph. The dependency is now on feature 21's row, and the feature moved to Foundation, to be built after feature 32, precisely because a meter counted over the app's lifetime is not something to leave until launch readiness.
- **Session forced logout was never an option to weigh.** Both projects report "Configuring user sessions is only available on the Pro Plan and above". The spec's judgement to keep the defaults stands, but on a paid plan it becomes a real choice rather than a settled one.
- **A load bearing invariant now sits on a surface the vendor marks BETA.** Auth Hooks is labelled beta in the Supabase dashboard, and this design puts the one account rule on it. That is accepted because the rollback is one switch and the failure is loud, but it is a real dependency on a surface whose shape the vendor may still change.
- **A wildcard in the development project's allowlist is broader than an exact URL.** The vendor's own guidance recommends wildcards for preview and local, and exact paths for production, which is what this does, but it remains a real widening on the non production project.

**Neutral**:

- The entry page at `/` still shows a sign in invitation to a signed in visitor. That defers to the app shell feature, because options that fix it require `/` to read the session, which contradicts spec 0006's accepted security model ("no session check, no Supabase client, no Server Action, no user data of any kind") and its **AC-4**. That is the same contract that settled the search route as `/search` rather than a `/` that branches on session, so this is one decision, not two coincidences. **What does not defer**: `COPY-1` and the two status chips become false for **every** visitor the moment this ships, signed in or not, and fixing them needs no session read. Those change in this feature, per AC-16.
- Four Accepted specs carry statements this feature makes false, and one carries an old debt. They are amended alongside this spec: spec 0001's file tree lists `browser.ts`; spec 0002's configuration table gives `DEV_SESSION_ENABLED` to Preview with a purpose that no longer exists; spec 0004's follow up asks for a production refusal "in the mint and in the development sign in both", which shrinks to the mint only; spec 0006 **AC-7** is superseded; and spec 0005's component inventory still owes its `Logo` row.
- The seeded fixture users keep their password hashes in `supabase/seed.sql`. They are inert once no password path exists, and the mint has never used them, so removing them is churn in feature 8's artifact for no gain.

## Follow-up

- [ ] Carry the deep link return path into the app shell feature, with the constraint settled here: reject anything that is not a single leading slash path.
- [ ] The app shell feature owns the signed in header, the signed in variant of `/`, and the real post sign in destination from `docs/app-shell-direction.md` section 2, which this feature unblocks.
- [ ] Feature 21's privacy notice must describe what arrives from the provider into `auth.users`: email address, display name, avatar URL.
- [ ] Feature 27 (auth remainder) owns account settings, and with them any forced logout, session timebox, or provider unlinking.
- [ ] **For feature 27, not this one.** `supabase/auth#2472` is open and unanswered by maintainers: adding email and password to an existing OAuth account does not update `raw_app_meta_data` and does not create the `auth.identities` row, while the reverse direction works. Reported against the Kotlin and Swift libraries rather than `supabase-js`, so whether it reproduces here is unknown. It matters only if feature 27 adds a password path to an account that already exists, which is what that feature contemplates. Recorded here rather than on feature 27's scope row, because `/architect` may not edit another feature's row.
- [ ] If P6 comes back unavailable and the callback fallback is used, AC-9 and AC-10 change shape enough to be worth a short `/architect` update rather than a build time improvisation.
- [ ] `docs/observability/spans.md` will hold three unalerted auth spans. Decide at feature 10, which brings the first alert rule, whether `auth.callback`'s failure rate deserves one.
- [ ] An `src/features/auth/AGENTS.md` is likely warranted once this lands, holding the provider and callback conventions, so root `AGENTS.md` does not carry them on every task.
- [x] **The custom domain is no longer a deferred cost decision.** **Done 2026-08-30**, moved to `https://usejobhunt.dev`, recorded under the scope's `## Resolved`. It fixed the serving origin and gave AC-4 its production mitigation, and it did **not** fix the consent screen, which still reads the Supabase host because that is the OAuth redirect host. What remains is route B below. Original reasoning kept: It is the only fix for the consent screen naming a Supabase host instead of JobHunt (see Consequences). Both remedies need a domain this project owns: a Supabase custom domain, which is a paid add on, so the host itself reads as the product; or publishing and verifying the Google app, which needs feature 21's privacy policy and terms served from an authorized domain, and **Google will not accept a `vercel.app` address**. The scope's deferred entry is rewritten on those terms. Deciding it before milestone 1 registers callback URLs is still the cheap moment, because moving later means redoing three redirect lists plus a Vercel setting.
- [ ] **Publishing and verifying the Google app is the remaining fix for the consent screen**, and it is gated on feature 21 supplying a privacy policy and terms served from `usejobhunt.dev`. That is now possible where it was not before: Google would not accept a `vercel.app` address as an Authorized domain, and it will accept this one. The Supabase custom domain add on was rejected on cost, since this route reaches the same place for the price of the domain alone.
- [x] **Feature 21 and feature 7 depend on each other and neither scope row says so.** Feature 21 unblocks Google's Publish app, which lifts the lifetime 100 user cap; feature 7 is what makes those notices load bearing rather than paperwork. Recording it on feature 21's row is a `/scope` edit, since `/architect` may not edit another feature's contents. · **Done 2026-08-31.** Feature 21's row now carries the dependency in both directions, including the domain constraint (Google will not accept a `vercel.app` address, so the pages must be served from `usejobhunt.dev`) and what feature 7 puts into `auth.users` that the notice must describe. It also went further than this item asked: the feature moved out of Slice 5 into Foundation, to be built after feature 32, because the cap is counted over the app's whole lifetime and every sign in before those pages exist spends a slot permanently.
- [ ] **P8's residual risk closes at build time, not before.** Whether GoTrue prefers `/user/emails` over `/user`'s email field is still inferred. Proving AC-8 with private email left **on** is what settles it, and a failure there will look like a broken hook rather than a scope problem, so read P8's row before debugging the hook.

