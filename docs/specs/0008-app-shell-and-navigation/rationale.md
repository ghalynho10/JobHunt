# 0008. App shell and navigation, rationale

The reasoning behind [index.md](index.md). `/develop` does not read this file.

## Context

> ⚠️ **Premise note: the scope row's own done when clause contains one wording
that this spec amends.** Scope feature 32 says "a user with no profile row
lands on `/profile` and everyone else on `/`". Both `scope.md` and
[docs/app-shell-direction.md](../../app-shell-direction.md) predate section 1
of the direction document, which resolved the search route as `/search`
because spec 0006's accepted security model makes `/` a static page that reads
nothing. Landing a signed in user on the marketing page is the same bug the
sign in invitation is: the app's own front door sending people who already
have an account to a page that invites them to create one. The engineer
confirmed the default landing is `/search`, and this spec carries the
amendment rather than inheriting the stale wording. Everything else in the
done when clause is adopted as written.

The app has no shell. Three features were each about to invent one: feature 9
needs a page to put the profile form on, feature 11 needs a page for results,
feature 12 needs a place for the application record to live. The gap is named
in the scope as feature 32, enrolled deliberately ahead of feature 9, and the
direction document already settled most of the inventory. What remained
genuinely open was the sign in invitation on `/`, the return path through
sign in, and the exact mechanics of the landing rule.

Four forces shape the answer.

**The first is a contract already Accepted.** Spec 0006's security model says
`/` is "public and reads nothing. No session check, no Supabase client, no
Server Action, no user data of any kind", and its AC-4 pins the consequence:
zero client JavaScript, statically prerendered, with an automated test that
fails if any file the page reaches carries `"use client"`. Any fix for the
invitation that makes `/` read the session amends an Accepted contract, which
nothing in this feature is entitled to do. The fix has to come from outside
the page.

**The second is binding rule 6.** The proxy decides no authorisation and, as
written, only refreshes the session cookie. The return path needs a component
that both knows the requested path and may write a cookie, and the design
conversation verified the two obvious candidates are not buildable: a Server
Component cannot set a cookie (Next.js throws during render), and a layout
never learns the requested path (layouts receive params and children, never
the pathname). That leaves the proxy, which already runs on every route and
already holds the cookie writing machinery.

**The third is the project's error model.** A silent success is worse than a
loud failure. Applied here it rules out the sign in band's "coming soon"
phrasing returning anywhere (spec 0007 **AC-16** deleted it once it became
false), rules out placeholder pages wearing the health page's failure
treatment, and rules out a deep link being silently discarded when it could
have been honoured.

