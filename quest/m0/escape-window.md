# [S] Quest usage counts escapes within a fixed window

## Goal

`quest usage` reports, for each merged PR at least N days old, whether a fix naming it under `## Caused by` opened within N days of its merge, for N of 7 and 28, counting a fix that is still open and keeping a qualifying fix that was later superseded, so an experiment's escape count does not change with how fast or in which PR a fix lands.

Non-goal: the experiments that read it, which [second-seat ablation](/quest/m0/second-seat-ablation.md), [M writer effort](/quest/m0/m-writer-effort.md), and the [advisor trigger A/B](/quest/m1/advise-trigger.md) own.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups): ✅ those experiments decide on 7-day escapes. Split out by the review of [kixel-ai/quest#988](https://github.com/kixel-ai/quest/pull/988) so each experiment can start without waiting on another's readout.

Why fixed windows: the audit measured detection lag from a culprit's merge to its fix's opening at a median of 6 days and a 75th percentile of 25 days, so an unwindowed rate undercounts recent PRs.

Agent's choices, for the implementer to revisit:

- `fixBreakages()` reads only merged fixes today. Also read open PRs naming a culprit, by opening time.
- A fix closed unmerged counts only when a later fix naming the same culprit merged or is open, and the culprit's escape takes the earliest opening among them, so a superseded fix keeps its date and an abandoned one, often a regression that wasn't, adds nothing.

Tests: a fix opened on day 6 and open at day 7 counts; a fix opened on day 6, closed on day 9, and replaced the same day still counts at day 6; a fix closed unmerged with no replacement does not count; a PR merged fewer than N days ago reports no N-day result.
