# [L] Review seats by risk: one, two, or three vendors

## Goal

`quest review` seats one local reviewer on a low-tier head, two on medium,
and three on high, each from a different vendor, each drawn from the
round's [reviewer rung](/quest/m0/reviewer-rungs.md), or the rungs outward
from the size's when it is short of vendors that can run, with Gemini through
`agy` among the vendors and never the writer's model. Low-tier heads get a
local review for the first time. Once these seats find what Pullfrog finds
behind them, per dollar, Pullfrog and its required-approval ruleset retire.

Non-goals: the writers, which only Claude runs since
[kixel-ai/quest#832](https://github.com/kixel-ai/quest/pull/832); the rungs
and their draw, which [reviewer rungs](/quest/m0/reviewer-rungs.md) builds.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` follow-up of
[kixel-ai/quest#826](https://github.com/kixel-ai/quest/pull/826)):

- Seats per tier? ✅ 1, 2, and 3 local seats, one per vendor (rejected:
  the same counts with seats picked by eval alone, which may seat one
  vendor twice; today's counts). Counting Pullfrog, today's setup is
  already 1, 2, and 3 once [kixel-ai/quest#819](https://github.com/kixel-ai/quest/pull/819)
  seats a second reviewer from another vendor on high heads. Pullfrog's catches
  behind a mostly-Sol pick (147 of 272 high and 148 of 549 medium merged
  PRs, 93% accepted) suggest vendor diversity is what finds them.
- Seat order? Amended 2026-11-22 (maintainer, `/quest-plan` in
  [kixel-ai/kixel.quest#104](https://github.com/kixel-ai/kixel.quest/pull/104)):
  ✅ Quest ships it, Codex, Gemini, then Claude, and "risk determines number
  of reviewers" (rejected: the order the eval ranks per tier).
  Amended 2026-11-23 (maintainer, `/quest-run` on
  [kixel-ai/quest#831](https://github.com/kixel-ai/quest/pull/831#issuecomment-7111249892)):
  ✅ no fixed order; the tier still sets 1, 2, or 3 seats per round, and
  each seat draws from the round's rung, on distinct vendors within a round
  (rejected: keep the fixed Codex, Gemini, Claude order; one seat and drop
  this quest).
- What sets each seat's model? The round's rung, as
  [reviewer rungs](/quest/m0/reviewer-rungs.md) draws it: each seat takes a
  model from it that the PR has not had yet, never the writer's, on a
  vendor no other seat that round has. An XL head that is high tier gets
  three vendors, such as Astra, Gemini, and a Claude model other than the
  writer's. Reviewer rungs places Neon only on the M and L rungs, so at XS,
  S, and XL the Gemini seat normally fills from the nearest rung outward, as
  the Guidance recommends.
- ✅ No seat is ever weaker than the latest writer, at every size and tier
  (maintainer, 2026-11-22, on
  [kixel-ai/quest#819](https://github.com/kixel-ai/quest/pull/819#issuecomment-7087183777):
  "don't have sonnet review opus, that's extremely dumb"; rejected: high
  risk only). Interim: #819's `weaker()` and high-tier second seat route
  reviews until [reviewer rungs](/quest/m0/reviewer-rungs.md) lands, which
  drops the rule under rungs and deletes this line.
- Pullfrog retires on evidence, as [routing evidence](/quest/m0/routing-evidence/README.md)
  records: compare what it still finds behind these seats per dollar, from
  its run logs' cost tables.

Guidance:

- Judge the seats from real PRs once they land, as the
  [root plan](/quest/README.md) decided on 2026-11-23: `quest usage`'s
  findings, share fixed, and cost per seat, and the `## Caused by`
  escapes it lists against each culprit's reviewers, by tier.
- Each seat is a reviewer `quest review` already runs, so a seat that
  cannot run passes to another vendor on the round's rung. Recommended:
  when the drawn rung has too few vendors that can run, such as when
  Gemini is out or the rung's only Claude model wrote the head, fill the
  missing seats from the size's rung, then each rung outward from it in
  turn. The round is an outage once a seat its tier needs finds no
  distinct vendor on any rung, which includes every vendor being out.
- Dropping Pullfrog's ruleset is a change to kixel-ai/dotfiles'
  `bin/repo-settings`, not this repository; list it in the PR's
  follow-ups when the readout recommends it.

## Required

- [Reviewer rungs](/quest/m0/reviewer-rungs.md) - the per-round rung draw each seat takes its model from
- [Gemini reviewer](/quest/m0/gemini-reviewer.md) - the `agy` harness the Gemini seat runs on
