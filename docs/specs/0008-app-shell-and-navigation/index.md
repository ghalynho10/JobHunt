# 0008. App shell and navigation

**Date**: 2026-08-31
**Status**: Proposed

**Revision 2, 2026-08-31.** The return path mechanism changed after the cross model review in [docs/reviews/2026-08-31-spec-0008-app-shell-and-navigation.md](../../reviews/2026-08-31-spec-0008-app-shell-and-navigation.md). Revision 1 had the proxy write the return cookie. It now echoes the requested path as a request header and writes nothing, and the provider Server Action writes the cookie. The acceptance criteria are renumbered, so an AC number cited in that review refers to revision 1.

## Summary

The signed in app gets the smallest shell that can hold it: three routes, a thin header with no mobile menu, and one shared rule for where a visitor lands after sign in. A deep link a visitor followed while signed out survives sign in and returns them to it, carried by a request header the proxy echoes on every request, then a query parameter, then a short lived cookie written by the Server Action that already sends the visitor to the provider. The door that removes the sign in invitation from `/` is one small route handler. No database change is involved.

## Requirements

**User stories**:

- As a signed in user, I want a header that tells me where I can go, so that I never have to guess the app's routes.
- As a signed out visitor, I want a deep link I followed to survive sign in, so that I end up on the page I asked for and not somewhere generic.
- As a signed in visitor, I want `/` to stop inviting me to sign in, so that the marketing page stops treating me as a stranger.
- As a first time user, I want to land on my profile when it is still empty, so that the first thing I see asks for what the product needs from me.

**Acceptance criteria** (the contract, each criterion is independently checkable):

### The shell

- **AC-1**: The routes `/search`, `/profile` and `/applications` exist as real routes under the `(app)` route group, each rendering the shell. Only `/search` and `/profile` appear in the signed in navigation. `/applications` is reachable from a link on `/profile` (`COPY-6`), per the settled decision in `docs/app-shell-direction.md` lines 87 to 89, so no route ships reachable only by typing its URL.
- **AC-2**: Each placeholder page renders an ordinary expected state, not a failure: the sentence from its copy slot (`COPY-1` to `COPY-3`), with no `role="alert"`, no red border treatment, and no "coming soon" phrasing (that phrase was deliberately deleted from the sign in band by spec 0007 **AC-16** and must not return).
- **AC-3**: A header primitive lives in `src/components/ui/`. It is **chrome only**: lockup, navigation slot, action slot, layout. It imports nothing from `src/features/`, so the design system gains no feature dependency and spec 0005's charter for that directory holds. The signed in variant is composed in the `(app)` layout and the signed out variant in the marketing layout, each passing its own children into the slots. The sign out form lives outside `src/components/ui/`.
- **AC-4**: The signed in shell renders no hamburger, no drawer and no tab bar at any width, and shows no horizontal overflow at 320 pixels. The overflow half is the checkable half; the absence half is a code review check, recorded here as intent.
- **AC-5**: A signed in visitor reaching `/search`, `/profile` or `/applications` sees the signed in header on every one of them, and a signed out visitor reaching `/` or `/sign-in` sees the signed out header on both.

### The landing rule

- **AC-6**: A user with no profile row lands on `/profile` after sign in, and a user with a profile row lands on `/search`. The callback no longer redirects to the literal `/health`. Observably: two accounts, one with a profile row and one without, signing in from the same starting point, arrive at different routes.
- **AC-7**: The landing rule reads profile row existence through a dedicated existence read that returns a boolean and **constructs no `failure()`**. It does not reuse `readOwnProfile()` in `src/features/profile/queries.ts:162-166`, whose `record_not_found` path reports to Sentry and marks the `profile.read` span failed. A first time sign in is the expected case, not a failure, and must not move the failure ratio feature 9 will alert on.

### The return path

