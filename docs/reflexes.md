# Reflexes

## Reflexes

- When about to run /develop, read the governing spec's prerequisites and confirm each account, project, and credential it names already exists, because the spec gate only asks whether a decision is owed. (added 2026 08 21)
- When about to run a git command that discards working tree state (`reset --hard`, `checkout --`, `clean -f`, `restore`), read the full `git status` output first and account for every uncommitted file it shows, not just the one the command is meant to affect, because a hard reset touches the whole tree even when its stated purpose is narrow. (added 2026 08 23)
- When ratifying a feature linked spec, leave its Status line alone (Proposed or whatever /develop already set), because only /develop advances that line, and only to Accepted once the feature's scope row is done. (added 2026 08 26)
- When recommending an answer to a multi option decision panel (architect, develop, or similar), say whether the answer needs a note attached before being asked, because the panel's option wording alone often drops context worth keeping. (added 2026 08 26)
- When a feature is marked done, grep docs/scope/scope.md for other features whose skipped or deferred boxes name it by number, because a feature that just shipped can unblock a step recorded elsewhere as waiting on it. (added 2026 08 27)
- When citing an identifier (commit SHA, pull request number, spec ID, acceptance criterion, issue number), include what it refers to in the same breath, for example `5779d91` (the orphaned "mark it done" commit) and not the bare SHA, because a reference the reader has to resolve elsewhere does not survive the conversation. (added 2026 08 27)
