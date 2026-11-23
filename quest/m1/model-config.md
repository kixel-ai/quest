# [L] Accepted models per size, picked by the user's config

## Goal

For each quest size XS to XL, `quest` ships the writer and reviewer models it
accepts, each at a minimum effort, and reads which of them to run, and in
what order, from the user's config. `quest models`, `quest unblocked --json`,
and `quest review` route by that config, and refuse a config naming a model
off a size's list or below its minimum effort. With no config, a writer is
the first accepted entry the installed harnesses can run, and a reviewer the
first that can run and is not the latest writer's model, the rule
`quest review` follows today. The maintainer's
current tables and writer A/B arms live in their config, which
kixel-ai/dotfiles writes, not in `src/cli/models.ts`.

Non-goals: which models the maintainer picks, which
[routing evidence](/quest/m0/routing-evidence/README.md) and its quests
settle; harnesses `quest` does not run yet.

## Plan

Decided 2026-11-22 (maintainer, the session that planned
[moq-dev/quest#826](https://github.com/moq-dev/quest/pull/826)), amending
kixel-ai/kixel.quest's 2026-11-21 decision to move model routing out
entirely: ✅ per-size writer and reviewer lists with minimum efforts, the
user's config picking among them (rejected: lists per reasoning effort,
sizes mapped in config; moving routing out entirely). The root
[quests README](/quest/README.md) records it.

Guidance:

- Seed each list from the models the routing evidence has measured
  well at that size. Keep a model off a size's list rather than below its
  minimum where the evidence shows it fails there, such as Opus medium at M.
- Config is the user's, never the checkout's, so a branch cannot change
  which model reviews it.
- Land this after [writer table](https://github.com/moq-dev/quest/pull/829),
  [reviewer table](/quest/m0/reviewer-table.md),
  [Claude writers](https://github.com/moq-dev/quest/pull/832), and
  [review seats](/quest/m0/review-seats.md), whose tables become the
  maintainer's first config.
