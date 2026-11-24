# [S] Date-gated recurring quests leave their milestone

## Goal

`/quest-plan`'s guidance for recurring work no longer plans a run that keeps its milestone from finishing.

## Plan

Found 2026-11-23 by the review of [kixel-ai/quest#852](https://github.com/kixel-ai/quest/pull/852): `assets/skills/plan.md` says a run "gated only by its date can return to the same path", but `finishedMilestone` (`src/core/rules.ts`) counts a milestone finished only once it holds no quest, so a run that always returns keeps it open forever, and every audit stub requiring it waits.
The maintainer settled the same question for the instructions audit as "do the same as the other audits. I'm fine with n+1" (rejected: teaching `finishedMilestone` to skip date-recurring stubs).

Recommended: delete that clause, so every recurring run goes to the next milestone, with its date in `## Scheduled`.
