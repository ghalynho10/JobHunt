# Reflexes

## Reflexes

- When recommending anything about something that already exists, read it first and name what you read: a file, migration, config, or current behaviour in the repo, and the vendor's own docs for limits, terms, API shape, or version outside it. Mark each substantive claim verified (naming the file or source) or inferred, and when you cannot verify something that matters, say what you would need rather than filling the gap. (added 2026 08 21)
- When about to run /develop, read the governing spec's prerequisites and confirm each account, project, and credential it names already exists, because the spec gate only asks whether a decision is owed. (added 2026 08 21)
- When beginning a multi step skill, confirm the engineer agreed to that specific action rather than to a summary or a suggestion in passing. (added 2026 08 21)
- When about to run a git command that discards working tree state (`reset --hard`, `checkout --`, `clean -f`, `restore`), read the full `git status` output first and account for every uncommitted file it shows, not just the one the command is meant to affect, because a hard reset touches the whole tree even when its stated purpose is narrow. (added 2026 08 23)
- When ratifying a feature linked spec, leave its Status line alone (Proposed or whatever /develop already set), because only /develop advances that line, and only to Accepted once the feature's scope row is done. (added 2026 08 26)
- When recommending an answer to a multi option decision panel (architect, develop, or similar), say whether the answer needs a note attached before being asked, because the panel's option wording alone often drops context worth keeping. (added 2026 08 26)
