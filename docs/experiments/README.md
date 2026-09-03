# Experiments

Probes run to answer a specific question, with the exact command and the exact
answer. One file per feature, named for its spec.

This is not the verification checklist. `verify.md` beside each spec says what
must be true for an acceptance criterion to hold, and is meant to be re run.
These files say what was actually asked, of what, on what date, and what came
back, including the probes that answered something other than the question they
were pointed at.

Why keep them separate from the spec. A spec records a decision and a
verification file records a contract, but neither has room for the reasoning that
found a wrong assumption, and that reasoning is usually the expensive part. A
result here is evidence, tied to a date and an environment. If the environment
changes, the result is history rather than a fact, so every entry says which
database or deployment it ran against.

Read a result together with its question. A probe pointed at the wrong
environment returns a perfectly real number about the wrong thing, which is a
failure mode this project has already met once and recorded below.

| File | Feature |
|---|---|
| [0002-deployment-and-environments.md](0002-deployment-and-environments.md) | Deployment and environments |
| [0011-usage-gating-and-kill-switch.md](0011-usage-gating-and-kill-switch.md) | Usage gating and kill switch |