- **AC-8**: The proxy sets a request header carrying the requested pathname and query on **every** request its matcher already covers, unconditionally. It reads no session, holds no list of routes, and cannot distinguish a protected path from a public one. It uses `NextResponse.next({ request: { headers } })`, never `NextResponse.next({ headers })`, so the value travels upstream only and is never exposed to the client (`proxy.md` lines 431 to 434). It **overwrites** any header of that name arriving on the request, so a client supplied value cannot be trusted forward. The value is truncated to the length cap of AC-12 before being set, per `proxy.md` line 438 on oversized headers.
- **AC-9**: The two existing assertions in `src/proxy.test.ts` pass **unmodified**: that the proxy treats a protected route exactly as it treats a public one (lines 49 to 62), and that it sets no cookies (lines 64 to 70). This criterion exists because it is the mechanical guard on binding rule 6, and revision 1 of this spec broke both.
- **AC-10**: The request header survives a session refresh. When Supabase's `setAll` callback rebuilds the response, the rebuilt response carries the same request headers as the first one. A unit test drives the proxy through a refresh that writes session cookies and asserts the pathname header is still present, because losing it silently degrades every deep link and would otherwise pass a happy path test.
- **AC-11**: The `(app)` layout, at the moment it redirects an unauthenticated visitor, reads the header through `headers()` and appends the value as a `next` query parameter on `/sign-in`, percent encoded so a nested query string survives intact. When the header is absent it redirects to a bare `/sign-in` and nothing fails.
- **AC-12**: One Zod schema validates the return path, and it is parsed at all three boundaries it crosses: the `next` query parameter on `/sign-in`, the hidden form field reaching the Server Action, and the cookie read by the callback. It accepts only a safe single leading slash path. It rejects a protocol relative `//`, a backslash, a scheme, control characters, and any value over a named length cap. It rejects `/sign-in`, `/auth/callback` and `/go` as return targets, because each would loop. It keeps the query string and drops the fragment. A rejected value falls back to the landing rule. A unit test names each hostile string, including one that is harmless before percent decoding and hostile after.
- **AC-13**: `/sign-in` parses `next` at its boundary and renders the accepted value into a hidden field inside each provider form. A rejected value is dropped and never echoed onto the page.
- **AC-14**: Each provider Server Action reads the hidden field, validates it again, and writes the return cookie **before** redirecting to the provider. The cookie is `httpOnly`, `SameSite=Lax`, `Path` scoped to `/auth/callback`, with a max age of 10 minutes, and its value is percent encoded on write and decoded before validation on read. `redirectTo` is unchanged and still carries nothing but `currentOrigin()` and the callback path, so spec 0007's safeguard 3 stands.
- **AC-15**: The callback consumes, validates and clears the cookie on **every** path through it, including when validation fails and when the provider returned an error, so a stale value cannot fire at a later sign in. The clear repeats the same `Path` the cookie was written with, or it silently fails to match and the value survives.
- **AC-16**: Observable end to end: a signed out visitor follows `/search?q=react`, signs in with a provider, and arrives at `/search?q=react`. The same visitor with a hostile value in place of the path arrives at the landing rule instead, with the cookie cleared. A deep link beats the profile gap rule when both could apply.

### The door and the entry page

- **AC-17**: A door route at `/go` (a GET route handler placed outside `src/app/api/`, the same placement `/auth/callback` uses) sends a signed in visitor to the landing rule and a signed out visitor to `/sign-in`. Its responses carry `Cache-Control: no-store`, because the destination differs per user and a cached redirect would send one visitor to another visitor's landing target. They also carry `X-Robots-Tag: noindex`.
- **AC-18**: `/` renders **zero** `<form>` elements and shows no sign in invitation anywhere on the page. `SignInControls` is rendered twice today, in `src/features/entry-page/hero-section.tsx:216` and `src/features/entry-page/sign-in-band.tsx:56`, and both are replaced by the door CTA (`COPY-4`), a plain anchor that does not prefetch. The signed out header's control changes from a `#start` jump to the door (`COPY-5`), because the band it jumped to no longer signs anyone in.
- **AC-19**: `/` remains a static page that reads no session, mounts no Supabase client, and reads no user data, holding spec 0006's accepted security model and its AC-4 intact.
- **AC-20**: A signed in visitor at `/sign-in` is bounced to the landing rule instead of seeing the provider buttons again. The bounce **does not fire when an `error` parameter is present**, because `signInErrorPath(code)` sends a failed callback to `/sign-in?error=...` and bouncing would discard the message the person needs to see.

