# [S] A review-only handback keeps the land fixer's history

## Goal

A PR the land watcher hands back as `unreviewed` (a high head no `quest
review` status covers, usually the fixer's own push) and that `/quest-run`
re-enqueues after a clean review keeps its pick's fixer history, so a queue
failure that recurs after that fixer round trips the repeated-failure rule and
reaches the maintainer instead of looping through fixer, review, and queue
build unattended.

## Plan

Found by the [v0.27–v0.29 re-review](https://github.com/kixel-ai/quest/pull/989),
replaying [kixel-ai/quest#905](https://github.com/kixel-ai/quest/pull/905)
(Codex gpt-6.2-sol xhigh) and verified on main at `55f254d49`.

- Today every handback ends the pick with a `handback` round
  (`src/cli/land-watch-fix.ts`, after the fixer runs), `requeuedHeads` then
  stops continuing it, and the next enqueue's new `enabledAt` starts empty
  history, so `repeated` never sees the earlier round.
- Recommended: record an `unreviewed` handback as a pause rather than an end,
  and continue the pick's history when the same head it handed back is
  enqueued again after review; any other head still starts a new pick.
- `assets/skills/run.md` already re-enqueues only when the review pushed
  nothing, so the skill needs no change.

Tests: a fixer round, an `unreviewed` handback, a re-enqueue of the same head,
and the same failure again end in a `repeated` handback to the maintainer.
