# JobHunt — Idea Brief (revised after external review)

**Purpose of this document:** two uses. First, feed the "Product statement" and "Context" sections to `/scope` so it can plan without re-litigating decisions already made here. Second, hand this whole document to a fresh chat for independent review — it has no stake in these decisions and may catch something this one missed, the same reason cross-model code review caught a real bug in the reference project below.

**What changed in this revision:** an earlier draft scoped fourteen individually-justified features into v1. External review correctly identified that as the same shape as the reference project's own failure — scale that hid a real defect despite extensive process, not a reason to specify more carefully. v1 is now three features plus what they structurally require to function; everything else is sequenced after, not cut. A second review pass added: the eval harness's ground-truth data named as its own required line of work, a profile-entry step added to the completion test (with feature 13 specified as manual entry only, no AI extraction, in v1), and Adzuna's actual terms of service checked directly rather than left as an assumption — resolved favorably, with one concrete attribution requirement to build.

**Author's situation, for calibration:** currently unemployed, cost-sensitive as a result. Not launching this as a public product — audience is personal use, a few friends, and recruiters/hiring managers evaluating it as a portfolio piece. Built to be genuinely production-ready anyway, because the engineering discipline itself is part of what's being demonstrated.

---

## Product statement

JobHunt is a multi-user job-search web app that replaces an earlier project (JobPilot, described below) on the author's resume and portfolio. It's free for other users, with no billing — cost exposure is handled through usage-gating rather than monetization. It's meant to be actually used for a real job search, not just demoed, while being built with full ownership: the author understands the core logic and every decision behind it, rather than delegating architecture decisions to an agent.

---

## Governing principles

- **Full ownership, stated precisely.** The goal is understanding every decision and what each piece does and why — not typing every line by hand. Where a well-vetted system is the right tool (auth, backend), using it deliberately *is* the principle in action, not an exception to it. The discipline is knowing why, not hand-building everything.
- **A mechanical check, not just an intention.** At the end of each feature, write its data/control flow from memory before it counts as done. Understanding erodes silently under scope pressure; a stated intention doesn't catch that, a check does.
- **Explain-then-approve.** Architecture decisions get laid out with alternatives before being built, not decided unilaterally.
- **No billing.** Deliberately rejected in favor of usage-gating — avoids the compliance and liability surface of real payments for a project that isn't a commercial product.
- **Production-ready as the point, not the excuse.** The engineering rigor (auth, cost protection, testing discipline) is itself part of the portfolio story, independent of real user volume.

---

## Scope discipline for v1

Added after review, because a list of individually-justified features can't tell you when to stop — a test can.

**The v1 completion test.** v1 is done when a user can enter their profile, search, see ranked results with shown reasoning, click through to apply, and record that they applied. Anything beyond that is v1.5. Check every future addition against this test, not against whether it's individually reasonable — the earlier draft's features were all individually reasonable, and that was exactly the problem.

**The named-risk retention rule.** Anything in scope because of a specific, named, real risk does not get cut as part of scope reduction. It is cut only by explicitly deciding the risk is acceptable — never as a side effect of trimming for time or fatigue. This is why the usage-gating kill switch and OAuth-only login (bot-resistant by construction) survive the v1 cut below even though most of features 8 and 9 don't: they exist because of one specific named risk (uncontrolled API cost while unemployed), not as general polish. The same rule will apply again whenever v1 gets trimmed further under time pressure — it's stated once here so it doesn't need re-litigating item by item.

---

## Reference project: JobPilot (what JobHunt replaces)

JobPilot was a prior job-search assistant, built partly as a guided course project (JS Mastery track) with the author's own additions layered on top (Stripe billing infrastructure — never taken live, an ATS numeral-verification layer, deployment). Two audits of the real codebase (not the docs) surfaced the findings below; they're the empirical basis for most of JobHunt's design decisions, including the scope cut above.