### Housekeeping

- **AC-21**: Header sign out uses the existing Server Action in `src/features/auth/actions.ts` and returns the visitor to `/`.
- **AC-22**: `/health` survives unchanged as an internal diagnostic. It stays under `(app)`, so it inherits the shell, and AC-2's ban on failure treatment does not extend to it, because showing a failure is its entire job. It is not in the navigation and AC-1's route list is not exhaustive of the group.
- **AC-23**: Signed in routes stay unindexed by inheritance from the root layout, which already sets `robots: { index: false, follow: false }` at `src/app/layout.tsx:60`. A comment in the `(app)` layout records that as chosen rather than accidental, so the decision has an artifact in the build rather than only in this spec.
- **AC-24**: The door route, the `/sign-in` bounce and the landing rule each open a named span as their first statement, and all three are registered in `docs/observability/spans.md` per the observability rule. The bounce's span opens around the bounce decision, not around every render of `/sign-in`, so its failure ratio has a denominator that means something.

## Decision

**Chosen option**: Option 1, the thin shell with a neutral door, built on the **request header variant** of the return path (sub decision below). Three routes under `(app)`, a chrome only header primitive in `src/components/ui/` composed per route group, no mobile navigation machinery, one shared landing rule, the return path carried as a request header then a query parameter then a cookie written by the Server Action, and a small door route handler that lets `/` stay static while never inviting a signed in visitor to sign in.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, span conventions behind AC-24) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, App Router layout and navigation patterns)

## Feature design

**Data model sketch**: none. No entity, column, migration or row level security change. The feature's only persistence is one cookie holding a path string. Profile row existence is read from the existing `public.profile` table created by spec 0003.

**State transitions** (the signed out return flow):

```
signed out visitor hits /search?q=react
  -> proxy sets x-jobhunt-pathname on the request, unconditionally,
     for this and for every other request, writing no cookie and
     reading no session
  -> (app) layout session check fails; it reads the header and
     redirects to /sign-in?next=%2Fsearch%3Fq%3Dreact
  -> /sign-in parses next at its boundary, renders the accepted value
     into a hidden field in both provider forms
  -> visitor submits a provider form; the Server Action validates the
     field again, writes the return cookie, and redirects to the
     provider. redirectTo stays clean (spec 0007 safeguard 3)
  -> callback: session exchanged, cookie read, decoded, validated, cleared
  -> redirect to /search?q=react (AC-16), or to the landing rule when
     the value is absent or invalid (AC-6)
```

**API surface**:

