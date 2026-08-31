# Review, app shell and navigation (spec 0008), 2026-08-31

**Reviewed by**: three independent agents, on Claude Fable 5, Claude Sonnet 5 and Claude Opus 5. Two went in cold with no focus areas; one was given four focus areas drawn from a first read. The spec's author model is not recorded, so a panel was used rather than a single reviewer, to make sure at least one reviewer was not the author.
**Scope**: `docs/specs/0008-app-shell-and-navigation/index.md` and `rationale.md`, at commit `2687fe5`, status Proposed, judged against specs 0001, 0006 and 0007 (all Accepted), `docs/app-shell-direction.md`, and the current `src/proxy.ts`, `src/features/auth/actions.ts` and `src/features/entry-page/`.
**Verdict**: Send back. Two reviewers said accept with changes; the third said send back and carried the stronger evidence, because one finding may change the chosen mechanism rather than the spec's wording.

## Summary

The architecture holds. All three reviewers independently confirmed Option 1 is the right answer and that the rejections of Options 2, 3 and 4 are each correct on their stated grounds. The load bearing security reasoning is sound and was verified rather than taken on trust: `SameSite=Lax` really is required for the cross site top level GET return from a provider and `Strict` really would silently disable the feature; a cookie whose `Path` does not match the request path really is stored and sent later (RFC 6265 section 5.3); a Server Component really cannot set a cookie and a layout really never learns the pathname, verified against `node_modules/next/dist/docs/`; and `redirectTo` really does stay clean, confirmed against `src/features/auth/actions.ts:168`.

What the spec gets wrong is not the shape but the contract. Eight findings were reached independently by two or more reviewers, which is the strongest signal available here. Three of them are severe: the proxy's existing `setAll` callback will silently discard the return cookie in the most common real deep link case; AC-8 breaks two existing tests that are the only mechanical guards on binding rule 6, and no amendment to spec 0001 is queued anywhere; and the spec never says how the proxy identifies an `(app)` path, which is a hand maintained list with nothing failing when it drifts.

One finding opens a genuine fork in the chosen mechanism, and it is the engineer's call, not a reviewer's. It is recorded at the end under **Open decision**.

## Severe

### 🔴 The proxy's `setAll` callback will silently discard the return cookie, `src/proxy.ts:29-38`, AC-8

Found independently by two reviewers, both reading the real file.

`src/proxy.ts` builds `response` as `NextResponse.next({ request })`, then **reassigns** it to a brand new `NextResponse.next({ request })` inside Supabase's `setAll` callback whenever the library writes a session cookie, before copying cookies onto the new object. Any cookie set on the previous `response` reference is gone.

Build step 3 reads naturally as writing the return cookie when the proxy handles the request, which is before `await supabase.auth.getClaims()` on line 54. In that order the cookie survives only when Supabase writes nothing.

**The case where it vanishes is the most common real one.** A visitor whose session expired follows a link to `/search?q=react`. `getClaims()` attempts a refresh, fails, clears the session through `setAll`, and the return cookie disappears with it. The visitor signs in and lands on the generic landing rule instead of the link they followed. No error, no Sentry event, nothing to see: a silent failure of exactly the kind this project's error model exists to prevent. It is also intermittent, so it passes a manual verify run and a happy path test.

**Fix**: AC-8 must state the ordering as part of the contract, because it is not discoverable from the AC's current wording. Either the return cookie is written on the response object actually returned, after the session touch, or `setAll` must carry forward cookies already present on `response`.

### 🔴 AC-8 breaks the two tests that are binding rule 6's only mechanical guard, and no spec 0001 amendment is queued, `src/proxy.test.ts:49-70`

All three reviewers flagged the missing spec 0001 amendment. One went further and found the tests.

Spec 0001 line 133 does not say the proxy decides no authorisation and leave it there. It says the proxy "refreshes the Supabase session cookie **and does nothing else**". That is a closed enumeration, not a purpose clause, and AC-8 breaks it flatly. The spec's invariant ("only its wording widens") is true of the rule's first half and false of its second, and the spec never quotes the second half.

