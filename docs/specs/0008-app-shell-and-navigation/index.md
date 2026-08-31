# 0008. App shell and navigation

**Date**: 2026-08-31
**Status**: Proposed

## Summary

The signed in app gets the smallest shell that can hold it: three routes, a thin header with no mobile menu, and one shared rule for where a visitor lands after sign in. The landing rule is one function, the door that removes the sign in invitation from `/` is one small route handler, and the deep link a visitor followed while signed out survives sign in and returns them to it. No database change is involved; the only new persistence is one short lived cookie written by the proxy.

## Requirements

**User stories**:

- As a signed in user, I want a header that tells me where I can go, so that I never have to guess the app's routes.
- As a signed out visitor, I want a deep link I followed to survive sign in, so that I end up on the page I asked for and not somewhere generic.
- As a signed in visitor, I want `/` to stop inviting me to sign in, so that the marketing page stops treating me as a stranger.
- As a first time user, I want to land on my profile when it is still empty, so that the first thing I see asks for what the product needs from me.

**Acceptance criteria** (the contract, each criterion is independently checkable):

- **AC-1**: The routes `/search`, `/profile` and `/applications` exist as real routes under the `(app)` route group, each rendering the shell, and only `/search` and `/profile` appear in the signed in navigation.
- **AC-2**: Each placeholder page renders an ordinary expected state, not a failure: one honest sentence saying what will live there, with no `role="alert"`, no red border treatment, and no "coming soon" phrasing (that phrase was deliberately deleted from the sign in band by spec 0007 **AC-16** and must not return).
- **AC-3**: One header component lives in `src/components/ui/`. The `(app)` layout renders its signed in variant, carrying logo, Search, Profile and Sign out. The marketing layout renders its signed out variant. The variant is chosen by the route group, never by a prop at each call site.
- **AC-4**: The signed in shell renders no hamburger, no drawer and no tab bar at any width, and shows no horizontal overflow at 320 pixels.
- **AC-5**: A user with no profile row lands on `/profile` after sign in, and a user with a profile row lands on `/search`. The decision lives in exactly one shared function, called by the callback route handler, the door route, and the `/sign-in` bounce. The callback no longer redirects to the literal `/health`.
- **AC-6**: A deep link followed while signed out survives sign in and returns the visitor to it, and a deep link beats the profile gap rule when both could apply.
- **AC-7**: The return path validator accepts only a safe single leading slash path. It rejects a protocol relative `//`, a backslash, a scheme, and control characters. It rejects `/sign-in` and `/auth/callback` as return targets. It keeps the query string and drops the fragment. A rejected value falls back to the landing rule. The validator is a Zod schema parsed at the boundary, with a unit test naming each hostile string.
- **AC-8**: The requested path is recorded by the proxy for `(app)` paths unconditionally, with no branch on the session state, in a cookie that is `httpOnly`, `SameSite=Lax`, short lived, and scoped to the callback path. The proxy still decides nothing about authorisation.
- **AC-9**: The deep link cookie is consumed and cleared on every path through the callback, including when validation fails, so a stale value cannot fire at a later sign in.
- **AC-10**: A door route (a GET route handler placed outside `src/app/api/`, the same carve out `/auth/callback` uses) sends a signed in visitor to the landing rule and a signed out visitor to `/sign-in`. Its CTA on `/` does not prefetch, so hovering it fires no session read.
- **AC-11**: `/` no longer shows a sign in invitation to anyone. The sign in band's one click provider forms leave `/` and live only on `/sign-in`, and `/` remains a static page that reads no session, no Supabase client, and no user data, holding spec 0006's accepted security model intact.
- **AC-12**: A signed in visitor at `/sign-in` is bounced to the landing rule instead of seeing the provider buttons again.
- **AC-13**: Header sign out uses the existing Server Action in `src/features/auth/actions.ts` and returns the visitor to `/`.
- **AC-14**: Signed in routes stay unindexed by inheritance from the root layout, and the spec records that as chosen rather than inherited. The door route carries its own no index metadata.
- **AC-15**: The door route and the `/sign-in` bounce open named spans, registered in `docs/observability/spans.md` per the observability rule.

## Decision

**Chosen option**: Option 1, the thin shell with a neutral door. Three routes under `(app)`, one header component in `src/components/ui/` varied by route group, no mobile navigation machinery, one shared landing rule, the return path carried by a proxy written cookie, and a small door route handler that lets `/` stay static while never inviting a signed in visitor to sign in.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, span conventions behind AC-15) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, App Router layout and navigation patterns)

