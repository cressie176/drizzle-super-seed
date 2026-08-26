# Claude Code: drizzle-super-seed

Test data generator for Drizzle ORM schemas. Development history, decisions and their
reasoning live in the closed GitHub issues; the architecture, code conventions, testing
conventions and reproducibility discipline live in [CONTRIBUTING.md](CONTRIBUTING.md), which
is binding. The notes below are what a session needs beyond it.

## How to work

- **Acceptance criteria are the definition of done.** Every behaviour change is demonstrated
  by a test that would fail if it regressed. Do not weaken, skip or delete an existing test
  to get a new one passing; when a test asserts behaviour a decision has overruled, replace
  it and say so.
- **Test-first where it bites**: escaping rules, error contracts and refusals are written as
  failing tests before the code exists.
- **Verify load-bearing claims empirically.** Probe the database, break the code and watch
  the test fail, read the installed dependency's declarations. A "cannot" without a probe or
  a named mechanism is probably a "chose not to": present those as decisions with the
  alternative sketched, so the maintainer can overrule cheaply.
- **Finish cleanly**: the gates in CONTRIBUTING.md all green, one commit per issue or
  coherent change, message explaining why rather than what. Track work in GitHub issues and
  close each with a comment recording what was decided and what evidence settled it.

## When to stop and ask the maintainer

Stop and report, rather than silently deviating, when an acceptance criterion is impossible
or contradicts documented behaviour, when the installed drizzle-orm behaves differently from
what the code assumes, or when a production dependency seems warranted. A short note stating
the conflict, the options and your recommendation is the deliverable, not a workaround.

## Dependencies

Zero production dependencies; drizzle-orm is a peer dependency. This is a deliberate stance
on maintenance and supply-chain risk. Estimate the hand-rolled size before reaching for a
library, and propose rather than add when it is genuinely large and subtle. Dev dependency
changes need the maintainer's agreement.