Two existing tests enforce it:

- `src/proxy.test.ts:49-62` asserts the proxy "treats a protected route exactly as it treats a public one", with the comment "The proxy cannot be deciding who may see what if it cannot tell these two apart. A per route rule added here would show up as a difference." AC-8 makes the proxy tell them apart by construction.
- `src/proxy.test.ts:64-70` asserts `response.cookies.getAll()` is empty.

So this feature deletes or weakens both guards, and AC-8's closing sentence ("The proxy still decides nothing about authorisation") becomes an assertion with no test behind it. Consequences names the entry page test churn but not this, which is the more consequential half.

There is also a consistency problem the spec cannot argue its way out of. Its own rationale rejects Option 2 because it "amends an Accepted contract, which nothing in this feature is entitled to do", and calls Option 2 "debt with a test attached". AC-8 is an amendment to an Accepted contract that additionally removes the test attached to it. The substance versus wording distinction is not applied symmetrically.

**Fix**: reopen spec 0001 explicitly with a dated amendment block on binding rule 6, naming what the proxy may now do, what it still may not, and the replacement guard for the deleted test. The project already has this precedent: spec 0007 wrote a dated amendment directly into spec 0001's directory layout section when it deleted `browser.ts`. Do not let a Proposed feature spec widen an Accepted binding rule through an invariant bullet.

### 🔴 Nothing says how the proxy identifies an `(app)` path, and the list will drift silently, AC-8

Unanimous across all three reviewers, and flagged on the first read before the panel ran.

Route groups are a filesystem only construct and add no URL segment, so nothing at runtime connects `src/app/(app)/search/page.tsx` to the string `/search`. Two further constraints were verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`:

- The `matcher` cannot express the set. Line 136: "The `matcher` values need to be constants so they can be statically analyzed at build-time." The proxy also exports one config for the whole file, so narrowing the matcher to `(app)` paths would stop refreshing the session everywhere else, which is the proxy's only current job.
- So the set has to be an in function comparison against a literal array, which is a hand maintained duplicate of a directory listing with no compiler or test relationship to it.

Add feature 20's route under `(app)` and its deep links silently stop surviving sign in. Silent failure again, and this project has already been burned by this exact shape: spec 0007 flagged its own `/health` literal as "the single most likely thing here to calcify by accident".

**Fix**: name one exported constant (for example `APP_PATH_PREFIXES` in `src/lib/routes.ts`) as the single source for the proxy's recording set, AC-7's return path allow list, and AC-1's signed in nav. Require a test that reads the real entries of `src/app/(app)/` and fails when the constant and the directory disagree. The project has this pattern twice already, in `tv.test.ts` (reading the scale out of `globals.css`) and `logo.test.ts`, so it is precedented rather than invented. Turning AC-7's deny list into an allow list also fixes finding 🟡 below.

## Major

### 🟠 AC-11 removes the provider forms from only one of the three places they appear

Two reviewers, finding two different halves of the same gap.

AC-11 names "the sign in band's one click provider forms". But `SignInControls` is rendered **twice** on `/`: `src/features/entry-page/hero-section.tsx:216` and `src/features/entry-page/sign-in-band.tsx:56`, and `src/app/(marketing)/page.test.ts:245-254` asserts exactly four `<form>` elements for that reason. Implemented literally, AC-11 leaves the hero's two provider buttons in place and the AC passes while its own user story ("I want `/` to stop inviting me to sign in") fails.

Separately, `src/features/entry-page/entry-header.tsx` renders a Button labelled **Sign in** with `href="#start"`. AC-3 fixes the header variant by route group with no session read, so a signed in visitor to `/` still sees it. The `#start` anchor also goes stale, because the band it jumps to no longer signs anyone in, which quietly breaks spec 0006 AC-4's accepted clause that "the header's sign in jump link is present at every width".

**Fix**: AC-11 should say no provider form is rendered anywhere on `/`, that the page renders zero `<form>` elements, and that both the hero and the band carry the door CTA. AC-3 must decide the signed out header's control, its destination and its label, and the spec must record the supersession of that spec 0006 AC-4 clause.

