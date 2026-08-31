# 0008. App shell and navigation

**Date**: 2026-08-31
**Status**: Proposed

**Revision 2, 2026-08-31.** The return path mechanism changed after the cross model review in [docs/reviews/2026-08-31-spec-0008-app-shell-and-navigation.md](../../reviews/2026-08-31-spec-0008-app-shell-and-navigation.md). Revision 1 had the proxy write the return cookie. It now echoes the requested path as a request header and writes nothing, and the provider Server Action writes the cookie. The acceptance criteria are renumbered, so an AC number cited in that review refers to revision 1.

**Revision 3, 2026-08-31.** A second cold read of revision 2 (same review file, second round) confirmed the three severe findings resolved and raised nine more. Applied here: AC-7a (a genuine query error is still a failure, since AC-7's ban on `failure()` had over corrected against binding rule 5), AC-10 and AC-10a (the request headers must be re-derived before each `NextResponse.next()`, not hoisted, or the refreshed session cookie is lost instead of the pathname), AC-5a (the marketing navigation varies by page, so `/sign-in` ships no dead anchors), AC-14a (the deep link survives both error retry paths), and the AC-8 cap now omits rather than truncates. Criteria added as letter suffixes so revision 2's numbering still resolves.

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

- **AC-1**: The routes `/search`, `/profile` and `/applications` exist as real routes under the `(app)` route group, each rendering the shell. Only `/search` and `/profile` appear in the signed in navigation. `/applications` is reachable from a link on `/profile` (`COPY-6`), per the settled decision in `docs/app-shell-direction.md` lines 87 to 89, so no **product** route ships reachable only by typing its URL. The group also holds `/health` (AC-22), which is a diagnostic rather than a product route and is deliberately unlinked, so this list is not exhaustive of the group.
- **AC-2**: Each placeholder page renders an ordinary expected state, not a failure: the sentence from its copy slot (`COPY-1` to `COPY-3`), with no `role="alert"` and no red border treatment. It does not carry the literal phrase "coming soon", nor any phrasing that will become **false** once the feature lands, which is what spec 0007 **AC-16** actually deleted from the sign in band. A sentence that truthfully says a route is not built yet is fine and is what these three are.
- **AC-3**: A header primitive lives in `src/components/ui/`. It is **chrome only**: lockup, navigation slot, action slot, layout. It imports nothing from `src/features/`, so the design system gains no feature dependency and spec 0005's charter for that directory holds. The signed in variant is composed in the `(app)` layout and the signed out variant in the marketing layout, each passing its own children into the slots. The sign out form lives outside `src/components/ui/`.
- **AC-4**: The signed in shell renders no hamburger, no drawer and no tab bar at any width, and shows no horizontal overflow at 320 pixels. The overflow half is the checkable half; the absence half is a code review check, recorded here as intent.
- **AC-5**: A signed in visitor reaching `/search`, `/profile` or `/applications` sees the signed in header on every one of them, and a signed out visitor reaching `/` or `/sign-in` sees the signed out header on both.
- **AC-5a**: The marketing layout's navigation slot varies by page. `EntryHeader`'s in page anchors (`#how-it-works`, `#reasoning`, `#about`) render **only on `/`**, because no other marketing route has those sections and a link that cannot work is forbidden by `src/features/entry-page/AGENTS.md`. `/sign-in` and `/ui-preview` render the header with an empty navigation slot. Observably: no marketing page renders an anchor whose target is not on that page.

### The landing rule

- **AC-6**: A user with no profile row lands on `/profile` after sign in, and a user with a profile row lands on `/search`. The callback no longer redirects to the literal `/health`. Observably: two accounts, one with a profile row and one without, signing in from the same starting point, arrive at different routes.
- **AC-7**: The landing rule reads profile row existence through a dedicated existence read. **An absent row is not a failure**: it returns `false` and constructs no `failure()`. It does not reuse `readOwnProfile()` in `src/features/profile/queries.ts:162-166`, whose `record_not_found` path reports to Sentry and marks the `profile.read` span failed. A first time sign in is the expected case and must not move the failure ratio feature 9 will alert on.
- **AC-7a**: A genuine query error is still a failure. The read wraps its database call in `attempt()` per binding rule 5, so a driver throw reports and marks the span failed exactly as everywhere else. The absent row exemption in AC-7 is narrow and applies to that one case. **An error must not be collapsed into `false`**, which would land a visitor on `/profile` during a database outage as though their profile were merely empty, a default that reads like success. On an errored read the landing rule sends the visitor to `/search`, the destination that assumes nothing about their data, and the failure is already reported.

### The return path

- **AC-8**: The proxy sets a request header carrying the requested pathname and query on **every** request its matcher already covers, unconditionally. It reads no session, holds no list of routes, and cannot distinguish a protected path from a public one. It uses `NextResponse.next({ request: { headers } })`, never `NextResponse.next({ headers })`, so the value travels upstream only and is never exposed to the client (`proxy.md` lines 431 to 434). It **overwrites** any header of that name arriving on the request, so a client supplied value cannot be trusted forward. When the value exceeds the length cap the proxy **omits the header entirely rather than truncating it**, per `proxy.md` line 438 on oversized headers: a truncated path is a valid looking wrong destination that AC-12 would accept, so the visitor would land somewhere plausible and incorrect with nothing reporting it. Omitting it falls through to the landing rule, which is the honest outcome. The cap is a shared constant, defined beside the AC-12 validator and imported by the proxy, so one number governs both.
- **AC-9**: The two existing assertions in `src/proxy.test.ts` pass **unmodified**: that the proxy treats a protected route exactly as it treats a public one (lines 49 to 62), and that it sets no cookies (lines 64 to 70). This criterion exists because it is the mechanical guard on binding rule 6, and revision 1 of this spec broke both.
- **AC-10**: The request header survives a session refresh, **and so does the refreshed session cookie**. The headers passed to `NextResponse.next({ request: { headers } })` are read once, at construction, and copied onto the response as internal forwarding headers. They are a snapshot, not a live view. So the request headers must be **re-derived immediately before each `NextResponse.next()` call**, as `new Headers(request.headers)` plus the pathname `set()`, including inside `setAll` and **after** its `request.cookies.set()` loop has run. One `Headers` object built early and reused by reference would snapshot before the cookie loop, and the rebuilt request would carry the pathname but lose the refreshed session, so the same request's Server Components would read a stale session while the browser received a fresh one.
- **AC-10a**: The test for AC-10 asserts **both** halves after a refresh: the pathname header is present, and the forwarded request carries the refreshed session cookie. A test asserting only the pathname passes while the second bug ships, which is the whole reason this criterion is split out. The vehicle is whichever suite can drive a real refresh: `src/proxy.test.ts` records that its unit half works only because `getClaims()` returns early with no session, so this likely belongs in `test/integration/`. A mock whose `setAll` merely rebuilds the response would encode the same assumption as the code under test and is forbidden by AGENTS.md.
- **AC-11**: The `(app)` layout, at the moment it redirects an unauthenticated visitor, reads the header through `headers()` and appends the value as a `next` query parameter on `/sign-in`, percent encoded so a nested query string survives intact. When the header is absent it redirects to a bare `/sign-in` and nothing fails.
- **AC-12**: One Zod schema validates the return path, and it is parsed at all three boundaries it crosses: the `next` query parameter on `/sign-in`, the hidden form field reaching the Server Action, and the cookie read by the callback. It accepts only a safe single leading slash path. It rejects a protocol relative `//`, a backslash, a scheme, control characters, and any value over **2048 characters** (the shared cap of AC-8). It rejects `/sign-in`, `/auth/callback` and `/go` as return targets: `/sign-in` and `/auth/callback` would loop, and `/go` would not loop but would resolve straight back to the landing rule, making the deep link a no op that looks honoured. It keeps the query string and drops the fragment, which is a property of the validator in isolation, since a browser never sends the fragment and the value can now also arrive typed into `?next=`. A rejected value falls back to the landing rule. A unit test names each hostile string, including one that is harmless before percent decoding and hostile after.
- **AC-13**: `/sign-in` parses `next` at its boundary and renders the accepted value into a hidden field inside each provider form. A rejected value is dropped and never echoed onto the page.
- **AC-14**: Each provider Server Action reads the hidden field and validates it again. When the value is accepted it writes the return cookie **before** the call that produces the provider URL, so the cookie is already on the response whichever way that call goes. When the value is rejected or absent it writes no cookie and proceeds, and sign in works normally without a deep link. The cookie is `httpOnly`, `SameSite=Lax`, `Path` scoped to `/auth/callback`, with a max age of 10 minutes, and its value is percent encoded on write and decoded before validation on read. `redirectTo` is unchanged and still carries nothing but `currentOrigin()` and the callback path, so spec 0007's safeguard 3 stands.
- **AC-14a**: The deep link survives a failed sign in attempt, on both error paths, or the spec says it does not. When `startProviderSignIn` fails, `signInWithGoogle` and `signInWithGitHub` redirect to `signInErrorPath(code)` (`src/features/auth/actions.ts:53` and `:79`); that path carries the accepted `next` value so the retry keeps it. When the callback fails it redirects to `/sign-in?error=...` and AC-15 has already cleared the cookie, so that path carries the value forward on the redirect too. Without this the two error paths behave differently by accident and a visitor who retries loses the link they followed, which is the silent discard the error model forbids.
- **AC-15**: The callback consumes, validates and clears the cookie on **every** path through it, including when validation fails and when the provider returned an error, so a stale value cannot fire at a later sign in. The clear repeats the same `Path` the cookie was written with, or it silently fails to match and the value survives.
- **AC-16**: Observable end to end: a signed out visitor follows `/search?q=react`, signs in with a provider, and arrives at `/search?q=react`. The same visitor with a hostile value in place of the path arrives at the landing rule instead, with the cookie cleared. A deep link beats the profile gap rule when both could apply.

### The door and the entry page

- **AC-17**: A door route at `/go` (a GET route handler placed outside `src/app/api/`, the same placement `/auth/callback` uses) sends a signed in visitor to the landing rule and a signed out visitor to `/sign-in`. Its responses carry `Cache-Control: no-store`, because the destination differs per user and a cached redirect would send one visitor to another visitor's landing target. They also carry `X-Robots-Tag: noindex`.
- **AC-18**: `/` renders **zero** `<form>` elements and shows no sign in invitation anywhere on the page. `SignInControls` is rendered twice today, in `src/features/entry-page/hero-section.tsx:216` and `src/features/entry-page/sign-in-band.tsx:56`, and both are replaced by the door CTA (`COPY-4`), a plain anchor that does not prefetch. The signed out header's control changes from a `#start` jump to the door (`COPY-5`), because the band it jumped to no longer signs anyone in.
- **AC-19**: `/` remains a static page that reads no session, mounts no Supabase client, and reads no user data, holding spec 0006's accepted security model and its AC-4 intact.
- **AC-20**: A signed in visitor at `/sign-in` is bounced instead of seeing the provider buttons again. The bounce honours an accepted `next` value and sends them there, falling back to the landing rule when there is none, so a valid deep link is not discarded by the bounce that exists to help them. The bounce **does not fire when an `error` parameter is present**, because `signInErrorPath(code)` sends a failed callback to `/sign-in?error=...` and bouncing would discard the message the person needs to see.

### Housekeeping

- **AC-21**: Header sign out uses the existing Server Action in `src/features/auth/actions.ts` and returns the visitor to `/`.
- **AC-22**: `/health` survives as an internal diagnostic, with one change. It stays under `(app)`, so it inherits the shell, and AC-2's ban on failure treatment does not extend to it, because showing a failure is its entire job. It is not in the navigation. Its own inline sign out form at `src/app/(app)/health/page.tsx:104-108` is **removed**, because AC-21 puts sign out in the header above it and two sign out controls on one page is the kind of residue this feature exists to clear rather than inherit.
- **AC-23**: Signed in routes stay unindexed by inheritance from the root layout, which already sets `robots: { index: false, follow: false }` at `src/app/layout.tsx:60`. A comment in the `(app)` layout records that as chosen rather than accidental. **This is a code review check, not a testable criterion**: no code change could make it fail, and it is recorded here as intent, the same way AC-4's absence half is.
- **AC-24**: The door route, the `/sign-in` bounce and the landing rule each open a named span as their **first statement**, before any guard clause or early return, per binding rule 4, and all three are registered in `docs/observability/spans.md`. The bounce's span wraps the session read as well as the decision that follows it, so the operation whose failure rate is measured is "decide whether to bounce" rather than "render `/sign-in`", and a signed out render is outside it entirely.

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

Six slots, **final**, used verbatim, no em dash, no en dash, no semicolon, matching the convention specs 0006 and 0007 set. Drafted with this spec and adopted by the engineer on 2026-08-31. `/develop` must not invent or reword them.

| Slot | Where | Sentence |
|---|---|---|
| `COPY-1` | `/search` placeholder | "Search comes next. This is where real listings will appear, ranked, with the reasoning shown." |
| `COPY-2` | `/profile` placeholder | "Your profile lives here. Once you fill it in, search has something to rank against." |
| `COPY-3` | `/applications` placeholder | "Every job you apply to will be recorded here, so you can see what you sent and when." |
| `COPY-4` | the door CTA on `/` | "Open JobHunt" |
| `COPY-5` | the signed out header control | "Open JobHunt" |
| `COPY-6` | the `/profile` link to `/applications` | "Tracked applications" (the mock up's wording, per `docs/design/app-shell-mockup-findings.md:16-17`) |

`COPY-4` and `COPY-5` must not read as a sign in invitation, which is the whole point of AC-18. That constraint is load bearing, not stylistic.

They carry the same sentence deliberately. Both controls point at `/go` and do the same thing, so giving them different words would suggest two destinations. They stay two slots rather than one because they sit in different components and a later change to one should not silently move the other.

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
3. The proxy sets the pathname header, unconditionally, using the `{ request: { headers } }` form, re-deriving `new Headers(request.headers)` immediately before **each** `NextResponse.next()` call including the one inside `setAll` and after its cookie loop, omitting the header when over the shared cap, with the binding rule 6 comment widened to name the new job, satisfies **AC-8**, **AC-10**, and keeps **AC-9** true
4. The AC-10a test, asserting both the pathname header and the refreshed session cookie survive a real refresh, satisfies **AC-10a**
5. The shared landing rule and its dedicated existence read, opening its named span first, with the absent row returning `false` and a genuine error going through `attempt()` to `/search`, satisfies **AC-6**, **AC-7**, **AC-7a**
6. The `(app)` layout appends `?next=` on its redirect, satisfies **AC-11**
7. `/sign-in` parses `next` and renders the hidden field; the Server Actions validate, write the cookie before the provider call, and carry the value onto their error redirect, satisfies **AC-13**, **AC-14**, **AC-14a**
8. The callback consumes, validates and clears on every path, then redirects to the deep link or the landing rule, carrying the value onto its own error redirect, removing the literal `/health` redirect, satisfies **AC-15**, **AC-16**, **AC-14a**
9. The door at `/go`, **opening its span first**, with its `no-store` and `noindex` headers, plus the `/` swap replacing both `SignInControls` renders and the header control with the door CTA, satisfies **AC-17**, **AC-18**, **AC-19**
10. The `/sign-in` bounce, **opening its span first** around the session read and the decision, honouring an accepted `next` and skipping on an error parameter, satisfies **AC-20**
11. The chrome only header primitive in `src/components/ui/`, the marketing layout created to compose the signed out variant with a per page navigation slot, the `(app)` layout composing the signed in one, `EntryHeader` folded in, sign out wired to the existing action, satisfies **AC-3**, **AC-5**, **AC-5a**, **AC-21**, **AC-4**
12. The three routes under `(app)` with their copy slots, the nav rendering only Search and Profile, and the `/profile` link to `/applications`, satisfies **AC-1**, **AC-2**
13. The `(app)` layout's no index comment, and `/health`'s inline sign out form removed, satisfies **AC-22**, **AC-23**
14. The three span names registered in `docs/observability/spans.md`, the calls themselves having landed in steps 5, 9 and 10, satisfies **AC-24**

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
- Creating the marketing layout, which does not exist today, puts a header on `/sign-in` and `/ui-preview` for the first time. `EntryHeader`'s in page anchors must not travel with it or those pages ship dead links, which the entry page's own AGENTS.md forbids; **AC-5a is the criterion that prevents it**, rather than this paragraph being the only place it is named. It also changes `src/app/(marketing)/page.test.ts` at lines 186 to 190 and 256 to 265.
- A signed out visitor already on `/sign-in` sees a header control pointing at `/go`, which sends them back to `/sign-in`. Cosmetic, accepted: the alternative is a per route exception in a header whose whole value is that it is the same everywhere.
- Existing entry page tests covering the sign in band's provider forms change with AC-18, including the four form assertion at `page.test.ts:245-254`, which becomes zero.

**Neutral**:

- The return cookie is one more stateful artifact in a stateless render path; its lifecycle is fully specified here so no later reader has to rederive it.
- Tap targets in the header keep the sizes the design system already locks. The mock up measured 32px and 28px, above the WCAG 2.2 AA 24px floor (SC 2.5.8) and below the 44px AAA comfort tier this project has not committed to.
- Prefetch no longer pollutes the return path. In revision 1 the proxy recorded every `(app)` request including prefetches; here the value is captured only at the moment the layout actually redirects, so a hovered nav link records nothing.

**Statements in Accepted specs that this feature falsifies**, each needing a dated supersession note, following the precedent spec 0007 set when it marked spec 0006's AC-7 superseded:

- **Spec 0001, binding rule 6**: "refreshes the Supabase session cookie and does nothing else". The closed enumeration widens to include echoing the requested path as a request header. The no authorisation half and both tests are untouched.
- **Spec 0001, binding rule 6's surrounding paragraph**, which says a route handler that must touch user data means writing its authorisation rule into that spec first. `/go` and the amended callback are the first route handlers here to read a user data table, so that rule is owed: each verifies its own caller through the session before the read, and row level security remains the guarantee behind it. The same amendment that widens the rule carries this.
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
