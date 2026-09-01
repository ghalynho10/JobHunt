# Verify: app shell & navigation · spec 0008 · updated 2026-08-31

_Run by `/check verify` on 2026-08-31: 27 of 28 steps ran and passed against the real local stack, in Chromium with real minted sessions. One step is blocked and named below._

_Steps derived from spec 0008's acceptance criteria and from every row of its `Value sourcing` table. `/check verify` runs these; `/test` locks the durable ones._

**Everything ticked here was measured, not reasoned about**: in the unit suite, in
the integration suite against the real local stack, or in Chromium driven against
`localhost:3000` with real minted sessions. Each step carries the observation that
proved it. The one unticked step names exactly what it needs, and it is the reason
this file exists rather than a claim that the feature is finished.

Two sessions are needed for most of the signed in steps: one user with a profile
row and one without. `test/helpers/session.ts` mints them without a browser.

## UI / manual

- [x] Signed out, open `/search?q=react` → land on `/sign-in?next=%2Fsearch%3Fq%3Dreact`, with the query string percent encoded into one parameter → AC-11 · _proved 2026-08-31, Chromium_
- [x] On that page, read the DOM of both provider forms → each carries a hidden `next` field holding `/search?q=react` → AC-13 · _proved 2026-08-31, Chromium_
- [x] Submit either provider form → the browser leaves for the provider AND still holds `jobhunt_return_path` for this host, scoped to `/auth/callback`, `httpOnly`, `SameSite=Lax` → AC-14 · _proved 2026-08-31, Chromium: the browser reached `accounts.google.com` holding it. This is the mechanic the spec marked inferred; it holds, and the recorded fallback is not needed_
- [ ] Complete a real sign in with Google from `/sign-in?next=%2Fsearch%3Fq%3Dreact` → arrive at `/search?q=react` → AC-16 · **BLOCKED, the only step this feature still owes.** The local Google client id is a placeholder, so the consent screen refuses before a code is ever issued. Everything either side of the exchange is proved: the cookie survives the trip out, the callback reads, honours and clears it, and the landing rule runs. The single unexercised line is the success branch choosing the deep link over the landing rule in `src/app/auth/callback/route.ts`. Run it on a preview deployment with a real account, the same way spec 0007's own handshake steps were proved
- [x] Return to `/auth/callback` a second time → the deep link is not honoured again, because the cookie was cleared on the first pass → AC-15 · _proved 2026-08-31, Chromium: the second callback carried no `next`_
- [x] Sign in from `/sign-in?next=%2F%2Fevil.com` → land on the landing rule's destination, never on `evil.com` → AC-12 · _proved 2026-08-31, Chromium, via the bounce_
- [x] Signed in with NO profile row, open `/go` → land on `/profile` → AC-6, AC-17 · _proved 2026-08-31, Chromium_
- [x] Signed in WITH a profile row, open `/go` → land on `/search` → AC-6, AC-17 · _proved 2026-08-31, Chromium_
- [x] Signed out, open `/go` → land on `/sign-in` → AC-17 · _proved 2026-08-31, Chromium_
- [x] Read the `/go` redirect's own response headers → `Cache-Control: no-store` and `X-Robots-Tag: noindex` on the 307, not only on the page it lands on → AC-17 · _proved 2026-08-31, Chromium_
- [x] Signed in, open `/sign-in` → bounced to the landing rule's destination → AC-20 · _proved 2026-08-31, Chromium_
- [x] Signed in, open `/sign-in?error=account_exists` → the page renders with its message, no bounce → AC-20 · _proved 2026-08-31, Chromium_
- [x] Signed in, open `/sign-in?next=%2Fapplications` → bounced to `/applications`, so a valid deep link beats the landing rule → AC-20 · _proved 2026-08-31, Chromium_
- [x] Open `/` → zero `<form>` elements, no provider control, and three controls pointing at `/go` → AC-18 · _proved 2026-08-31, Chromium and unit_
- [x] Signed in, open `/` → no sign in invitation, and the page still does not read the session → AC-18, AC-19 · _the static build output is the proof for the second half; see Commands_
- [x] Signed in, visit `/search`, `/profile` and `/applications` → the signed in header on all three, with `aria-current="page"` on the matching nav item and on no other → AC-1, AC-5 · _proved 2026-08-31, Chromium_
- [x] On `/profile`, follow "Tracked applications" → `/applications`, which is in no navigation → AC-1 · _proved 2026-08-31, Chromium_
- [x] Signed out, open `/` then `/sign-in` then `/ui-preview` → the header on all three, the three in page anchors ONLY on `/`, and no anchor anywhere whose target is not on that page → AC-5a · _proved 2026-08-31, Chromium and unit_
- [x] At 320 by 800, visit all seven routes → `document.documentElement.scrollWidth` equals `clientWidth` on every one, and no hamburger, drawer or tab bar anywhere → AC-4 · _proved 2026-08-31, Chromium. **This failed first**: the lockup left 82 pixels at 320 and both headers overflowed. Re-measure it rather than trusting it_
- [x] Signed in, open `/health` → it wears the shell, is in no navigation, still renders its failures, and carries exactly ONE sign out control → AC-22 · _proved 2026-08-31, Chromium_
- [x] Use the header's sign out on any signed in route → returned to `/`, session gone → AC-21 · _proved 2026-08-31, Chromium_
- [x] Keyboard only, tab through the signed in header → lockup, both nav items and sign out are all reachable with a visible focus ring → AC-4, accessibility floor · _proved 2026-08-31, Chromium: four Tab presses reach `JobHunt home`, `Search`, `Profile` and `Sign out` in that order, each with a computed `outline: 2px solid`_

