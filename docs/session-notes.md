# Session notes

Short lived context that does not belong in scope, a spec, or AGENTS.md yet.
Written by /checkpoint save, read by /checkpoint restore.

## Open threads

- **How to drive a Server Action with no browser, worth keeping for feature 8.** Fetch the page, read the hidden fields React renders on the form (`$ACTION_REF_1`, `$ACTION_1:0` carrying the action id, `$ACTION_1:1`, `$ACTION_KEY`), then post those plus the real form fields as multipart to the same route. A `303` with the session cookie means it ran. The `Next-Action` header path is fiddlier and silently loses the form fields. Action ids come from `.next/server/server-reference-manifest.json`, and **an id is only valid for a build made at that same directory path**, so an id read locally is the wrong id on Vercel. Feature 8 wants a session without a browser, and this is that path.

## Ruled out

- **Switching off Supabase's Data API for about a minute**, on a project that was not identified afterward, considered as the cause of the escalating `database_unavailable` issue on production. Rejected: the specific error, a Postgres grant hint naming the `anon` role on one table, does not match what a disabled Data API would produce, and the timing does not clearly line up.

## Standing instructions

- The Vercel CLI **is** usable in this environment (version 59.3.0, project already linked), and `vercel env ls`, `vercel env pull`, `vercel inspect` and `vercel project inspect` all worked on 2026-08-22. Corrects an earlier note here saying nothing could read Vercel state. Two limits remain: the Vercel MCP server is still unauthorised, and a variable marked Sensitive (both `SUPABASE_SECRET_KEY` values, `SENTRY_AUTH_TOKEN`) pulls as `[SENSITIVE]`, so its value can never be compared or exercised from here. Ask the engineer for anything behind those two limits.
- The permission classifier that can block a merge does not fire every time. On 2026-08-23, `gh pr merge` was blocked once, for PR 5, and the engineer had to run it by hand. The very same command then went through with no block at all for PR 6, PR 7, and PR 8, and a `vercel promote` call also went through unblocked. So a merge or a promote may or may not be stopped, there is no way to know in advance, and the block is not something to route around if it does fire. Keep asking the engineer to confirm before every merge exactly as AGENTS.md's Git section already requires, whether or not the classifier ends up blocking that particular attempt.
