# Session notes

Short lived context that does not belong in scope, a spec, or AGENTS.md yet.
Written by /checkpoint save, read by /checkpoint restore.

## Open threads

- **How to drive a Server Action with no browser, worth keeping for feature 8.** Fetch the page, read the hidden fields React renders on the form (`$ACTION_REF_1`, `$ACTION_1:0` carrying the action id, `$ACTION_1:1`, `$ACTION_KEY`), then post those plus the real form fields as multipart to the same route. A `303` with the session cookie means it ran. The `Next-Action` header path is fiddlier and silently loses the form fields. Action ids come from `.next/server/server-reference-manifest.json`, and **an id is only valid for a build made at that same directory path**, so an id read locally is the wrong id on Vercel. Feature 8 wants a session without a browser, and this is that path.
- **Spec 0002's verify pass has real progress today but is not closed, and none of it is written into `verify.md` yet.** The escalating `database_unavailable` bug (Sentry JOBHUNT 1) is fully resolved: root caused (a redirect in a Next.js 16.3.1 layout does not stop the page below it from rendering concurrently, so its side effects still ran), fixed in `queries.ts` (verifies its own session first, reports `session_missing` at expected severity instead), reviewed, merged as PR 3 (commit `3c1c54f4b368`), deployed, and verified live with a clean `session_missing` event and no growth in the old issue. AC-11's failing migration test and AC-12's direct push refusal are also confirmed with real evidence, and AC-2, AC-6, AC-13, AC-14 (production side), AC-15, and AC-16 all have real confirmations from today. Still owed: the required check addition (after confirming Actions secrets), the AC-18 recovery drill (now unblocked with a clean baseline), AC-14's preview side sampling, the sign in POST step rewrite already recommended, and above all one consolidated write up pass folding all of this into `verify.md`, which currently reflects only the diff from before this session started.

## Ruled out

- **Switching off Supabase's Data API for about a minute**, on a project that was not identified afterward, considered as the cause of the escalating `database_unavailable` issue on production. Rejected: the specific error, a Postgres grant hint naming the `anon` role on one table, does not match what a disabled Data API would produce, and the timing does not clearly line up.

## Standing instructions

- The Vercel CLI **is** usable in this environment (version 59.3.0, project already linked), and `vercel env ls`, `vercel env pull`, `vercel inspect` and `vercel project inspect` all worked on 2026-08-22. Corrects an earlier note here saying nothing could read Vercel state. Two limits remain: the Vercel MCP server is still unauthorised, and a variable marked Sensitive (both `SUPABASE_SECRET_KEY` values, `SENTRY_AUTH_TOKEN`) pulls as `[SENSITIVE]`, so its value can never be compared or exercised from here. Ask the engineer for anything behind those two limits.