## Feature design

**Data model sketch**: none. No entity, column, migration or row level security change. The feature's only persistence is one cookie holding a path string. Profile row existence is read from the existing `public.profile` table created by spec 0003.

**State transitions** (the signed out return flow):

```
signed out visitor hits a protected route
  -> proxy records the requested path in the return cookie (unconditional, no session branch)
  -> (app) layout session check fails, visitor is sent to /sign-in
  -> visitor signs in with a provider, return path stays out of redirectTo (spec 0007 safeguard 3)
  -> callback route handler: session exchanged, cookie read, validated, cleared
  -> redirect to the deep link (AC-6), or to the landing rule when absent or invalid (AC-5)
```

**API surface**:

| Route | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/go` | GET | none | 307 redirect | reads session | invalid cookie falls back to landing rule |
| `/auth/callback` | GET | existing code and state params | 303 redirect | public (provider return) | invalid return path falls back to landing rule |
| `/sign-in` | GET | none | signed in: bounce to landing rule; signed out: page | reads session | none new |
| `/search`, `/profile`, `/applications` | GET | none | placeholder page under the shell | `(app)` layout session check | redirect to `/sign-in` when signed out |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Landing rule | the target route (`/profile` or `/search`) | profile row existence, read from `public.profile` via the server client (spec 0003's table) |
| Deep link return | the target path and query | the proxy written return cookie (AC-8) |
| Signed in or not | the session state | the existing Supabase SSR server client in `src/lib/supabase/` |
| Door CTA destination | the constant `/go` | decided in this spec (AC-10) |
| Signed in nav labels | Search, Profile | decided in this spec, confirmed by the mock up findings |
| Placeholder copy | one honest sentence per route | decided in this spec (AC-2) |
| Landing decision in one place | the shared function's identity | decided in this spec (AC-5) |

**Key invariants**:

- `/` never reads the session, never mounts a Supabase client, and stays statically prerendered.
- The proxy writes the return cookie without ever branching on the session state, so binding rule 6's substance (it decides no authorisation) holds; only its wording widens (see Consequences).
- Exactly one function decides where a signed in visitor lands. No caller may inline its own copy of the rule.
- The return cookie carries a path and nothing else. No user identifier, no email, no token.
- `redirectTo` toward a provider never carries the return path, so spec 0007's safeguard 3 stands unchanged.
- The landing rule reads only profile row existence, never profile sufficiency. Feature 14's scoring gate layers on top of this rule later and replaces nothing here.

**Security model**:

- The door route and the callback sit outside `src/app/api/`, the carve out binding rule 6 already grants `/auth/callback`. Both may read the session and (for the landing rule) profile row existence. Neither writes user data.
- The return path is untrusted input and is parsed at the boundary by the Zod validator (AC-7), the same parse at every boundary rule every other external input follows. The validator exists to stop an open redirect: the hostile strings in its unit test are the threat model made concrete.
- The cookie is `httpOnly` (unreadable from any client script), `SameSite=Lax` (Strict is not sent on the return from a provider and would silently disable the whole feature), short max age, and path scoped to the callback so it is not carried on ordinary navigation.
- Nothing in this feature widens who may read or write data. Row level security from spec 0003 remains the real guarantee.

**Configuration required**: none. No new environment variable, secret or third party credential. The cookie name is a source constant.

**Critical test scenarios**:

- Happy path: a signed out visitor deep links to `/search?q=react`, signs in with a provider, and lands on `/search?q=react`; a second user with a profile row and no deep link lands on `/search`, a third with no profile row lands on `/profile`, verifies **AC-5**, **AC-6**, **AC-8**
- Failure case: the return cookie holds `//evil.com`, `/\evil.com`, a path with an embedded tab, and `/auth/callback`; every one falls back to the landing rule and the cookie is cleared, verifies **AC-7**, **AC-9**
- Auth or permission: a signed out visitor at `/search` is bounced to `/sign-in` and never sees placeholder content; a signed in visitor at `/sign-in` is bounced to the landing rule and never sees provider buttons, verifies **AC-1**, **AC-12**
- Static contract: `/` still prerenders with zero client JavaScript and no session read, with the door CTA in place, verifies **AC-11**, **AC-10**

## Build plan