### 🟠 AC-14's door route no index is not buildable, and the header that actually matters is missing

Two reviewers, both verified against `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:108`: "Metadata can be added to `layout.js` and `page.js` files." A Route Handler has no Metadata API and inherits nothing from the root layout's `robots` export. As written, AC-14 sends a builder to an API that does not exist for that file type.

The sharper point is what is missing. `/go` returns **a different destination per user** based on their session, and nothing anywhere in the spec sets `Cache-Control: no-store`. A cached redirect would send one user to another user's landing target. That belongs in the Security model section, not only in an AC.

**Fix**: AC-14 should require `X-Robots-Tag: noindex` and `Cache-Control: no-store` on the door's responses. The no index half is close to moot anyway, since crawlers index a redirect's destination rather than the redirect.

### 🟠 The landing rule will report a failure to Sentry on every first time sign in, `src/features/profile/queries.ts:162-166`, AC-5

One reviewer, but specific and checkable.

`readOwnProfile()` returns `record_not_found` through `failure()`, which reports to Sentry and marks the `profile.read` span failed, per binding rules 2 and 4. AC-5's landing rule fires exactly on that case. If it reuses that query, every new user pushes `profile.read`'s failure ratio up, and that ratio is the denominator feature 9 will alert on. The spec says the rule "reads only profile row existence" but never says how.

**Fix**: name a dedicated existence read in the Value sourcing table that returns a boolean and constructs no failure.

### 🟠 AC-12's bounce silently discards the callback's own error messages, `src/features/auth/failure-codes.ts`

One reviewer. `signInErrorPath(code)` returns `/sign-in?error=...`, used at `src/app/auth/callback/route.ts:33`. A visitor who already holds a session in another tab and hits an error arrives at `/sign-in?error=account_exists` and AC-12 bounces them straight to the landing rule, discarding the message. An AC written to remove one silent failure introduces another.

**Fix**: the bounce does not fire when an `error` parameter is present.

### 🟠 AC-3 puts a feature dependency into `src/components/ui/`, which spec 0005 governs

One reviewer. `src/components/ui/AGENTS.md` describes that directory as the token layer's consumers, one component per file, all server components, none holding state or crossing the client boundary. A header there that imports `signOut` from `src/features/auth/actions.ts` inverts the folder by feature rule and makes the design system depend on a feature. This is the third place the spec amends an Accepted contract without saying so.

**Fix**: keep the primitive in `src/components/ui/` chrome only (lockup, slot, layout) and compose each variant in its own feature or layout, with the sign out form living outside `src/components/ui/`. Otherwise this needs spec 0005's sign off.

### 🟠 There is no marketing layout today, and creating one has unnamed blast radius, AC-3

Two reviewers. `src/app/(marketing)/` has no `layout.tsx`; `/` renders `EntryHeader` itself at `src/app/(marketing)/page.tsx:35`, and `/sign-in` and `/ui-preview` render no header at all. Moving the header into a new marketing layout:

- puts it on `/sign-in` and `/ui-preview` for the first time;
- carries `EntryHeader`'s in page anchors (`#how-it-works`, `#reasoning`, `#about`, `#start`) onto pages with no such sections, which is a dead link on a page whose own AGENTS.md opens with "Nothing that cannot work is a link";
- breaks `src/app/(marketing)/page.test.ts:186-190` (exact href set) and `:256-265` (the header's sign in jump).

None of this is in Consequences, which mentions only the band's provider form tests.

### 🟠 Placeholder and CTA copy is left for `/develop` to invent, against this project's own precedent, AC-2

Unanimous. The Value sourcing table claims placeholder copy is "decided in this spec (AC-2)", but no sentences exist anywhere in the spec, and the door CTA's label is never written down even though it is load bearing for AC-11 (it must not read as a sign in invitation). Specs 0006 and 0007 both pin exact engineer written copy in a `## Copy` table, marked final and used verbatim, with `/develop` told not to invent or reword.

**Fix**: add a Copy section with slots for the three placeholder sentences and the door CTA label.

### 🟠 `/health` is unaccounted for, though this is the feature that was meant to decide its fate

Unanimous. `docs/overview.md:32` says `/health` is "where signing in currently lands, provisionally, **until the app shell feature decides the real destination**". Spec 0008 is that feature. AC-5 removes the `/health` redirect and build step 4 deletes it, and then neither file mentions `/health` again.

It lives at `src/app/(app)/health/page.tsx`, so it inherits the new shell, still renders its `record_not_found` failure state (which AC-2 bans inside the shell), and still hosts its own sign out import (which AC-13 moves to the header). AC-1 also reads as an exhaustive inventory, so an implementer could reasonably delete it.

**Fix**: one sentence saying whether `/health` survives unchanged, is retired, or is folded in, and whether it is inside AC-8's recorded set.

### 🟠 Several ACs assert implementation shape rather than an observable outcome

Two reviewers, both citing this project's own reflex of 2026-08-28: "a step that only checks its own implementation can confirm nothing but what the author already believes, this shape has produced two escaped bugs."

- **AC-3**: "The variant is chosen by the route group, never by a prop at each call site."
- **AC-5**: "The decision lives in exactly one shared function, called by..."
- **AC-8**: every clause is a property of the code (unconditional, no branch, these flags). None of it is an outcome a reader experiences, and none of it would catch the `setAll` clobber above.
- **AC-14, first half**: "the spec records that as chosen rather than inherited" is satisfied by the spec's own existence. `src/app/layout.tsx:60` already sets `robots: { index: false, follow: false }`, so no code change could make it fail.
- **AC-15**: passes the moment two names appear in a table. Nothing checks that the spans open first, which is binding rule 4's actual risk.

The organising substance is worth keeping; it belongs in Consequences or as the stated reason for a code review check. AC-8 in particular should assert the outcome: a signed out visitor with an expired session who follows `/search?q=react` arrives at `/search?q=react` after signing in. That wording fails on the ordering bug, the encoding bug and a prefetch overwrite, none of which the current wording touches.

## Minor

### 🟡 The cookie value is never required to be percent encoded, AC-8 and AC-7

The cookie carries a path **with query string**. `@edge-runtime/cookies`, which backs `NextResponse.cookies.set`, does not percent encode the value, and a cookie value forbids comma, semicolon, space and non ASCII. `/search?q=react,node` produces a malformed `Set-Cookie`. AC-8 should require the value be percent encoded on write and decoded before AC-7's validator runs, and AC-7's hostile string list should then include a value that decodes into something hostile, which is the classic double decode gap.

### 🟡 Clearing the cookie must repeat the `Path`, AC-9

Two reviewers. Browsers match cookies for deletion by name, domain and path. A delete written with the default path never matches a cookie stored under `Path=/auth/callback`, so the clear silently no ops and the stale value fires at the next sign in, which is the precise failure AC-9 exists to prevent. Say "cleared with the same `Path` it was written with".

### 🟡 "Short lived" is not a value, AC-8

Two reviewers. Name the max age. An OAuth round trip through a consent screen and a two factor prompt can run several minutes, so a sixty second cookie fails on a slow human. Without a number, AC-9 is not checkable and two people test it differently.

### 🟡 Prefetch will pollute the cookie, and it cannot be detected inside the proxy, AC-6 and AC-8

Two reviewers. `next/link` prefetches, and prefetch requests hit the proxy, so hovering "Profile" in the signed in header records `/profile` as the requested path. AC-10 disables prefetch on the door CTA and says nothing about the nav.

The constraint that makes this a spec level problem was verified at `proxy.md:442`: "During RSC requests, Next.js strips internal Flight headers from the `request` instance in Proxy. For example, headers like `rsc`, `next-router-state-tree`, and `next-router-prefetch` are not exposed through `request.headers`." So it cannot be detected inside the proxy function at all. The only detection point is the matcher's `has` and `missing` config, which means two matcher entries. That belongs in the AC rather than being discovered mid build.

Note this also makes AC-6 and AC-8 describe two different artifacts: because the write branches on nothing, a signed in user who visits `/profile`, signs out and signs back in within the max age lands on `/profile`, indistinguishable to the cookie from a deep link. Decide which one the product wants and say so.

### 🟡 AC-7's rejection list is a deny list that will drift

It names `/sign-in` and `/auth/callback` and misses `/go`, which would re-run the landing rule (harmless today, a loop the day `/go` grows a step), and every future non `(app)` route. The shared constant recommended under the third severe finding turns this into an allow list. AC-7 also has no length bound on an untrusted, attacker influenced value about to be written into a 4KB cookie header; add one.

### 🟡 `/applications` ships with no way to reach it, AC-1 and AC-2

Two reviewers. `docs/app-shell-direction.md:87-89`, the settled direction, says it is "reached from a link on `/profile` and from the confirmation after marking a job applied", and `docs/design/app-shell-mockup-findings.md:16-17` records that as built and validated, matching the settled decision. AC-1 correctly keeps it out of the nav but requires no inbound link anywhere, and AC-2's `/profile` placeholder carries none. The route is reachable only by typing the URL. Add the link to AC-1, or record the deferral to feature 12 in Follow up.

### 🟡 AC-15's spans are never built by the build plan

Step 2 gives the landing rule a span AC-15 never mentions; steps 5 and 6 build the door and the bounce without spans; step 10 only registers names in `spans.md`. No step opens the two spans AC-15 requires. Separately, opened as `/sign-in`'s first statement the bounce span counts every signed out render, and opened after the session check it violates the span first rule in `docs/observability/spans.md`. Decide what the operation is and fix the satisfies mapping.

### 🟡 "The same carve out binding rule 6 already grants `/auth/callback`" overstates what exists

Binding rule 6 grants nothing. It restricts `src/app/api/` and is silent about handlers elsewhere; spec 0007's callback merely avoided the restricted territory and touches only session cookies, never a user data table. `/go` and the amended callback will be the **first route handlers reading a user data table** (`public.profile`), which bends spec 0001's "Server Components read" row. The substance is defensible, since the handler checks the session itself and RLS sits behind the read, but present it as a deliberate extension with its authorisation rule stated, not as a pre-existing grant.

### 🟡 Spec 0007 AC-16 is falsified with no supersession note

Spec 0007 AC-16 asserts "the entry page's two provider controls are real submits". AC-11 removes them from `/` entirely, so the claim becomes false. This project has an explicit convention for exactly this: spec 0007 itself marked spec 0006's AC-7 "SUPERSEDED 2026-08-29 by spec 0007 AC-16" with a dated note. Spec 0008 does the same kind of thing and does none of the paperwork, noting only "existing entry page tests will change".

Spec 0007's security model also says "`/` and `/sign-in` are public and read nothing", and AC-12 makes `/sign-in` read the session and, through the landing rule, a profile row. That is a real security model amendment to an Accepted spec, unnamed anywhere in 0008.

**Fix**: add a Follow up enumerating every Accepted statement this feature falsifies, with the dated supersession notes, matching the spec 0007 precedent.

## Nits

- ⚪ AC-4's "renders no hamburger, no drawer and no tab bar at any width" is an absence criterion, checkable only by reading source for things never built. Harmless, but it proves nothing about the built artifact. The 320 pixel overflow half is genuinely checkable.
- ⚪ AC-7's "drops the fragment" cannot be exercised through the feature's own path, because browsers never send the fragment, so `request.nextUrl` in the proxy can never carry one. Keep the clause as a property of the validator in isolation, but say so, or a verify step gets written that cannot fail.
- ⚪ Worth one line in a verify step: a cookie whose `Path` does not match the request path really is stored and sent later. It is correct, but it is the kind of thing a reader assumes is wrong.

## Open decision, for the engineer

**Does AC-8's proxy written cookie stand, or does the recorded variant become the chosen mechanism?**

This is the one finding that may change the spec's chosen option rather than its wording, so it is not a reviewer's call.

The rationale already records a variant at lines 149-153 and dismisses it in one clause. One reviewer argued it should be pushed further and compared on the merits: the proxy sets a request header on **every** request unconditionally, with no route knowledge whatsoever; the `(app)` layout reads it through `headers()` and redirects to `/sign-in?next=...`; `/sign-in`, already dynamic under AC-12, validates it; and the provider Server Action writes the httpOnly cookie before leaving for the provider.

**What it buys**: it dissolves the third severe finding entirely, because the proxy never learns what `(app)` means. It survives `src/proxy.test.ts:49-62` unchanged, because the proxy still cannot tell a protected route from a public one. It moves the cookie write to a component already allowed to write cookies, which removes the `setAll` ordering hazard. It keeps `redirectTo` clean either way. It is a materially smaller widening of binding rule 6 than AC-8.

**What it costs**: the return path becomes visible in a query parameter between the layout and `/sign-in`, where the cookie version keeps it opaque. It touches three components instead of two. `src/proxy.test.ts:64-70` (the empty cookies assertion) still needs revisiting, since setting a request header is not setting a cookie but is still more than "nothing else".

Whichever way this goes, spec 0001's binding rule 6 needs a dated amendment and a named replacement guard. The variant makes that amendment smaller; it does not remove it.

## Checked and found sound

Recorded so coverage can be told from omission.

- A Server Component cannot set a cookie: verified at `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:81`. A layout never learns the pathname: verified at `layout.md:180` and `:238-242`. The proxy can set response cookies: verified in `proxy.md`, "Using Cookies". The sub decision forcing the proxy written cookie is correct on these grounds.
- `SameSite=Lax` over `Strict` for the provider return leg: correct and correctly reasoned. The return is a cross site top level GET navigation, which `Lax` permits and `Strict` refuses.
- A cookie with a `Path` that does not match the request path is stored and sent on a later matching request: correct, RFC 6265 sections 4.1.2.4 and 5.3, which validate `Domain` but place no such requirement on `Path`.
- AC-7's threat model is real, not overkill. `https://usejobhunt.dev//evil.com` genuinely yields `pathname === "//evil.com"`, since WHATWG URL parsing does not collapse leading double slashes, and `new URL("/\\evil.com", base)` yields a protocol relative host. Both hostile shapes are load bearing.
- Spec 0007 safeguard 3 stands: `redirectTo` is built solely from `currentOrigin() + "/auth/callback"`, verified at `src/features/auth/actions.ts:168`.
- Spec 0006's security model survives: `/` still reads no session, mounts no Supabase client and stays static. The door route is genuinely the fix from outside the page, and a plain anchor structurally cannot prefetch, since prefetching is a `<Link>` only mechanism.
- Placing `/go` and the callback outside `src/app/api/` correctly uses the existing carve out rather than widening binding rule 6's second paragraph.
- The four options are genuinely distinct and the rejections of 2, 3 and 4 are each correct on their stated grounds, Option 4's in particular.
- Tap target reasoning: 24px is the AA floor (SC 2.5.8), 44px is AAA (SC 2.5.5), correctly cited and correctly not committed to. Both measurements confirmed at `docs/design/app-shell-mockup-findings.md:37`.
- No data model change: correct, nothing here needs a migration or an RLS change.
- The Tracer Bullet build order (validator, landing rule, proxy, callback) is the right thread in the right sequence.
- The scope row amendment from "everyone else on `/`" to `/search` is correct on the merits and recorded in the right three places, with `/develop` named as the agent that writes it to the row, consistent with the reflex that only `/develop` advances scope state. Excluded from re-litigation by instruction, and all three reviewers confirmed it independently.

**Not checked**: the visual mock up HTML, and whether proxy `Set-Cookie` headers survive a layout `redirect()` response (inferred sound, since the existing Supabase refresh flow already depends on it).

---

## Round two, revision 2, 2026-08-31

**Reviewed by**: two independent agents, on Claude Fable 5 and Claude Sonnet 5, both cold. Opus 5 was excluded this round because it authored revision 2. Each was asked to find new problems independently and, separately, to check whether round one's findings actually landed or were answered by rewording.
**Verdict**: Accept with changes, from both. The mechanism swap holds.

## Round one's findings, confirmed

Both reviewers independently confirmed all three severe findings resolved **in substance, not wording**:

- The `setAll` clobber is gone, because the proxy writes no cookie at all.
- Both `src/proxy.test.ts` assertions survive an unconditional request header set. One reviewer traced this to the source rather than the docs: `handleMiddlewareField` in `next/dist/server/web/spec-extension/response.js:24-40` copies request headers onto the response as internal `x-middleware-request-*` entries, touching neither `response.cookies` nor the `location` header.
- The `(app)` route list is dissolved, since the proxy holds no route knowledge.

Of round one's other twenty findings, both reviewers marked the large majority resolved. Three were called still open and are addressed in revision 3 below. The spec 0001 amendment and the four supersession notes remain queued rather than written, which is the open decision at the end of this round.

## New findings, applied in revision 3

- **The hoist instruction in build step 3 was actively wrong.** Verified against the installed source: request headers passed to `NextResponse.next({ request: { headers } })` are read once at construction, a snapshot rather than a live view, and `request.cookies.set()` mutates `request.headers` in place. So one `Headers` object built early and reused by reference would snapshot **before** `setAll`'s cookie loop, and the rebuilt request would carry the pathname but lose the refreshed session cookie. The same request's Server Components would then read a stale session while the browser received a fresh one, and revision 2's own AC-10 test would have passed while that shipped. Now AC-10 (re-derive before each call, after the cookie loop) and AC-10a (assert both halves).
- **AC-7 over corrected.** Banning `failure()` outright conflicts with binding rule 5, which requires a driver throw to go through `attempt()`. The natural reading would have mapped a database outage to `false` and landed the visitor on `/profile` as though their profile were merely empty. Now AC-7 (absent row only) plus AC-7a (a genuine error reports and sends the visitor to `/search`).
- **AC-8's truncation was a silent corruption.** Truncating to the cap produces a valid looking wrong destination that AC-12 then accepts, so the visitor lands somewhere plausible and incorrect with nothing reporting it. Now the proxy omits the header when over cap, and the cap is a named 2048 character shared constant.
- **The marketing layout's dead anchors were named in Consequences but no criterion prevented them.** An implementer following the ACs literally could reuse `EntryHeader`'s nav on `/sign-in` and `/ui-preview` and ship three dead links. Now AC-5a.
- **The deep link did not survive either error retry path**, and the two paths behaved differently by accident. Now AC-14a.
- **AC-2 and COPY-1 contradicted each other.** "Search comes next." is coming soon phrasing under a plain reading. The copy is right and AC-2's ban was mis-scoped: what spec 0007 AC-16 deleted was phrasing that had become **false**. AC-2 now bans the literal phrase and phrasing that will become false.
- Smaller: AC-1's "no route reachable only by typing its URL" was falsified by `/health` (now scoped to product routes); `/health` kept a second sign out control under the new header (now removed); AC-12's stated reason for rejecting `/go` was wrong, since `/go` resolves in one hop rather than looping; AC-23 is now labelled a code review check rather than a criterion that cannot fail; AC-24 now says whether the session read sits inside the bounce span; AC-20 now honours an accepted `next` rather than discarding it.

## Open decision, carried to the acceptance panel

**Write the spec 0001 amendment and the four supersession notes now, or at ship time?**

Both reviewers raised this, one as a Major finding. The precedent is real and cuts toward writing them now: spec 0007 wrote its dated amendment directly into spec 0001 (the `browser.ts` deletion) and its supersession note directly into spec 0006 (AC-7) as part of authoring itself, not as a follow up.

The argument for waiting is that the statements are not false yet. Spec 0001 says the proxy does nothing else, and today it does nothing else. Writing "superseded" into three Accepted specs on the strength of a Proposed one describes a future that has not happened, and would be wrong if spec 0008 is never accepted or changes again.

The argument for writing now is that this is exactly the state round one objected to, and a follow up checkbox is what a later `/sync` has to catch rather than what this spec guarantees.

A middle option exists: write the notes now, each naming spec 0008 and its status, so the note is accurate about being pending rather than asserting a change that has not landed.