**Architecture, honestly sized:** ~985 lines of AI logic across four single-shot GPT-4o wrappers plus one hardcoded browse-then-synthesize pipeline. No agent loop, no tool-calling, no eval harness, no retries. The strongest engineering in the repo was the SQL layer (an atomic usage-gating RPC, trigger-based webhook fulfillment, a deliberate `REVOKE`-before-`GRANT` privilege model) — not the AI layer.

**The anchor bug:** a usage-gating RPC returned an array (`RETURNS TABLE`), the client code read it as a single object, and every metered action was silently denied for every account — free and paid alike — for two weeks. All six test mocks encoded the same wrong assumption as the implementation, so the suite passed throughout. The spec had actually specified the correct behavior and asked for a concurrency test against a real database connection; that test was written as a mock instead. **The process didn't fail — it was skipped.** Nineteen specs and 480 passing tests did not prevent this; that scale is the direct reason v1 is now small.

**The scoring-quality bug:** the match-scoring feature — the product's core value proposition — passed every test while returning a nearly constant score (mostly 70–75, at `temperature: 0.3`, with an unanchored 0–100 prompt). No test in the suite had any notion of *output quality*; Zod validation only confirmed the output was a number, not a good one. Fixed with a five-band rubric and `temperature: 0`. This is the direct reason feature 2, below, is weighted as it is.

**Nine more defects surfaced in twenty minutes of actually using the product**, none caught by the static audit or the 480+ passing tests: fabricated screenshots in the README, a repeat search that wiped the visible results table, duplicate listings from the jobs API under different IDs, salary formatted as a range from a number to itself, and a scoring failure (`match_score: null`) that silently inserted the row and still reported success.