**The fourth is scale by subtraction.** Spec 0003's decisions fix the
inventory: no dashboard in v1 (feature 23 is v1.5), no saved results (feature
11's results are fresh per search), and the application record is the only
place a job persists. A signed in user can do three things, so the inventory
is three routes. The shell is thin because the app is thin, not because it
was left unfinished, and the spec says so deliberately so a later reader does
not "complete" it out of habit.

Not deciding is the one option that fails everything. Features 9, 11 and 12
are blocked on a decided shell, and the invitation bug ships with every day
it stays undecided.

## Options considered

### Option 1: Thin shell with a neutral door (chosen)

Three routes under `(app)` with a shared header varied by route group, no
mobile menu machinery, one shared landing rule, the return path carried in a
proxy written cookie, and a small GET route handler outside `src/app/api/`
that reads the session and sends the visitor to the landing rule or to
`/sign-in`. On `/`, the sign in band's provider forms are replaced by one
neutral CTA pointing at the door.

**Pros**:

- Every accepted contract survives intact: `/` stays static and session free,
  binding rule 6's substance holds, spec 0007's safeguards stand.
- The invitation is removed for real, not hidden: a signed in visitor sees a
  door into the app, and a signed out visitor's extra hop is one click.
- The return loop is one thread through components that already exist (proxy,
  callback, server client), so the build is small and testable end to end.

**Cons**:

- The proxy takes on a second job, widening binding rule 6's wording.
- Signed out visitors lose one click provider buttons on `/`.

### Option 2: Make `/` session aware

Amend spec 0006: `/` reads the session and renders the invitation or an app
entry depending on who is asking.

**Pros**:

- One page, one render, no extra hop for anyone, no new route.

**Cons**:

- Directly amends an Accepted contract, including the automated AC-4 test
  that exists to fail on exactly this change.
- Forces the marketing page dynamic, paying a session read on every visit by
  every visitor, including the anonymous majority it exists for.

### Option 3: Client hint cookie

Sign in sets a plain `signed_in=1` cookie; a small client component on `/`
hides the invitation when it sees the cookie.

**Pros**:

- `/` stays static; the change is small and entirely presentational.

**Cons**:

- The hint lies in both directions. A stale cookie hides the invitation from
  someone actually signed out, a silent failure in the project's own terms,
  and a visitor can forge or clear it at will.
- Puts session adjacent logic in a client component, against the rule that no
  session check runs in the browser.

### Option 4: Proxy rewrite for `/`

The proxy sends a visitor with a live session from `/` to `/search`.

**Pros**:

- No new route; the invitation disappears because signed in visitors never
  render `/` at all.

**Cons**:

- The proxy would branch on the session state to decide what a request to a
  public page returns, which is an authorisation shaped decision in exactly
  the file binding rule 6 forbids it.
- Removes the only place a signed in visitor can deliberately revisit the
  marketing page, and rewrites on every request rather than on one CTA.

**Sub decision: where the return path is carried.** The protected layout
writing the cookie was the intuitive answer and is not buildable (a Server
Component cannot set a cookie, and a layout never sees the pathname; verified
against `node_modules/next/dist/docs/`). The query parameter is buildable but
visible and tamperable at every hop, and would put the path in `redirectTo`,
which spec 0007's safeguard 3 deliberately keeps clean. The proxy written
cookie (chosen) is unconditional, so the proxy never learns or decides
anything about the session; the callback, a route handler, reads and clears
it. A recorded variant exists should the proxy ever be forbidden from writing
cookies: the proxy sets a request header only, the layout puts the path on
its redirect, and the provider Server Action writes the cookie before leaving
for the provider. Either way `redirectTo` stays untouched.

**Sub decision: the default landing.** `/search`, not `/`, per the premise
note. The runner up was keeping the scope row's literal wording, rejected
because inheriting a stale contradiction is how specs calcify; spec 0007
already flagged its own literal `/health` callback redirect as "the single
most likely thing here to calcify by accident", and this feature replaces it.

**Sub decision: header tap targets.** Keep the sizes the design system locks
(above the WCAG 2.2 AA 24px floor of SC 2.5.8, measured 32px and 28px in the
mock up). The runner up, raising to the 44px AAA comfort tier, was rejected
because the project has not committed to AAA and the shell reuses Button
sizes the design system already governs.

**Sub decision: placeholder treatment.** Ordinary expected state, one honest
sentence per route, no alert role, no red border, no "coming soon". The
runner up, routes with no pages until their features land, was rejected
because the nav would link to failures.

## Rationale

Option 1 wins because it is the only option that satisfies every standing
contract while still removing the invitation for real. Option 2 buys
simplicity by amending the one Accepted decision this project has an automated
test guarding, which is not simplicity but debt with a test attached. Option
3 and Option 4 each break a rule the project has already paid for: the client
hint reintroduces the silent failure the error model exists to prevent, and
the proxy rewrite puts an authorisation shaped branch into the one file whose
single job is to never make one.

The mechanics follow from the constraints rather than from taste. The return
cookie lives in the proxy because the proxy is the only component that both
knows the path and may write a cookie, and it stays authorisation blind by
writing unconditionally. SameSite is Lax rather than Strict because the
return leg from a provider is a cross site navigation and Strict would
silently disable the feature it exists to enable. The validator is stricter
than "starts with a slash" because browsers normalise `/\evil.com` to a
protocol relative URL and strip embedded control characters, so each hostile
shape is named in the unit test rather than trusted to a rule of thumb. The
query string survives because `/search?q=react` is the deep link most worth
carrying, and a path only rule would land the user on an empty search.

The shape of the shell follows the direction document as the settled
decision, and the design conversation only had to add what the document
genuinely left open. Nothing in the navigation competes with the design
system's elevated idiom, because at three routes there is almost no
navigation. Feature 14's gate layers onto the landing rule's callers rather
than replacing it, which is stated as an invariant here so the gate cannot
grow into the onboarding flow the direction document explicitly ruled out.

## References

**Project sources** (verifiable, in this repo):

- [spec 0001](../0001-stack-and-architecture/index.md), binding rule 6 (authorisation never decided in the proxy; no user data in `src/app/api/` route handlers), which this spec widens in wording only, and the Server Components read, Server Actions write rule.
- [spec 0003](../0003-data-model/index.md), the `public.profile` table the landing rule reads for row existence, and the no dashboard in v1 decision that fixes the page inventory.
- [spec 0005](../0005-design-system-and-ui-foundation/index.md), the design system the promoted header must hold: the token layer, the container idioms, and the mono versus sans rule.
- [spec 0006](../0006-entry-page-and-link-metadata/index.md), the security model keeping `/` session free, **AC-4** (static prerender, zero client JavaScript), and the positive tradeoff promising a shared header before the second page needs one.
- [spec 0007](../0007-auth-and-per-user-isolation/index.md), the deferred return path, the single leading slash validator constraint, safeguard 3 (`redirectTo` stays clean), **AC-16** (the deleted "coming soon" phrasing), and the flagged `/health` callback redirect this feature replaces.
- [docs/app-shell-direction.md](../../app-shell-direction.md), read down through "Suggested path" as the settled decision: the page inventory, the nav membership, the header variants, the no mobile menu rule, and the three items this spec resolves (the invitation, the return path, the deliberate no index line).
- [docs/design/app-shell-mockup-findings.md](../../design/app-shell-mockup-findings.md), the confirmed layout at 1440px and 320px, the tap target measurements, and the elevated skills card answer.
- [docs/design/jobhunt-app-shell.html](../../design/jobhunt-app-shell.html), the visual mock up this spec builds toward.
- `ui-registry.md`, the "Design tool import audit, 2026-08-30" section, the token level record the header's styling must stay inside.
- [scope.md](../../scope/scope.md), feature 32's done when clause, which seeded the acceptance criteria (with the one amendment in the premise note).
- `src/proxy.ts`, the current proxy that binding rule 6 governs and that takes on the return path recording.
- `src/features/entry-page/entry-header.tsx` and `src/components/ui/logo.tsx`, the half kept inheritance promise this feature completes.
- Installed community skills: `supabase` and `supabase-postgres-best-practices` (`supabase/agent-skills`), `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`), `vercel-react-best-practices` (`vercel-labs/agent-skills`).

**Practices and standards**:

- WCAG 2.2 SC 2.5.8 (Target Size Minimum, 24px, AA), the tier this project commits to; SC 2.5.5's 44px tier is AAA and not committed.
- Open redirect defence (unvalidated redirects named by OWASP as a redirect risk), applied through the strict Zod validator and its hostile string test.
- Parse at every boundary, this project's standing rule, applied to the return cookie as untrusted input.
- Progressive disclosure of chrome: the shell stays minimal by construction because the v1 decisions fix the inventory, recorded deliberately so thinness is not read as incompleteness.
