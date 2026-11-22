# [M] Risk buys review, not CI

## Goal

A PR's risk tier scales its local review and approval, never the CI it runs: every tier runs the checks its diff reaches, and a high PR gets stronger review instead of the full suite.
`RISK.md`'s `## Full suite`, `quest suite`, and every README and skill line asking for a high PR's full-suite result are gone.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` from kixel-ai/kixel.quest's run), reversing [moq-dev/quest#802](https://github.com/moq-dev/quest/pull/802)'s full suite for high: ✅ the tier scales review and approval only (rejected: keeping the suite opt-in, which leaves code with no automatic consumer). CPU on the maintainer's hosts is the scarce resource, and the next commit's CI or the nightly run catches what the gate's scoped checks miss.

- ✅ A high PR gets two local reviewers on different models, both at the top entry of the review ranking `quest models` prints rather than the size's pick (rejected: the size's pick plus a second reviewer, which replaces the suite with nothing; three reviewers, which mostly repeat the first two at full token cost).
- ✅ Medium keeps one reviewer at the size's pick (rejected: a second reviewer, since medium is the default for every repository without a `RISK.md`; revisit once the factory report shows medium PRs causing breakage). Low is unchanged.
- Delete `src/cli/suite.ts`, its command and test, the `suite` field and `## Full suite` section in `src/core/risk.ts`'s risk-file parser (a base listing the section then fails as an unknown section, like any other), and the README's Full suite and Run the full suite sections and the CI column's high row.
- The maintainer asked for this work, which covers the `assets/skills/` edits it needs, such as `run.md`'s "both reviews and the full suite's result".
- Changing how `src/cli/review.ts` routes a high head's reviewers falls under `AGENTS.md`'s `quest eval run` rule: put both builds' scores and cost in `## Validation`.

Tests: a high head seats two reviewers on different models from the ranking's top entries, whatever its size; a medium head one at the size's pick; and a `RISK.md` with `## Full suite` is refused.