| Route | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/go` | GET | none | 307 redirect, `no-store` | reads session | none new |
| `/auth/callback` | GET | existing code and state params, return cookie | 303 redirect | public (provider return) | invalid return path falls back to landing rule |
| `/sign-in` | GET | `error`, `next` | signed in and no error: bounce to landing rule; otherwise the page | reads session | invalid `next` dropped silently, by design |
| `/search`, `/profile`, `/applications` | GET | none | placeholder page under the shell | `(app)` layout session check | redirect to `/sign-in?next=...` when signed out |
| `/health` | GET | none | the existing diagnostic, now under the shell | `(app)` layout session check | unchanged |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Landing rule | the target route (`/profile` or `/search`) | profile row existence, through the dedicated existence read of AC-7 |
| Deep link return | the target path and query | the proxy set request header, then the `next` parameter, then the cookie |
| Signed in or not | the session state | the existing Supabase SSR server client in `src/lib/supabase/` |
| Door CTA destination | the constant `/go` | decided in this spec (AC-17) |
| Signed in nav labels | Search, Profile | decided in this spec, confirmed by the mock up findings |
| Placeholder copy, CTA labels | the six slots below | written by the engineer, used verbatim |
| Landing decision in one place | the shared function's identity | decided in this spec (AC-6) |

**Key invariants**:

- `/` never reads the session, never mounts a Supabase client, and stays statically prerendered.
- The proxy writes no cookie and holds no route knowledge. It cannot tell a protected path from a public one, which is what `src/proxy.test.ts` lines 49 to 70 assert and AC-9 keeps true.
- The pathname header is set, never appended, so a value a client sent is always overwritten before anything reads it.
- Exactly one function decides where a signed in visitor lands. No caller may inline its own copy of the rule.
- The return value carries a path and nothing else. No user identifier, no email, no token.
- `redirectTo` toward a provider never carries the return path, so spec 0007's safeguard 3 stands unchanged.
- The landing rule reads only profile row existence, never profile sufficiency. Feature 14's scoring gate layers on top of this rule's callers later and replaces nothing here.
- `src/components/ui/` gains no dependency on `src/features/`.

**Security model**:

- The door route and the callback sit outside `src/app/api/`. Binding rule 6 restricts handlers **under** `src/app/api/` and is silent about handlers elsewhere, so this is placement that respects the rule rather than a carve out the rule grants. Both may read the session, and the landing rule reads profile row existence. These are the first route handlers in this project to read a user data table, which is a deliberate extension: each checks its own caller independently, and row level security from spec 0003 remains the guarantee behind the read.
- **The return path's threat surface changed with the mechanism.** It is now user visible and user supplied: anyone can send a victim `/sign-in?next=<anything>`. The validator is therefore doing more work than it was, and it runs at all three boundaries the value crosses (AC-12), following the parse at every boundary rule rather than trusting an earlier parse. Its job is to stop an open redirect; the hostile strings in its unit test are the threat model made concrete.
- The cookie is `httpOnly` (unreadable from any client script), `SameSite=Lax` (`Strict` is not sent on the cross site top level GET return from a provider and would silently disable the whole feature), 10 minute max age, and `Path` scoped to the callback so it is not carried on ordinary navigation.
- `/go` returns a different destination per visitor, so `Cache-Control: no-store` is a security requirement rather than a performance note (AC-17).
- Nothing in this feature widens who may read or write data.

**Configuration required**: none. No new environment variable, secret or third party credential. The header name and cookie name are source constants.

## Copy

Six slots, used verbatim, no em dash, no en dash, no semicolon, matching the convention specs 0006 and 0007 set. **These are drafts, awaiting the engineer's words. `/develop` must not invent or reword them; if a slot is still marked DRAFT when the build starts, stop and ask.**

| Slot | Where | Draft |
|---|---|---|
| `COPY-1` | `/search` placeholder | DRAFT: "Search comes next. This is where real listings will appear, ranked, with the reasoning shown." |
| `COPY-2` | `/profile` placeholder | DRAFT: "Your profile lives here. Once you fill it in, search has something to rank against." |
| `COPY-3` | `/applications` placeholder | DRAFT: "Every job you apply to will be recorded here, so you can see what you sent and when." |
| `COPY-4` | the door CTA on `/` | DRAFT: "Open JobHunt" |
| `COPY-5` | the signed out header control | DRAFT: "Open JobHunt" |
| `COPY-6` | the `/profile` link to `/applications` | DRAFT: "Tracked applications" (the mock up's wording, per `docs/design/app-shell-mockup-findings.md:16-17`) |

`COPY-4` and `COPY-5` must not read as a sign in invitation, which is the whole point of AC-18. That constraint is load bearing, not stylistic.

**Critical test scenarios**:

- Happy path: a signed out visitor deep links to `/search?q=react`, signs in, and lands on `/search?q=react`; a second user with a profile row and no deep link lands on `/search`; a third with no profile row lands on `/profile`, verifies **AC-6**, **AC-16**
- Failure case: the return value is `//evil.com`, `/\evil.com`, a scheme, an embedded tab, a value over the length cap, `/auth/callback`, and a percent encoded value that decodes to `//evil.com`; every one falls back to the landing rule and the cookie is cleared, verifies **AC-12**, **AC-15**
- Silent degradation: the proxy runs through a session refresh that writes cookies, and the pathname header is still present on the returned response, verifies **AC-10**
- Binding rule guard: `src/proxy.test.ts` passes with no edits to its two existing assertions, verifies **AC-9**
- Auth or permission: a signed out visitor at `/search` is bounced and never sees placeholder content; a signed in visitor at `/sign-in` is bounced, but a signed in visitor at `/sign-in?error=account_exists` sees the message, verifies **AC-20**
- Static contract: `/` still prerenders with zero client JavaScript, no session read, and zero `<form>` elements, verifies **AC-18**, **AC-19**

