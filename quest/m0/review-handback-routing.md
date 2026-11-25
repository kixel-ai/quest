# [S] A handback that needs only a review dispatches one

## Goal

When the land watcher hands back a high head only because no `quest review`
status covers its new diff, `quest status` reports that as its own
`landing-stopped` reason. `/quest-run` then dispatches `/quest-review` on the
PR instead of asking the maintainer for a decision.

## Plan

Today the handback's marker keeps the queue's reason (`failed_checks` or
`merge_conflict`), and only the comment's text recommends `/quest-review`
(`src/cli/land-watch-fix.ts`, `job.unreviewed`).

- Add an `unreviewed` value to the `Reason` that `src/github/land.ts` marks and
  `quest status` prints, and emit it when `job.unreviewed` is set, as
  `job.signaled` emits `unanswered_signal`.
- Have `/quest-run` (`assets/skills/run.md`) dispatch `/quest-review` for that
  reason before asking for another pick.

A new value in an existing record is high under RISK.md, since readers parse
it: check the forge's `landing-stopped` shape in `src/core/forge.ts` accepts it.
