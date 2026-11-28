# [S] Quest usage counts escapes within a fixed window

## Goal

`quest usage` reports, for each merged PR at least N days old, whether a fix naming it under `## Caused by` opened within N days of its merge, for N of 7 and 28, counting a fix that is still open and keeping a qualifying fix that was later superseded, so an experiment's escape count does not change with how fast or in which PR a fix lands.

Non-goal: the experiments that read it, which [second-seat ablation](/quest/m0/second-seat-ablation.md), [M writer effort](/quest/m0/m-writer-effort.md), and the [advisor trigger A/B](/quest/m1/advise-trigger.md) own.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups): ✅ those experiments decide on 7-day escapes. Split out by the review of [kixel-ai/quest#988](https://github.com/kixel-ai/quest/pull/988) so each experiment can start without waiting on another's readout.

Why fixed windows: the audit measured detection lag from a culprit's merge to its fix's opening at a median of 6 days and a 75th percentile of 25 days, so an unwindowed rate undercounts recent PRs.

Decided 2026-11-28 (maintainer, review of [kixel-ai/quest#988](https://github.com/kixel-ai/quest/pull/988)): ✅ the `## Caused by` format in `assets/context/pr.md` gains a `replaces <PR URL>` field, which a fix replacing an earlier closed fix without sharing its incident must carry, and this decision authorizes that edit (rejected: counting only fixes that share an incident, which undercounts redone fixes). Coordinate the parenthesis with [Caused by severity](/quest/m0/caused-by-severity.md), which edits the same line; whichever lands second extends the other's format and `culprits()` regex.

Agent's choices, for the implementer to revisit:

- `fixBreakages()` reads only merged fixes today. Count open PRs naming a culprit in the usage metric only, by opening time: `quest send` also uploads `fixBreakages()`'s results (`src/cli/send.ts`), and a fix record there closes its incident (`src/core/breakage.ts`), so the sender keeps reading merged fixes alone.
- A fix closed unmerged counts only when a later fix replaces it, merged or open: both name the same incident, or the later one's `## Caused by` line names the earlier as the fix it replaces, such as `replaces <PR URL>`, the field decided above. The escape then takes the earlier opening, so a superseded fix keeps its date, while an abandoned one, often a regression that wasn't, adds nothing, even when a later fix names the same culprit for another regression.

Tests: a fix opened on day 6 and open at day 7 counts; a fix opened on day 6, closed on day 9, and replaced the same day still counts at day 6; a fix closed unmerged with no replacement does not count, nor does it backdate a later fix naming the same culprit for another incident; `quest send` uploads no open fix; a PR merged fewer than N days ago reports no N-day result.