## Build plan

The build approach is the project default, Tracer Bullet: stand up the thinnest real thread through every layer first, then thicken. Here the thread is the return loop, and it touches the proxy, a layout, a page, a Server Action, a route handler and the validator at once, which is what makes it real rather than a stub. The header and the placeholder routes thicken the shell after the thread works.

1. **Prove the cookie survives the off-site redirect first.** Write the cookie in one provider Server Action, redirect to the provider, and confirm the browser holds it on return. This is the one mechanic in this spec marked inferred rather than verified (see Consequences), and the whole mechanism rests on it. If it does not hold, stop and take the recorded fallback rather than working around it.
2. The return path validator: one Zod schema with the rules of AC-12, and unit tests naming each hostile string, satisfies **AC-12**
3. The proxy sets the pathname header, unconditionally, using the `{ request: { headers } }` form, with the header hoisted so `setAll`'s rebuild carries it, and the binding rule 6 comment widened to name the new job, satisfies **AC-8**, **AC-10**, and keeps **AC-9** true
4. The shared landing rule and its dedicated existence read, opening its named span, satisfies **AC-6**, **AC-7**
5. The `(app)` layout appends `?next=` on its redirect, satisfies **AC-11**
6. `/sign-in` parses `next` and renders the hidden field; the Server Actions validate and write the cookie, satisfies **AC-13**, **AC-14**
7. The callback consumes, validates and clears on every path, then redirects to the deep link or the landing rule, removing the literal `/health` redirect, satisfies **AC-15**, **AC-16**
8. The door at `/go` with its `no-store` and `noindex` headers, plus the `/` swap replacing both `SignInControls` renders and the header control with the door CTA, satisfies **AC-17**, **AC-18**, **AC-19**
9. The `/sign-in` bounce, with the error parameter exception, satisfies **AC-20**
10. The chrome only header primitive in `src/components/ui/`, the marketing layout created to compose the signed out variant, the `(app)` layout composing the signed in one, `EntryHeader` folded in, sign out wired to the existing action, satisfies **AC-3**, **AC-5**, **AC-21**, **AC-4**
11. The three routes under `(app)` with their copy slots, the nav rendering only Search and Profile, and the `/profile` link to `/applications`, satisfies **AC-1**, **AC-2**
12. The `(app)` layout's no index comment and `/health`'s disposition note, satisfies **AC-22**, **AC-23**
13. Spans for the door, the bounce and the landing rule, registered in `docs/observability/spans.md`, satisfies **AC-24**

## Consequences

**Positive**:

- Features 9, 11 and 12 each inherit a decided shell instead of inventing one. Their specs start from routes that exist.
- One landing rule means one place to reason about where a visitor ends up, and one place for feature 14's gate to layer onto.
- `/` keeps its accepted contract: static, session free, and now honest for signed in visitors too.
- Binding rule 6's mechanical guard survives intact. The proxy still cannot tell a protected route from a public one, and still writes no cookie, which is what the rule is actually protecting.
- The signed in user's path through the app is three routes and two links. Nothing to redesign when features 20 and 23 land.

**Negative / tradeoffs**:

