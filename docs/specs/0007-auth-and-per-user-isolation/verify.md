# Verify: auth & per user isolation · spec 0007 · written 2026-08-29

Nothing here is ticked: the feature is not built. `/check verify` runs this after `/develop`.

> **Two expected states that are NOT failures, read these before running anything.**
>
> **1. A brand new user's happy path ends on a visible error, on purpose, until feature 9 ships.** No profile row is created at signup (spec 0007 rejected the `auth.users` trigger), so a first time sign in lands on `/health` and renders the `record_not_found` that spec 0003 **AC-14** exists to prove. That is the tracer bullet working. It ends when feature 9 builds the profile form. Do not record it as a defect and do not "fix" it here.
>
> **2. Vercel deployment protection is on.** Confirmed 2026-08-28 in [spec 0006's verify.md](../0006-entry-page-and-link-metadata/verify.md) line 9: a preview URL answers an unauthenticated request with `302` to `vercel.com/sso-api`. A `302` to `sso-api` during a preview sign in test is that, not a broken redirect allowlist. Run the deployed checks in a browser already signed in to Vercel SSO, or on production after merge.

## Prerequisites, before any other step

Each of these is a fact about an account or a dashboard, not about this repository. Mark each **verified** with what was read, or leave it unticked. Nothing below can be trusted while any of these is open.

- [x] Google OAuth application exists → **P1**, AC-20 · **VERIFIED AND EXERCISED 2026-08-30.** New Google Cloud project, client id `703897676335-netlum...`, External audience, publishing status Testing, cap 0 of 100. A full Google sign in completed live against `jobhunt-dev`
- [x] GitHub OAuth application exists → **P2**, AC-20 · **VERIFIED AND EXERCISED 2026-08-30.** Client id `Ov23li5Bou0Avqa30EEA`, one app serving all three hosts since GitHub allows 10 redirect URIs. Authorization screen reached live, reads "Authorize JobHunt"
- [x] GoTrue's callback registered on both providers, three times each → **P3**, AC-20 · **VERIFIED AND EXERCISED 2026-08-30.** Both providers driven live through Supabase's authorize endpoint with no `redirect_uri_mismatch`
- [x] Both providers enabled with credentials on both hosted projects → **P4**, AC-20 · **VERIFIED 2026-08-30.** "Allow users without an email" off in all four dialogs, which is what enforces the verified email condition at the platform; "Skip nonce checks" off on Google in both
- [x] Production allowlist holds the production origin → **P5**, AC-20 · **VERIFIED 2026-08-30, updated after the domain move.** `jobhunt-prod` Site URL `https://usejobhunt.dev`, redirect `https://usejobhunt.dev/**`. **The `/**` matters**: set briefly as a bare `https://usejobhunt.dev`, an exact match, it would not have matched the `/auth/callback` return and production sign in would have fallen through to Site URL
- [x] Development allowlist holds a branch shaped wildcard → **P5**, AC-20 · **VERIFIED 2026-08-30**, `https://*-pgjules1996-6954s-projects.vercel.app/**`. `jobhunt-dev`'s Site URL is `http://localhost:3000` **deliberately**: it is the fallback when a redirect matches nothing, and an unreachable localhost fails loudly where a real URL would quietly sign someone in on the wrong environment
- [ ] **The wildcard pattern itself is still unproven.** It is confirmed only when the first preview sign in succeeds at build plan step 5. If that fails on a redirect mismatch, this pattern is the first suspect, not the code → **P5**, AC-4
- [x] `before_user_created` available on the plan → **P6**, AC-20 · **VERIFIED ON BOTH PROJECTS**, 2026-08-29 on `jobhunt-dev`, extended 2026-08-30 to `jobhunt-prod`. Above the "Team or Enterprise Plan required" divider on the Free org in each. Not created on either: the function does not exist yet
- [x] Automatic linking behaves as documented, same email and verified only → **P7**, AC-20 · **VERIFIED 2026-08-30** against the vendor's identity linking page. **There is no dashboard toggle**, so this row's original "where" was wrong: it is default GoTrue behaviour, not a setting. SAML SSO users are excluded from linking of either kind, and manual linking stays off
- [x] The GitHub account returns a verified primary email → **P8**, AC-20 · **VERIFIED 2026-08-30, risk reduced not eliminated.** `mghalynho@gmail.com` is Primary and Verified and matches the Google account. It is also **private**, and the authorization screen requested "Email addresses (read only)" with no scope parameter in the URL, so `user:email` is a default and `/user/emails` is in scope. **Still inferred**: whether GoTrue prefers `/user/emails` over `/user`'s email field. See the AC-8 step below
- [x] Session policy read off **both** hosted dashboards, not off `config.toml` → **P9**, AC-19 · **VERIFIED 2026-08-30**, identical on both and to `config.toml`. Access token expiry 3600, timebox 0, inactivity 0, single session off, compromised refresh token detection **on**, reuse interval 10s, and the six rate limits as recorded in the matrix
- [ ] Hook **enablement** confirmed in **both** hosted dashboards, not just the local `config.toml` stanza. The function ships in a migration, its enablement does not, so the two can drift → AC-19

- [x] `COPY-1`, `COPY-3`, `COPY-4`, `COPY-5` and `COPY-6` are written and **final** → AC-5, AC-7 · **written by the engineer 2026-08-30**, in the spec's `## Copy` block. Used verbatim; `/develop` must not reword them
- [ ] `COPY-2` is filled in before milestone 4, after P10 is answered, taking its escape hatch wording if the answer is no → AC-5, AC-9

## Answered at milestone 4, not before

**P10 is deliberately not in the list above and is not part of AC-20.** It cannot be answered until the hook exists, and both answers are already handled, so it blocks nothing.

- [ ] Once the hook exists, trigger a rejection during a real **OAuth** signup against the local stack → does GoTrue forward it to `/auth/callback?error=...`, the same channel a cancelled consent uses, or answer from its own endpoint so this application never sees it? → **P10**, AC-9
  - **Yes**: `account_exists` renders `COPY-2`, naming the owning provider
  - **No**: `COPY-2` falls back to its own escape hatch, "or say plainly how to find out". A copy change, not a spec change

## UI / manual: the real handshake

These cannot be automated. Google blocks automated browsers and Vercel SSO sits in front of every preview, so this is two walls, not one. Feature 7 is deliberately **not** the feature that brings Playwright.

- [ ] On a deployed URL, in a browser signed in to Vercel SSO, open `/sign-in` and submit the Google control → you reach Google's consent screen → AC-1
- [ ] Grant consent → you return signed in and land on `/health` → AC-1
- [ ] On that first ever sign in → `/health` shows the **visible** `record_not_found` naming the missing profile, not an empty page → AC-14, and the expected state in the note above
- [ ] Repeat both with the GitHub control → the same, on the same page → AC-1
- [x] The old production host cannot serve the application, so the PKCE code verifier can never be written on a hostname the callback will not return to → AC-4 · **PROVED 2026-08-30 after PR #39 merged**, and re runnable: `curl -sI https://usejobhunt.dev/` returns `HTTP/2 200`, and `curl -sI https://usejobhunt.vercel.app/` returns `HTTP/2 308`
- [ ] Start sign in from the preview's **branch** URL → it completes and lands back on the branch URL → AC-4
- [ ] Now start sign in from the same preview's **per commit** URL → it fails at the exchange, showing `COPY-4`, because the PKCE code verifier is a host only cookie written on the per commit host and the branch host never receives it. **This is the documented expected outcome, not a defect.** Sign in is started from the branch URL → AC-4
- [ ] Sign out from `/health` → you land on `/` with no session. Reload → still signed out → AC-1
- [ ] After signing out, request `/health` directly → you are redirected to `/sign-in`, never an empty page → AC-14
- [ ] At the provider's consent screen, **cancel** → you land on `/sign-in` showing `COPY-1` verbatim, and the URL reads `?error=access_denied` → AC-5
- [ ] On that same page → the error line renders **above** both provider forms. Five of the six sentences say "below" or "from here", so a reordered page makes the copy wrong without any code failing → AC-5
- [ ] Check Sentry for that cancellation → **no alert and no issue**. A person changing their mind is the system working → AC-6
- [ ] Sign in with the second provider on the **same verified email** → you reach the same account and see the same rows, not a fresh empty one → AC-8
- [ ] With a second real account, sign in and confirm it sees only its own rows → AC-15
- [ ] **Prove AC-8 with GitHub private email left ON**, on `mghalynho@gmail.com`, so the risky path is the one tested. If linking does not fire and the hook refuses instead, **read P8's row before debugging the hook**: the symptom of GoTrue reading `/user` rather than `/user/emails` is indistinguishable from a broken hook → AC-8, **P8**
- [ ] Attempt a sign in that cannot link (an unverified or absent provider email) → the signup is **refused**, `COPY-2` renders and names which provider owns that email, and no account is created → AC-9
- [ ] Tab through `/sign-in` → both provider controls are keyboard reachable in order, each with the visible teal focus ring, and each submits on Enter → AC-2
- [ ] On `/` at 1440 and at 320 pixels → the two provider controls are real submits, `COPY-1` ("Sign in isn't live yet. Coming soon with Google and GitHub.") is gone, and neither "soon" status chip renders → AC-16
- [ ] On `/` → the apply control in the hero card is still **not** a link. Spec 0006 **AC-17** is untouched by this feature → AC-16

## Commands

- [ ] `pnpm db:start` → the stack starts with both provider stanzas enabled and `env()` secrets resolved → AC-18
- [ ] `grep -n 'skip_nonce_check' supabase/config.toml` → it is `true` on the Google stanza. **Local only**: both hosted projects keep it off. The vendor's own comment says it is "Required for local sign in with Google auth", and without it local Google sign in fails opaquely → AC-18, AC-19
- [ ] Locally, open `/sign-in` and submit a provider → the redirect is accepted by the local GoTrue. This is what proves `config.toml`'s `site_url` and `additional_redirect_urls` were fixed: the stock values are `http://127.0.0.1:3000` and `https://127.0.0.1:3000`, and `currentOrigin()` returns `http://localhost:3000` locally, so the scheme **and** the host both had to change → AC-18
- [ ] `grep -rn "use client" src/` → walk the import graph from `/` and from `/sign-in`. Neither route reaches a file carrying the directive. The literal grep returns `global-error.tsx`, which is Next's required root error boundary and is reachable from neither → AC-2
- [ ] `grep -rn "signInWithDevPassword\|features/dev-session\|supabase/browser" src/ test/` → **no match anywhere**. The password path and the browser client are deleted, not disabled → AC-12
- [ ] `ls src/app/api/` → the callback is **not** there. `ls src/app/auth/callback/route.ts` → it is → AC-3
- [ ] `grep -n "currentOrigin\|canonicalSiteUrl" src/features/auth/*.ts` → `redirectTo` reads `currentOrigin()` and nothing in this feature reads `canonicalSiteUrl` → AC-4
- [ ] `pnpm test` → all unit tests pass, including the split "no dead controls" test whose apply control half still runs → AC-16
- [ ] `pnpm test:integration` → all integration tests pass against the real local stack → AC-5, AC-6, AC-9, AC-10, AC-14, AC-15
- [ ] `pnpm lint` → clean at `--max-warnings=0` → AC-2
- [ ] `pnpm build` → succeeds, and `/sign-in` no longer builds as a hard 404 outside development → AC-12
- [ ] `grep -n "DEV_SESSION_ENABLED" src/ test/ .github/` → the only reads left are `test/helpers/admin.ts` and its test. Nothing under `src/` reads it → AC-13
- [ ] `vercel env ls` → `DEV_SESSION_ENABLED` is no longer set on Preview → AC-13
- [ ] Read `src/env.ts`'s comment on `DEV_SESSION_ENABLED` → it names the test mint as its one remaining job, and no longer says feature 7 deletes it → AC-13
- [ ] Read [docs/observability/spans.md](../../observability/spans.md) → `auth.sign_in`, `auth.callback` and `auth.sign_out` are listed; `dev_session.sign_in` is gone → AC-17

## Checks that must FAIL, run each and then revert

A check that has never failed proves nothing. Each of these is a deliberate break that must be caught.

- [ ] Point `redirectTo` at `canonicalSiteUrl` instead of `currentOrigin()` → the local sign in breaks, because it now tries to return to production. Revert → AC-4
- [ ] Feed `/sign-in?error=<a string not in the enum>` → `COPY-6` renders and the string is **not** echoed onto the page. Confirm by viewing source, not by eye → AC-7
- [ ] Make an automatic link happen first, so GoTrue prunes the unconfirmed identities it says it removes, then run a signup that the hook must refuse → the hook still decides correctly against the pruned `auth.identities` rows, not only against a clean fixture → AC-9
- [ ] Break the refusal hook so it **errors internally** → the signup is still **refused**, with the hook's own distinct message, and never admitted. A hook that failed open here would recreate the silent empty account the hook exists to prevent, which is the failure that matters more than the two messages looking alike. Revert → AC-10
- [ ] With the hook broken, confirm the one step rollback → setting `enabled = false` on `[auth.hook.before_user_created]` restores signups with no migration → AC-10
- [ ] Disable row level security on `public.profile`, run `pnpm test:integration` → the isolation assertions fail. Restore. This is the same vacuousness check feature 8 established, re run because AC-15 now rests on real accounts → AC-15
- [ ] Add `"use client"` to a file reachable from `/` → the regression check fails. Revert → AC-2

## Steps this feature unblocks elsewhere

- [ ] Tick [spec 0002's verify.md](../0002-deployment-and-environments/verify.md) "Current request origin" step, blocked since 2026-08-22 because `currentOrigin()` and `canonicalSiteUrl` had no callers anywhere in `src/`. This feature is that first caller, so the resolver finally runs outside a build → AC-4

## Acceptance-criteria coverage

| AC | Covered by |
|---|---|
| AC-1 | UI / manual, four steps |
| AC-2 | UI / manual (keyboard), Commands (`grep`, `pnpm lint`), must fail (`use client`) |
| AC-3 | Commands (`ls`) |
| AC-4 | UI / manual (branch URL), Commands (`grep`), must fail (`canonicalSiteUrl`), unblocked step |
| AC-5 | Prerequisites (copy slots filled), UI / manual (cancel), `pnpm test:integration` |
| AC-6 | UI / manual (Sentry), `pnpm test:integration` |
| AC-7 | Prerequisites (copy slots filled), must fail (unknown code) |
| AC-8 | UI / manual (second provider) |
| AC-9 | Prerequisites (P10), UI / manual (refusal), `pnpm test:integration` |
| AC-10 | must fail (hook errors internally, and the one step rollback), `pnpm test:integration` |
| AC-11 | `pnpm test:integration`, and the span registry read |
| AC-12 | Commands (`grep`, `pnpm build`) |
| AC-13 | Commands (`grep`, `vercel env ls`, `src/env.ts` read) |
| AC-14 | UI / manual (signed out request), `pnpm test:integration` |
| AC-15 | UI / manual (second account), must fail (row level security off) |
| AC-16 | UI / manual (two steps), `pnpm test` |
| AC-17 | Commands (span registry read) |
| AC-18 | Commands (`pnpm db:start`, local redirect) |
| AC-19 | Prerequisites (P9, read off both dashboards), Commands (`skip_nonce_check` local only), hook enablement on both hosted projects |
| AC-20 | Prerequisites (P1 to P9). P10 is carved out by name and answered at milestone 4 |

---

## Build record, added by `/develop` 2026-08-30

_Everything above is left exactly as `/architect` wrote it, including the boxes.
This section records what the build itself proved, with the evidence, so
`/check verify` can skip re running it, and adds the steps that could not have
been written before the code existed._

### P10 is answered, and the answer is YES

**Verified 2026-08-30 against the running local stack, not inferred.** A
complete external handshake was driven end to end using a stand in OAuth
provider (GoTrue's `url` override on the GitHub stanza, pointed at a small local
server), with the hook made to refuse. GoTrue forwards a hook rejection to the
registered `redirect_to`, the same channel a cancelled consent uses:

```
/auth/callback?error=server_error&error_code=&error_description=<the hook's own message, URL encoded>
```

and **no user row is created**. So `account_exists` is reachable and `COPY-2` is
a sentence somebody will actually read.

Two limits came with the answer, and they are the reason the callback matches on
the message rather than on a code:

- `error` is the generic `server_error`, which a real GoTrue fault also uses.
- `error_code` arrives **empty**. Returning `error_code` or `code` inside the
  hook's own error object was tried; neither survives the redirect.

### Five things this build found that the steps above could not have anticipated

- [x] **The Supabase CLI reads `env()` values from `supabase/.env`, and from the
  process environment.** Confirmed empirically against CLI 2.115.0 both ways, by
  restarting the stack and reading the GoTrue container's environment. There is
  no `--env-file` flag on `supabase start` in this version. The process
  environment half is what lets CI pass placeholders → **AC-18**
- [x] **`NULLIF` is a SQL construct, not a `pg_catalog` function.**
  `pg_catalog.nullif(...)` does not resolve, and under `set search_path = ''` the
  whole hook fell into its own exception handler: every signup refused with the
  internal error message, which is the fail closed behaviour working and the hook
  being broken at the same time. It is unqualified in the migration with a
  comment saying why, so nobody tidies it → **AC-9**, **AC-10**
- [x] **GoTrue prunes an unconfirmed user AND its identity BEFORE calling the
  hook.** This is the P7 interaction, observed directly with a tracing wrapper
  that recorded what `auth.identities` held at hook time. It is why the hook
  correctly ALLOWS on that path: at the moment it is asked, nobody owns the
  address any more. A test written against a clean fixture would have asserted
  the opposite → **AC-9**
- [x] **The hook's message opening is a contract with the application.**
  `ACCOUNT_EXISTS_MARKER` in [src/features/auth/callback.ts](../../../src/features/auth/callback.ts)
  must stay byte for byte identical to the message opening in the migration.
  Locked by an integration test that drives the real function and feeds its real
  message through the real classifier, so rewording one side fails the suite
  rather than degrading `account_exists` into `no_code` → **AC-5**, **AC-9**
- [x] **AC-8's linking behaviour was proved against a stand in provider**: one
  user row, two identities, same user id. That is not a substitute for the real
  account proof in the steps above, which still has to run with GitHub private
  email left **on**, but it does mean a failure there is a scope problem rather
  than a broken hook

### Already proved by this build, with how

- [x] `redirect_to` is `currentOrigin()` plus `/auth/callback`, read off the
  authorize URL the action actually returns → **AC-4**
- [x] The PKCE code verifier cookie is written with **no `Domain` attribute**,
  so it is host only. AC-4's premise is now observed rather than assumed →
  **AC-4**
- [x] All four callback paths `303` to their own code: no parameters →
  `no_code`, `error=access_denied` → `access_denied`, an unusable `code` →
  `exchange_failed`, an unrecognised provider error → `no_code` → **AC-5**
- [x] The GitHub action's authorize URL carries `scopes=user%3Aemail` →
  **AC-1**
- [x] GoTrue accepts `http://localhost:3000/auth/callback` on the return leg
  rather than falling through to Site URL, which is what the corrected
  `additional_redirect_urls` buys → **AC-18**
- [x] The hook is **not** callable by `anon`, `authenticated`, `service_role` or
  `public`, only by `supabase_auth_admin`. Asserted in the integration suite
  rather than assumed from the migration → **AC-9**
- [x] `/` still prerenders as **static** in the build route table, and
  `global-error.tsx` is the only file in `src/app`, `src/features` or
  `src/components` carrying the client directive → **AC-2**, **AC-16**
- [x] Sign out actually clears the session, proved by reading the jar back
  through a second client rather than by observing the redirect → **AC-11**

### One correction the engineer caught in review

- [x] `test/helpers/database.ts` originally read `DEV_SESSION_ENABLED` as its
  guard, which would have made **AC-13**'s wording false: that variable is
  supposed to have exactly one remaining job, guarding the mint in `admin.ts`,
  and `src/env.ts`'s comment says so too. It now has its own
  `TEST_DIRECT_DB_ENABLED`, so the two privileged paths fail independently and
  switching the mint on does not switch on a superuser connection as a side
  effect → **AC-13**

### Mutation checks run on this build's own tests

Each was made to fail on purpose, then restored, because a test that has never
failed proves nothing:

- [x] Making the hook fail open on its internal error → the three **AC-10**
  tests fail
- [x] Rewording the hook's refusal message → the marker coupling test fails
- [x] Making sign out redirect without clearing the session → the one **AC-11**
  assertion that matters fails
- [x] Letting `DEV_SESSION_ENABLED` switch the direct database connection back
  on → the **AC-13** guard test fails, along with the absent flag case

### Still open after this build

- [ ] Most of the `## UI / manual` section above. It needs a deploy and real
  Google and GitHub accounts, and this feature is explicitly not the one that
  brings a browser runner. **Partly closed 2026-08-30**: the engineer signed in
  on the branch preview with both providers and reached one linked account
  rather than two, which is **AC-8** and also settles P5's wildcard, unproven
  until the first preview sign in. **AC-15 is the notable one still open**,
  because it needs a SECOND real account, not one identity across two providers
- [x] ~~`COPY-2` is still unwritten~~ · **written by the engineer and wired
  2026-08-30**, once P10's answer showed the refusal does reach the page, so the
  escape hatch wording held in reserve for a "no" was not needed. `This email
  already has an account with the other sign in option. Try that one below.` Two
  tests carry the constraints it creates: it says "below", so it depends on the
  error line rendering above both forms, and it names no provider, which is what
  AC-7's enum having no provider dimension requires → **AC-5**
- [x] ~~The hook's **enablement** on `jobhunt-dev` and `jobhunt-prod`~~ ·
  **both enabled 2026-08-30**, `jobhunt-dev` before the merge and `jobhunt-prod`
  straight after it. The migration ships the function and the switch is dashboard
  state no file here records, so this row stays as the record that both were
  flipped, and it is the first thing to re read if a signup ever fails on one
  project and not the other → **AC-9**, **AC-19**
- [x] ~~`DEV_SESSION_ENABLED` removed from the Vercel Preview scope~~ ·
  **removed 2026-08-30**. Nothing deployed reads it now; CI sets it on its own
  test jobs and a developer sets it locally → **AC-13**
- [ ] Spec 0002's two steps that this feature unblocks: the `currentOrigin()`
  resolver step, stranded since 2026-08-22 on code that had never run outside a
  build, and the direct exercise of a deployed Server Action against production
