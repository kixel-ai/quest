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
[kixel-ai/quest#832](https://github.com/kixel-ai/quest/pull/832); the shadow and Fable candidate seats, which measure and do not count
toward a tier's seats.

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
- What sets each seat's model? The size's reviewer list, as
  [reviewer table](/quest/m0/reviewer-table.md) orders it, picks the model
  and effort within each vendor, as today. The tier sets how many vendors
  review, in the shipped order. An XL head that is high tier gets all
  three: Astra high, Gemini, and a Claude model other than the writer's,
  such as Opus xhigh for a Fable-written XL quest. The Claude seat never
  takes the writer's model: on an Opus-written head it is Fable, as
  kixel-ai/quest#819's interim second seat is on a high head.
- ✅ No seat is ever weaker than the latest writer, at every size and tier
  (maintainer, 2026-11-22, on
  [kixel-ai/quest#819](https://github.com/kixel-ai/quest/pull/819#issuecomment-7087183777):
  "don't have sonnet review opus, that's extremely dumb"; rejected: high
  risk only). Sonnet is weaker than every other model and never reviews its
  own work, so it reviews nothing, and Sol is weaker than Fable and Astra. kixel-ai/quest#819
  puts the rule in `weaker()` in `src/cli/models.ts`. Its high-tier second
  seat is interim: the reviewer rungs quest that
  [kixel-ai/quest#831](https://github.com/kixel-ai/quest/pull/831) adds draws
  each round's seats from rungs instead of fixed per-vendor models, while the
  tier still sets how many seats run.
- Pullfrog retires on evidence, as [routing evidence](/quest/m0/routing-evidence/README.md)
  records: compare what it still finds behind these seats per dollar, from
  its run logs' cost tables.

Guidance:

- Judge the seats from real PRs once they land, as the
  [root plan](/quest/README.md) decided on 2026-11-23: `quest usage`'s
  findings, share fixed, and cost per seat, and the `## Caused by`
  escapes it lists against each culprit's reviewers, by tier.
- Each seat is a reviewer `quest review` already runs, so a seat that
  cannot run passes to the next vendor in the order, and an outage is
  every vendor out, as today.
- Dropping Pullfrog's ruleset is a change to kixel-ai/dotfiles'
  `bin/repo-settings`, not this repository; list it in the PR's
  follow-ups when the readout recommends it.