- A signed out visitor loses the one click provider buttons on `/` and takes one extra hop through `/sign-in`. Accepted deliberately: the alternative was a session read on a page whose whole value is that it reads nothing.
- The return path is visible in a query parameter between the layout and `/sign-in`, where revision 1's cookie kept it opaque. This is the real cost of the variant, and it is why AC-12 parses at all three boundaries rather than trusting the first.
- The proxy takes on a second job (echoing the requested path as a header). Binding rule 6's wording must widen, and spec 0001 needs a dated amendment for it (see Follow-up). Its substance and both its tests survive unchanged, which is the difference from revision 1.
- The mechanism touches three components instead of two.
- **One mechanic is inferred, not verified**: that a `Set-Cookie` written in a Server Action survives that action's `redirect()` to an external URL. The docs confirm a Server Function may set cookies (`cookies.md` lines 6 and 74) and the existing action already redirects off-site, but the combination is not documented. Build step 1 proves it before anything is built on it. **Recorded fallback if it does not hold**: the provider forms POST to a route handler that writes the cookie and then redirects to the provider URL. Route handlers may unambiguously do both, and a form posting to a handler keeps the no JavaScript property the provider controls have today.
- Creating the marketing layout, which does not exist today, puts a header on `/sign-in` and `/ui-preview` for the first time. `EntryHeader`'s in page anchors (`#how-it-works`, `#reasoning`, `#about`, `#start`) must not travel with it, or those pages ship dead links, which the entry page's own AGENTS.md forbids. It also changes `src/app/(marketing)/page.test.ts` at lines 186 to 190 and 256 to 265.
- Existing entry page tests covering the sign in band's provider forms change with AC-18, including the four form assertion at `page.test.ts:245-254`, which becomes zero.

**Neutral**:

- The return cookie is one more stateful artifact in a stateless render path; its lifecycle is fully specified here so no later reader has to rederive it.
- Tap targets in the header keep the sizes the design system already locks. The mock up measured 32px and 28px, above the WCAG 2.2 AA 24px floor (SC 2.5.8) and below the 44px AAA comfort tier this project has not committed to.
- Prefetch no longer pollutes the return path. In revision 1 the proxy recorded every `(app)` request including prefetches; here the value is captured only at the moment the layout actually redirects, so a hovered nav link records nothing.

**Statements in Accepted specs that this feature falsifies**, each needing a dated supersession note, following the precedent spec 0007 set when it marked spec 0006's AC-7 superseded:

- **Spec 0001, binding rule 6**: "refreshes the Supabase session cookie and does nothing else". The closed enumeration widens to include echoing the requested path as a request header. The no authorisation half and both tests are untouched.
- **Spec 0007, AC-1**: signing in arrives at `/health`. Flagged provisional there; AC-6 replaces it.
- **Spec 0007, AC-16**: "the entry page's two provider controls are real submits". After AC-18 there are no provider controls on `/`. The real submits substance moves to `/sign-in` and still holds there.
- **Spec 0007, security model**: "`/` and `/sign-in` are public and read nothing". AC-20 makes `/sign-in` read the session and, through the landing rule, profile row existence. `/` is unchanged.
- **Spec 0006, AC-4**: the clause that the header's sign in jump link is present at every width. AC-18 replaces the jump with the door CTA. The zero client JavaScript and static prerender halves are untouched and AC-19 keeps them.

## Follow-up

- [ ] Write the dated amendment into spec 0001's binding rule 6, naming what the proxy may now do and what it still may not, and pointing at `src/proxy.test.ts` lines 49 to 70 as the guard that stays.
- [ ] Write the four supersession notes listed above into specs 0006 and 0007, dated, matching the format spec 0007 used for spec 0006's AC-7.
- [ ] Update scope feature 32's done when wording from "everyone else on `/`" to the landing rule of AC-6, when the feature ships (`/develop` records it against the row).
- [ ] Mark the entry page invitation item in `docs/app-shell-direction.md` ("Still open, deliberately") as resolved by this spec, pointing at AC-18 and AC-17.
- [ ] Feature 14 layers its scoring gate onto the landing rule's callers rather than replacing the rule; name that layering in feature 14's spec when it is designed.
- [ ] The Adzuna attribution asset flagged in the mock up findings belongs to feature 11, not here; do not let it drift into this build.

Reasoning and options: see [rationale.md](rationale.md).
