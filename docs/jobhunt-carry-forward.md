# JobHunt — findings to carry into later specs

Research findings that landed before the spec that owns them was written.
Each is tagged with the feature that inherits it. Delete an entry once it
is written into that feature's spec.

---

## Feature 4 — Data model

**Supabase API keys changed. Start on the new ones.**
Legacy `anon` and `service_role` keys are deprecated by end of 2026.
Replacements are publishable (`sb_publishable_...`) and secret
(`sb_secret_...`). Greenfield means starting on the new format rather
than migrating mid-build. Current docs use
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Transport difference: the new keys go in the `apikey` header and cannot
be sent as an `Authorization` bearer token.

**The line that belongs in the spec verbatim:** migrating keys does not
secure a project whose tables have no policies. A publishable key in
front of an unprotected table exposes exactly as much as an anon key
did. Key rotation is not a substitute for RLS.

---

## Feature 7 — Auth & per user isolation

**Use `@supabase/ssr`, not the legacy auth-helpers package.**

**A root `proxy.ts` is required** (Next.js 16 renamed `middleware.ts` to
`proxy.ts`, and the named export with it; it sits beside `app`, so
`src/proxy.ts` here). Server Components cannot write
cookies, so the proxy refreshes expired auth tokens: it calls
`supabase.auth.getUser`, passes the refreshed token to Server Components
via `request.cookies.set`, and back to the browser via
`response.cookies.set`. Use a matcher so it does not run on routes that
never touch Supabase.

**In server code, check auth with `getUser()`, never `getSession()`.**
`getSession()` reads the cookie without verifying it against the auth
server — a check that passes without proving anything. That is exactly
the silent-failure shape feature 7 exists to prevent, so it belongs in
the spec as a named prohibition, not just a preference.

---

## Feature 10 — Usage gating & kill switch

**Confirmed rate limits, from Adzuna's own terms of service:**
25 hits/minute, 250/day, 1,000/week, 2,500/month.
(An earlier third-party figure of ~1,000/month was wrong.)

**The monthly window is the binding constraint.** Working down from
2,500/month: that is roughly 577/week or 82/day — well under both the
1,000/week and 250/day allowances. The weekly does bind over the daily
(250 × 7 = 1,750, above the 1,000 weekly cap), but the chain does not
extend to the month: 1,000/week runs about 4,333 over an average month,
which breaches 2,500 badly. Gate on the monthly, or on a rolling window
derived from it.

**Confirm what one search costs before designing the cap.** If a
user-facing search is more than one API call — pagination, a count
query, a follow-up fetch — the effective ceiling drops by that
multiple. Check this against the real API before writing the numbers
into a spec.

**Two budgets, not one.** The limits are against a single API key, so
per-account caps alone do not protect the aggregate — one heavy user or
twenty enthusiastic friends drain the same 1,000. Needs a per-account cap
*and* a global counter. The kill switch is the manual backstop under both.

**Suggested starting point:** 20–25 searches per user per week, and
configurable rather than hardcoded. Against the real budget (~577/week
derived from the monthly cap), ten users at 25/week is 250 — comfortable,
but half the headroom a weekly-cap reading would suggest. Recheck once
the calls-per-search question above is answered.

**A permanent constraint, not a v1 limitation:** creating multiple
accounts for a single entity or individual is explicitly treated as
misuse in the terms. Provisioning per-user API keys to expand the budget
is not available, ever.

---

## Features 5 and 11 — Design system, and job search results

**Adzuna attribution is per displayed advert, not per screen.**

The terms state: an API user shall label *each displayed advert* with the
phrase "Jobs by Adzuna" at least 116 × 23 pixels, with the word "Jobs"
hyperlinked to adzuna.co.uk (or relevant local domain) and the word
"Adzuna" being the Adzuna logo image, also hyperlinked.

This is a per-result-card requirement, and 116 × 23 px is not small at
card scale — it affects card layout, so it is a design-system input, not
a footer to add later. `brand-tokens.md` carries the corrected per-advert
wording under its results-page requirements.

Logo images: adzuna.co.uk/press.html

---

## Feature 14 — Fit scoring

**Adzuna returns only a snippet of the job description, not full text.**

This lands on three features and needs a decision, not just a note:

- **Scoring (14)** matches skills against a partial description. A skill
  the posting requires but the snippet omits reads as a gap that is not
  real.
- **The remote heuristic (18)** is specified as running over title and
  description. A truncated description weakens it.
- **The cross vendor self check (17)** verifies that reasoning cites
  skills present in both the listing and the profile. It can only check
  against what was actually retrieved.

Options to weigh when the spec is written: fetch the full posting from
the source URL, label scoring as based on partial data, or accept the
limitation and state it in the UI. All three are honest; silently scoring
against a snippet as if it were the full posting is not.