## Commands

- [x] `pnpm build` → `/` is listed `○ (Static)`, so it prerenders and reads no session → AC-19 · _proved 2026-08-31_
- [x] `grep -rn "use client" src/` → only `src/app/global-error.tsx`, which Next.js requires → AC-19, spec 0006 AC-4 · _proved 2026-08-31_
- [x] `pnpm test` → 365 pass, including every hostile return path string named one by one → AC-12 · _proved 2026-08-31_
- [x] `pnpm test:integration` → 52 pass, including the proxy refresh test and the landing rule against real policies → AC-6, AC-7, AC-7a, AC-10, AC-10a · _proved 2026-08-31_
- [x] `pnpm exec vitest run src/proxy.test.ts` → the two binding rule 6 assertions pass with NO edit to them → AC-9 · _proved 2026-08-31_
- [x] Reintroduce the hoisted headers bug in `src/proxy.ts` (one `Headers` built once and reused inside `setAll`) → `test/integration/return-path-refresh.test.ts` FAILS, then restore it → AC-10, AC-10a · _proved during the build run on 2026-08-31, not repeated in the verify run, because `/check verify` does not edit application code. The test itself passed again here, so the assertion is live_
- [x] Read `src/app/(app)/layout.tsx` and confirm the noindex comment names the root layout's `robots` setting as chosen → AC-23 · _a code review check by the spec's own wording, not a testable criterion_

## Value sourcing, one step per row

Each of these varies the input and checks the output changes, because a value
with the wrong source usually looks right until the one input that separates them.

- [x] Landing target: the SAME account, with and without a profile row inserted between two calls, lands on `/search` then `/profile` → the source is row existence and nothing else · _proved 2026-08-31, integration_
- [x] Errored read: with the database unreachable, the landing rule returns `/search` and NOT `/profile`, and a failure is reported → an outage must never read as an empty profile · _proved 2026-08-31: PostgREST stopped with `docker stop supabase_rest_jobhunt`, leaving GoTrue up so the session still read cleanly. The user with NO profile row, who lands on `/profile` when the read works, landed on `/search` at both `/go` and the `/sign-in` bounce. Restarted afterwards_
- [x] Deep link precedence: with both a valid `next` AND a profile gap in play, the visitor lands on the deep link, not on `/profile` → AC-16 · _proved 2026-08-31, Chromium, isolated on one account: the user with NO profile row goes to `/profile` with no deep link and to `/applications` with one, so the deep link really is beating the gap rule rather than agreeing with it by luck_
- [x] Header name: rename `RETURN_PATH_HEADER` in `src/lib/return-path.ts` only → the deep link stops working and `src/lib/return-path.test.ts` fails, so no second spelling exists anywhere · _the test asserts the literal string_
- [x] Cookie name: same check for `RETURN_PATH_COOKIE` · _the test asserts the literal string_
- [x] Length cap: a return path one character over 2048 is refused and one at 2048 is accepted, and the proxy omits rather than truncates the header at that same number → AC-8, AC-12 · _proved 2026-08-31, unit_
- [x] Identity inside the callback: the landing rule runs on the id `completeSignIn()` returned, so a callback that exchanges cleanly never builds a second client to ask who signed in → AC-15a · _proved 2026-08-31, unit_
- [x] Copy: every one of `COPY-1` to `COPY-7` appears on its own surface, character for character against the spec's table · _proved 2026-08-31, all seven read off the rendered pages and compared to the table: `COPY-1` to `COPY-3` on the three routes, `COPY-4` in the entry page body, `COPY-5` in the marketing header, `COPY-6` on `/profile`, `COPY-7` in the signed in header_

## Acceptance-criteria coverage

- AC-1 · routes exist, two in nav, `/applications` linked from `/profile`
- AC-2 · placeholder copy renders as an ordinary state, no alert, no red border
- AC-3 · header primitive in `src/components/ui/`, imports nothing from `src/features/`
- AC-3a · **amended during the build**: composed per route on BOTH sides, not by either layout. AC-5 and the original AC-3a cannot both hold, because a layout never learns the pathname. Decided by the engineer 2026-08-31; the criterion itself is owed a dated amendment from `/architect`
- AC-4 · no mobile navigation machinery, no overflow at 320 on any of the seven routes
- AC-5 · signed in header everywhere under `(app)`, `aria-current` passed in, never computed
- AC-5a · marketing anchors only on `/`
- AC-5b · `src/lib/return-path.ts` and `src/lib/landing-rule.ts`, with the strings fixed
- AC-6, AC-7, AC-7a · the landing rule, the existence read, the errored read
- AC-8, AC-9, AC-10, AC-10a · the proxy's header, and both halves surviving a refresh
- AC-11 to AC-16 · the return path end to end, including both error paths
- AC-17, AC-17a · the door, and an errored session read at both routes that read one
- AC-18, AC-19 · the entry page swap, and `/` still static and session free
- AC-20 · the `/sign-in` bounce, its error exception and its deep link exception
- AC-21, AC-22, AC-23 · header sign out, `/health` tidied, noindex by inheritance
- AC-24, AC-24a · the three spans registered, every `redirect()` outside them