The build approach is the project default, Tracer Bullet: stand up the thinnest real thread through every layer first, then thicken. Here the thread is the return loop itself, the deep link in, the bounce out, the cookie, the validator, the landing rule, the callback redirect. It touches the proxy, a route handler, a shared function and the validator at once, which is exactly what makes it real rather than a stub. The header and the placeholder routes thicken the shell after the thread works.

1. The return path validator: a Zod schema with the strict rules of AC-7, and unit tests naming each hostile string (`//evil.com`, `/\evil.com`, a scheme, an embedded control character, `/sign-in`, `/auth/callback`, and the accept cases keeping the query and dropping the fragment), satisfies **AC-7**
2. The shared landing rule function: reads profile row existence, applies the profile gap then the `/search` default, opens its named span, satisfies **AC-5**, **AC-15**
3. The proxy records the requested path for `(app)` paths unconditionally, writing the return cookie with the flags of AC-8, and the binding rule 6 comment is widened to name the new job, satisfies **AC-8**
4. The callback consumes, validates, and clears the cookie on every path, then redirects to the deep link or the landing rule, removing the literal `/health` redirect, satisfies **AC-5**, **AC-6**, **AC-9**
5. The door: a GET route handler at `/go` outside `src/app/api/`, plus the `/` sign in band swap that replaces the provider forms with the door CTA (a plain anchor, no prefetch), keeping `/` static, satisfies **AC-10**, **AC-11**
6. The `/sign-in` bounce for a signed in visitor, calling the same landing rule, satisfies **AC-12**
7. The header promoted into `src/components/ui/` with two variants, the `(app)` layout rendering the signed in one, the marketing layout rendering the signed out one, EntryHeader folded in, sign out wired to the existing action returning to `/`, satisfies **AC-3**, **AC-13**, **AC-4**
8. The three routes under `(app)` with their honest placeholder states, and the nav rendering only Search and Profile, satisfies **AC-1**, **AC-2**
9. Metadata: the deliberate no index line for signed in routes and the door's own no index, satisfies **AC-14**
10. Spans for the door and the bounce registered in `docs/observability/spans.md`, satisfies **AC-15**

## Consequences

**Positive**:

- Features 9, 11 and 12 each inherit a decided shell instead of inventing one. Their specs start from routes that exist.
- One landing rule means one place to reason about where a visitor ends up, and one place for feature 14's gate to layer onto.
- `/` keeps its accepted contract: static, session free, and now honest for signed in visitors too.
- The signed in user's path through the app is three routes and two links. Nothing to redesign when features 20 and 23 land; they extend the inventory rather than restructure it.

**Negative / tradeoffs**:

- A signed out visitor loses the one click provider buttons on `/` and takes one extra hop through `/sign-in`. Accepted deliberately: the alternative was a session read on a page whose whole value is that it reads nothing.
- The proxy takes on a second job (recording the requested path). Binding rule 6's wording must widen; its substance, deciding no authorisation, does not. The spec's invariant names the line.
- The scope row for feature 32 says "everyone else on `/`". This spec deliberately amends that to `/search`, because that wording predates the settled decision that `/` is the static marketing page. Landing a signed in user on the marketing page is the same bug AC-11 removes. `/develop` records the amendment against the scope row.
- Existing entry page tests covering the sign in band's provider forms will change with AC-11.

**Neutral**:

- The return cookie is one more stateful artifact in a stateless render path; its lifecycle (written by the proxy, consumed and cleared by the callback) is fully specified here so no later reader has to rederive it.
- Tap targets in the header keep the sizes the design system already locks. The mock up measured 32px and 28px, above the WCAG 2.2 AA 24px floor (SC 2.5.8) and below the 44px AAA comfort tier this project has not committed to.

## Follow-up

- [ ] Update scope feature 32's done when wording from "everyone else on `/`" to the landing rule of AC-5, when the feature ships (`/develop` records it against the row).
- [ ] Mark the entry page invitation item in `docs/app-shell-direction.md` ("Still open, deliberately") as resolved by this spec, pointing at AC-11 and AC-10.
- [ ] Feature 14 layers its scoring gate onto the landing rule's caller rather than replacing the rule; name that layering in feature 14's spec when it is designed.
- [ ] The Adzuna attribution asset flagged in the mock up findings belongs to feature 11, not here; do not let it drift into this build.

Reasoning and options: see [rationale.md](rationale.md).