**If the fetch option is taken:** `defuddle` (github.com/kepano/defuddle)
extracts clean markdown from a web page, stripping nav, ads, cookie
banners and footers. That is the concrete mechanism for turning a posting
URL into scoreable text rather than page furniture. It also ships as one
of the five skills in kepano/obsidian-skills. Verify its current state
against the repo when this spec is written rather than assuming the
description above still holds.

**Check the terms before assuming the fetch option is clean.** Adzuna
returns a redirect URL that routes through their own tracking rather than
a direct link to the employer's page, so "fetch the source URL" may mean
fetching Adzuna's redirect at volume — a different activity from the API
use they licensed, and a second rate-limit surface on top of theirs.
Confirm what the field actually points at, and what the terms say about
automated fetching of it, before designing around this option. Many
careers pages are also JS-rendered, the same open question already flagged
for lite company research.

---

## Feature 19 — Listing data quality

**Adzuna salaries are often model-predicted, not stated by the employer.**

This is a labeling problem, not only an outlier problem. Showing a
prediction as a fact is the same failure shape as a score that looks
confident and is not — which is the thing this whole project is
organized against. A predicted salary needs to read as predicted.

Note also: publishing Jobsworth salary estimates carries its own
attribution requirement (a 20 × 20 px icon plus the words "Adzuna
Jobsworth", both linked, with mouseover text "Salary estimate powered by
Adzuna Jobsworth"). Check whether the salary figures in search results
count as Jobsworth estimates before displaying them.

---

## Feature 5 — Design system

*(The feature 1 half is spent: spec 0001 records Tailwind v4 in the stack
table and the scaffold is built on it.)*

**Tailwind v4 removed the JavaScript config file.** Current is 4.3.x.
Customization lives in CSS via `@theme`. `brand-tokens.md` has been
annotated, but the landing page HTML is still v3-shaped and loads the
CDN script.

Port constraints: raw channel values in `:root` mapped by a **non-inline**
`@theme` (`@theme inline` bakes values at build time and breaks runtime
theming); v4 supports `prefers-contrast`, `forced-colors`,
`prefers-reduced-motion` and `:focus-visible` directly in CSS, which is
where the WCAG 2.2 AA groundwork should land.

Deprecation to avoid: `start-*` and `end-*` in favor of `inline-s-*` and
`inline-e-*`.

---

## Unowned — TypeScript 7

*(The rest of this entry is spent. The `next dev` `AGENTS.md` block was
preserved byte for byte during `/audit`; Node 24 is pinned in `.nvmrc`
and `engines`.)*

**TypeScript 7** shipped recently and `next build` can use it for type
checking via `pnpm add -D typescript@^7`. This was an input to feature
1's language strictness decision, which settled the flags but not the
version — so the project is on TypeScript 5.x. That makes this an
optional upgrade rather than a pending decision. Worth revisiting only if
build times become a real problem; a major compiler bump mid build is not
free.

---

## Feature 3 — Supabase MCP server

**This is the one with a named, demonstrated risk.** The feature 2 half
is spent: binding rule 7 in spec 0001 states all five conditions, and
`/audit` wrote them into root `AGENTS.md`. What remains is feature 3's
half — **which project the connection points at**, since feature 3 owns
the environment split and secrets. The fifth condition ("never pointed at
real user data") is only enforceable once a dev project distinct from
production actually exists.

The 2026 server uses OAuth rather than a pasted personal access token:
`claude mcp add --transport http supabase https://mcp.supabase.com/mcp`,
with `project_ref` in the URL to scope it to a single project.

A mid-2025 disclosure showed an agent reading support tickets through
this server, following instructions planted in a ticket body, and —
running with `service_role` credentials that bypass row level security —
querying a sensitive tokens table and writing the result back where the
attacker could read it. A prompt injection through ordinary user-supplied
content, executed with credentials that ignore RLS.

**Why this matters here specifically:** JobHunt holds real resumes and
personal details from Slice 1 onward. The attack requires only that
attacker-controlled text reach the agent's context — a profile field, a
saved job description, an application answer. All three exist in v1.

Mitigations, from Supabase's own guidance:

- **Read-only mode.** Runs every query as a read-only Postgres user;
  disables migrations and deploys.
- **Scope to one project** via `project_ref`.
- **Keep per-call confirmation on.** Do not auto-approve database tools.
- **Prefer a development project with synthetic data** for agent-assisted
  work, rather than pointing the agent at production rows.

Decide before connecting the MCP server to a project that contains real
user data, not after. This is a decision to make deliberately, not one to
handle by remembering.

---

## Deliberately not researched

AI model pricing and availability. That is feature 13's explicitly
deferred decision, and anything gathered now would be stale by Slice 2.
