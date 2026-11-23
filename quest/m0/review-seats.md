# [L] Review seats by risk: one, two, or three vendors

## Goal

`quest review` seats one local reviewer on a low-tier head, two on medium,
and three on high, each from a different vendor, always in the order
Codex (Sol or Astra), Gemini through `agy`, then a Claude model other than
the writer's. The PR's size still sets each seat's
effort. Low-tier heads get a local review for the first time. Once these
seats find what Pullfrog finds behind them, per dollar, Pullfrog and its
required-approval ruleset retire.

Non-goals: the writers, which only Claude runs since
[moq-dev/quest#832](https://github.com/moq-dev/quest/pull/832); the shadow and Fable candidate seats, which measure and do not count
toward a tier's seats.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` follow-up of
[moq-dev/quest#826](https://github.com/moq-dev/quest/pull/826)):

- Seats per tier? ✅ 1, 2, and 3 local seats, one per vendor (rejected:
  the same counts with seats picked by eval alone, which may seat one
  vendor twice; today's counts). Counting Pullfrog, today's setup is
  already 1, 2, and 3 once [moq-dev/quest#819](https://github.com/moq-dev/quest/pull/819)
  seats Opus xhigh as a second reviewer on high heads. Pullfrog's catches
  behind a mostly-Sol pick (147 of 272 high and 148 of 549 medium merged
  PRs, 93% accepted) suggest vendor diversity is what finds them.
- Seat order? Amended 2026-11-22 (maintainer, `/quest-plan` in
  [kixel-ai/kixel.quest#104](https://github.com/kixel-ai/kixel.quest/pull/104)):
  ✅ Quest ships it, Codex, Gemini, then Claude, and "risk determines number
  of reviewers" (rejected: the order the eval ranks per tier).
- What sets each seat's model? The size's reviewer list, as
  [reviewer table](/quest/m0/reviewer-table.md) orders it, picks the model
  and effort within each vendor, as today. The tier sets how many vendors
  review, in the shipped order. An XL head that is high tier gets all
  three: Astra high, Gemini, and a Claude model other than the writer's,
  such as Opus xhigh for a Fable-written XL quest. The Claude seat never
  takes the writer's model: on an Opus-written head it is Sonnet or Fable,
  as moq-dev/quest#819 already seats Sonnet high when Opus wrote the branch.
- Pullfrog retires on evidence, as [routing evidence](/quest/m0/routing-evidence/README.md)
  records: compare what it still finds behind these seats per dollar, from
  its run logs' cost tables.

Guidance:

- Score each tier's seat order with `quest eval run` on the base's build
  and the head's, per `AGENTS.md`, and put both in `## Validation`. The
  eval set has few L and no XL cases; add the audit's XL culprits with
  `quest eval add` first.
- Each seat is a reviewer `quest review` already runs, so a seat that
  cannot run passes to the next vendor in the order, and an outage is
  every vendor out, as today.
- Dropping Pullfrog's ruleset is a change to kixel-ai/dotfiles'
  `bin/repo-settings`, not this repository; list it in the PR's
  follow-ups when the readout recommends it.

## Required

- [Gemini reviewer](/quest/m0/gemini-reviewer.md) - the `agy` harness the Gemini seat runs on