**What's carried forward from JobPilot, on merit:** the SQL/RLS discipline, the numeral-verification pattern (a deterministic post-generation check that drops any resume bullet containing a digit not present in the user's own profile data), the spec-writing discipline itself, and the cross-model review gate (a different model reviewing a diff catches things the author's own model misses, even when explicitly asked to look for that exact bug).

---

## Feature 2 — Ranking (the primary build focus)

This is the differentiator, not one item among fourteen. It's the only part of JobHunt a technical reviewer would find genuinely interesting, and it directly answers the sharpest single finding across both JobPilot audits — a scoring feature that shipped, passed every test, and returned a nearly constant, meaningless number. **Most of v1's build time should go here.**

- Fit score against resume + stated preferences, soft-adjusted over time from discard feedback (v1.5) — per-user only, no cross-user learning, simpler and more private, appropriate for a non-commercial app.
- **Shows its work explicitly** — matched skills vs. gap skills, not just a number — both for usability and as a built-in sanity check against the "constant meaningless score" failure mode above.
- **A genuine self-check loop**, not a bigger prompt: does the stated reasoning actually cite skills present in both the job and the profile. The self-check must run on a **different model vendor** than the bulk scoring pass — the same logic as cross-model code review, applied one layer down, inside the AI pipeline itself.
- **Backed by an eval harness**: fixed job/profile pairs with expected score *ranges*, built across a few different profile archetypes (not just the author's), run whenever the scoring prompt or model changes.
- **Prerequisite, budgeted explicitly:** the harness's ground truth doesn't exist by default. Someone has to write realistic profile archetypes, write matching job postings at a range of fit levels, and decide the expected score range for each pair — real authored content work, not harness plumbing. Treat this as its own line of v1 work, discovered now rather than mid-build.
- Optional scoring dimension: visa/sponsorship signal, when a posting states one (borrowed from a reference source below).

---

## v1 — the rest of the core loop

Everything below exists to make feature 2 usable end to end, per the completion test above: search in, ranked reasoning out, a way to act on it, a record that it happened.

**Feature 1 — Structured search filters.** Location, seniority, remote/hybrid, job type, salary range, listing recency. JobPilot exposed only title + free-text location with `category` hardcoded; the underlying jobs API (Adzuna) already supports `salary_min`/`salary_max`, `full_time`/`part_time`/`contract`/`permanent`, `category`, and `max_days_old` — the gap was in JobPilot's implementation, not the API. No structured "remote" field exists in the API; handle via a text heuristic against title/description in v1.

**Feature 3 — Application tracking.** "Did you apply?" → a guided capture flow (preset questions, hand-typed answers, not AI-generated) → a saved record. This is the **only persistence layer for jobs** — search results themselves don't persist (see Search lifecycle, below).

**Feature 7 — Redirect to apply.** Links out to the real job posting; no auto-fill, no submission on the user's behalf. Kept in v1 rather than v1.5: it's an outbound link with no new data model, and without it the loop has nowhere to click through to — ranking a job with nowhere to act on it isn't really a complete loop.

**Feature 8, minimal — Multi-user auth.** OAuth login only (Google, GitHub) via Supabase Auth, plus per-user data isolation. No password/email-verification path in v1 — OAuth satisfies the named-risk rule's bot-resistance goal (a real linked account is harder to fake for abuse than a burner email) with less to build: no transactional email service, no verification flow. Email/password signup, if wanted for users without a Google/GitHub account, moves to v1.5. Session-expiry handling and account-settings UI also move to v1.5.

*Test fixtures:* a dev-only test-session path (Supabase admin API, mints a real session directly, no OAuth provider driven) so `/test` and `/check verify` can authenticate without a browser — same pattern JobPilot used, hard-gated to non-production. A small fixed pool of fake test users (`test-user-a@example.invalid`, `test-user-b@example.invalid`, etc.), never a real personal email, exists specifically to test RLS isolation: log in as A, create data, switch to B, confirm B can't see it. No role-permission matrix to test — the actor model in v1 is just "authenticated user" and "demo account" (feature 14); see feature 9 for why no in-app admin role exists to test either.

**Feature 9, minimal — Usage-gating / cost protection.** Per-account caps on exactly the two call types v1 actually makes (jobs-API search calls, AI scoring calls), fail-closed by default, plus the **hard global kill switch**. The kill switch stays in v1 under the named-risk rule — a single flag, cheap to build, and the direct mechanical answer to a real, explicitly named financial risk (the author is currently unemployed and cannot absorb runaway API cost from abuse). Spend-visibility UI and broader gating polish move to v1.5.

*Deliberately out-of-app for v1:* the kill switch is operated externally (an environment variable or a direct Supabase dashboard toggle), not through an in-app admin panel. No in-app admin role exists in v1 as a result — flipping it requires direct access to the deployment, not a privilege level inside the product. Keeps the actor model to exactly two types (regular user, demo account) rather than reopening scope the completion test was written to hold the line on. An in-app admin role, if remote-control convenience turns out to matter, is a clean v1.5/v2 addition, not a v1 gap.

**Feature 13, minimal — Profile data model.** A flat profile (personal info, skills, one layer of work experience, job preferences), entered manually via a form — not uploaded as a resume for AI extraction. Kept in v1 as a structural extension, not scope creep: feature 2 cannot function without it, and the completion test above doesn't work without a way to get profile data in. Doesn't expand feature 9's minimal call-type scope — manual entry makes no AI call. Resume upload with AI-powered extraction (one of JobPilot's four original AI call sites, with its own accuracy caveats per the audit) moves to v1.5, alongside nested work-experience/project support and honest completeness signaling.

---

## v1.5

Natural next additions once the core loop is real and in use — sequenced after, not cut. Several of these explicitly depend on something in v1 existing first.

- **Feature 4 — Discard-with-reason.** Dropdown reason, soft-adjusts future ranking. Needs feature 2 live to have something to adjust.
- **Feature 5 — Resume tailoring per job.** Fit score shown, no hard gate. Ships with the known-working numeral-verification pattern from JobPilot. Needs feature 3 live to have applications to attach tailored resumes to.
- **Feature 6 — Master resume, canonical.** One source of truth, regenerated fresh per tailoring request; each tailored version saved as a markdown snapshot tied to its application record.
- **Feature 8, remainder.** Email/password signup as an OAuth alternative, password reset, session-expiry handling, account-settings UI.
- **Feature 9, remainder.** Spend-visibility UI, broader usage-gating polish beyond the two v1 call types.
- **Feature 10, basic.** Applications by status, response rate — both derive directly from feature 3's tracked data.
- **Feature 11 — PostHog.** Product usage analytics, kept conceptually and technically distinct from the dashboard's own computed stats (a mislabeling JobPilot's own README was caught making).
- **Feature 12, lite — Company research.** Company-level facts only (overview, tech stack, culture) — a single fetch plus one summarize call, cached with a long TTL. No agent loop, no browser-automation vendor decision needed yet. **Open flag for `/architect`:** verify a plain HTTP fetch actually retrieves usable content from real company sites before assuming this works — many are JS-rendered.
- **Feature 13, remainder.** Nested work-experience/projects (a role containing sub-projects, not flat "one row = one job" — JobPilot's data model forced a research-assistant project into looking like a fake standalone employer). Honest completeness signaling instead of a vague percentage.
- **Feature 14 — Seeded demo account.** A pre-populated account (fake profile, applications across statuses, discard history, a populated dashboard) accessible without signup, sandboxed so a visitor can't corrupt it. Solves real recruiter-demo friction — an empty freshly-signed-up account shows nothing meaningful. Needs feature 10 (basic) to exist first, since it seeds a dashboard.

---

## v2 (unchanged)

- **Feature 10, remainder.** Tailoring activity over time, discard-reason patterns — the most honest signal in the app, showing the ranking model what it's getting wrong.
- **Feature 12, full.** Role-specific synthesis tied to the actual job being viewed, an adaptive extraction loop, a grounding-verification check, and the browser-automation vendor decision made against real v2-era pricing — not tonight's numbers.
- **Fuller resume-tailoring verification loop**, beyond the numeral-only pattern.
- **A scheduled push digest** — a genuinely different interaction model from the pull-based app built so far (borrowed idea, see Reference source below).
- **A dedicated remote-jobs supplementary source**, if v1's text-heuristic remote filtering proves too weak in practice.

---

## Architecture decisions made tonight

**Backend + auth: Supabase**, decided as one combined choice (the two aren't really separable — whichever database platform is chosen usually brings its own bundled auth). Chosen over InsForge (the reference project's original backend): Supabase is a human-configured platform where the developer writes and owns RLS policies and schema by hand, which fits the full-ownership principle better than a platform explicitly built around an agent autonomously provisioning the backend. Also stronger portfolio legibility (far more production track record and name recognition than a five-person, very new competitor), and ships Postgres with `pgvector` available, keeping a low-friction path open for the deferred retrieval-tool integration without committing to it now. Confirmed: Supabase publishes an official, first-party MCP server (SQL execution, schema inspection, migrations, logs, security advisories) — the same agent-assisted debugging workflow that found the reference project's two-week outage bug is fully available here.

**AI model strategy: tiered by volume and stakes, deliberately cross-vendor.** High-volume, well-specified work uses a cheap, fast model. The low-volume self-check inside feature 2's loop uses a different, more established model **from a genuinely different vendor** than the bulk tier — not for raw capability reasons, but because using the same model for both scoring and verification defeats the point of having a check at all.

**Model client abstraction: mandatory, foundational — and deliberately kept thin.** Every AI call routes through one thin, config-driven client — tier in, response out — with the model name and provider as configuration, never hardcoded per feature. This is what makes the cross-vendor design above actually swappable later, and what makes the eval harness meaningful as a safety net when a swap happens, rather than a hopeful assumption. **Caution, per review:** at three features' worth of usage in v1, this should stay a config-driven router, not grow into a framework. Worth flagging explicitly as a place scope can quietly expand — the same failure pattern as the original fourteen-feature list, one layer down.

**Specific model choice: deliberately deferred to build time**, not decided now. This space moves fast enough that a snapshot is unreliable — during the conversation that produced this brief, one candidate model's pricing changed substantially within the span of a few messages. One live consideration for whichever model ends up in the bulk tier: weigh any known content-safety gaps given real users' personal data will flow through it — not disqualifying on its own, but worth checking rather than assuming.

**Jobs data source: Adzuna, kept (not switched) — terms checked directly, not assumed.** It already supports the structured filters feature 1 needs. The reference project's known data-quality problems (duplicate listings under different IDs, salary jitter, occasional ungrounded outlier salaries) already have concrete, coded fixes identified (content-signature dedup, salary bucketing) rather than being reasons to switch vendors.

Adzuna's own terms of service name "publishing Adzuna ad listings" as a default-permitted use, distinct from the narrower 14-day trial restriction that applies to other, unlisted uses by organizations or individuals — displaying search results to JobHunt's users falls under the permitted category. **This carries a concrete, mandatory obligation, not optional attribution:** any screen displaying Adzuna listings must show a "Jobs by Adzuna" label at least 116×23 pixels, with "Jobs" linked to adzuna.co.uk and the Adzuna logo also linked. Real UI work to fold into the design pass, not a footer credit to add later.

Default rate limits, from Adzuna's own docs: 25 hits/minute, 250/day, 1,000/week, 2,500/month — more generous than the ~1,000/month estimate used earlier, worth using these authoritative numbers when sizing feature 9's jobs-API cap. One operational rule from the same terms: creating multiple accounts to route around a single entity's rate limit is explicitly treated as misuse.

**Residual, non-blocking:** worth a direct email to Adzuna confirming this reading given the multi-user context — due diligence for a portfolio-facing product, not because the terms read unfavorably.

**Company-research vendor:** deferred entirely to v2 scoping.

**Frontend framework: Next.js, with Tailwind CSS.** Not formally decided in this document until now, but already assumed and built on throughout the design work — the landing page brief specified it explicitly, and the actual landing page component was built to be Next.js-compatible so it drops directly into the eventual codebase. Recording it here so the scope document matches what's already been acted on, rather than leaving a gap where a real deliverable exists but the decision behind it was never written down.

---

## Search lifecycle rule

Search results are **fresh per search** — nothing persists unless the user tracks (applies) or discards it (v1.5). This avoids needing a staleness/expiration state machine, since untracked results simply don't stick around.

**Known, accepted trade-off:** this doesn't deduplicate against jobs the user merely *saw* but took no action on — only against jobs explicitly applied to or discarded (v1.5, once feature 4 exists). A reference source below dedupes on "already shown"; this design doesn't, by choice, to avoid a growing seen-jobs ledger. Worth remembering this is deliberate if it resurfaces later as a complaint.

---

## Process rules (apply throughout the build)

- Every external dependency gets at least one test that actually calls it or replays a real recorded response — never a mock that encodes the same assumption as the implementation being tested.
- Anything that scores, ranks, or generates AI output needs an eval harness with expected *ranges*, not just schema validation — schema checks prove shape, not quality.
- Drive the app by hand from week one; query the real data store directly, don't just trust the UI.
- Cross-model review before merging code, and cross-vendor self-check inside the AI pipeline itself — the same principle applied at two different layers.
- No silent failures, anywhere in the app — not just AI calls. A failed fetch or a failed auth check should be visible, not swallowed into a default that looks like success.
- Store raw values in the database; format at render time. A formatted string frozen into a column can't be fixed by fixing the formatter later.
- Dedup carefully — a field included in a matching key can silently hide a real result if it's the wrong field to key on.
- No billing.
- Test fixtures never contain real personal data — obviously-fake identifiers only (e.g. `@example.invalid` addresses), even for convenience during development. JobPilot's own test-auth helper had a real personal email committed into tracked source; the fix is a rule, not a one-time cleanup.

(See Scope discipline, above, for the two rules governing what belongs in v1 itself — the completion test and the named-risk retention rule.)

---

## Reference source: a LinkedIn connection's n8n job-search workflow

Independently built automation (schedule trigger 3x/day → pulls recent postings for her target roles → GPT-4o-mini scores fit 1–10 with matched skills, gaps, salary, and visa-sponsorship signals → hard-filters below 7 → dedupes against previously-shown postings via persistent workflow storage → email digest → marks a posting "seen" only after the email actually sends successfully, not before).

**Adopted:** visa/sponsorship as an optional scoring dimension (feature 2). The "mark seen only after send succeeds" rule is independent validation of the no-silent-failures principle already in scope — arrived at separately, by someone building something unrelated.

**Considered, not adopted, with reasoning:** hard-filtering anything below a score threshold. Rejected for the same reason a hard gate was rejected for feature 5 — it risks silently hiding something that was actually worth seeing if the scoring model is even slightly miscalibrated, which the reference project's own audit showed happens easily. JobHunt shows the score and lets the user decide, consistently.

**Logged as a v2 idea, not built now:** a scheduled push digest is a genuinely different interaction model from everything else in JobHunt (which is pull-based). Worth real consideration once v1 is stable.

---

## v1 / v1.5 / v2 summary

**v1** (per the completion test: enter profile → search → ranked reasoning → apply → record): Feature 2 (primary focus), Feature 1, Feature 3, Feature 7, Feature 8 (minimal), Feature 9 (minimal, including the kill switch), Feature 13 (minimal).

**v1.5:** Feature 4, Feature 5, Feature 6, Feature 8 (remainder), Feature 9 (remainder), Feature 10 (basic), Feature 11, Feature 12 (lite), Feature 13 (remainder), Feature 14.

**v2:** Feature 10 (remainder), Feature 12 (full), the fuller resume-tailoring verification loop, a scheduled push digest, a remote-jobs supplementary source.

**Not part of any tier:** a separate retrieval tool over the author's own job-search history — a distinct, later, sequential project. Its relationship to JobHunt's now-real multi-user database is explicitly unresolved (see Open items).

---

## Open items — genuinely unresolved, not decided by omission

1. **The retrieval tool's relationship to JobHunt's database.** Originally designed to query a personal markdown corpus; JobHunt's data model is now a real multi-user Postgres database. Still unresolved.
2. **Landing page.** Resolved as an internal entry point serving three audiences (the author, friends, recruiters demoing it) rather than a public marketing page. The design pass is now done, not deferred — palette locked (seven tokens, contrast- and colorblind-verified), logo finalized (verified against its own bugs), typography locked (Space Grotesk display, JetBrains Mono for labels), and a working landing page merged through two review rounds. These are real, existing decisions for `/architect`'s design-system foundation step to inherit, not open questions for it to resolve from scratch.
3. **Exact auth configuration** within Supabase Auth (which OAuth providers beyond Google/GitHub, if any) — left to `/architect`.
4. **Specific AI model and pricing** for each tier — deliberately deferred to build time; the pattern is locked, the vendor names are not.
5. **Whether a plain HTTP fetch works for the v1.5 lite company-research feature** against real, possibly JS-rendered company sites — needs verification before assuming it.
6. **Mobile/responsive posture** — not discussed at all; even "desktop-first for v1" needs to be an explicit decision.
7. **Legal minimums** (a simple Terms/Privacy notice, given real people's resumes and personal data will be stored) — lighter-weight than a public launch given the known-audience context, but not zero, and relevant as soon as v1 ships since v1 already includes real multi-user auth.

---

## What `/scope` should NOT re-decide

Per its own stated boundaries, `/scope` doesn't pick tools or build approach — but everything in "Architecture decisions made tonight" is already decided and shouldn't be re-litigated. Treat this brief as already-answered input to `/scope`'s Step 2 questions wherever it overlaps; ask fresh only for what's genuinely still open (above) or falls outside this document (the business/monetization panel can be skipped outright — already resolved as free, no billing, non-commercial).

**On phasing:** when translating the tiers above into `/scope`'s own phasing vocabulary (Foundation / Skeleton / Slice / Deferred), v1.5 features are `planned` and sequenced immediately after the v1 loop ships — not deferred indefinitely the way v2 is.
